-- Migration: 20260718_video_transcription_integrity_corrections.sql
-- Description: Improve idempotency checks using SHA-256 hash, and enforce job-authoritative approval conflict checks.

create or replace function public.create_manual_transcription_import_job(
  p_guide_id uuid,
  p_source_asset_id uuid,
  p_request_id uuid,
  p_transcript_json jsonb
)
returns public.video_transcription_jobs as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_account_id uuid;
  v_base_revision integer;
  v_expected_fingerprint text;
  v_existing public.video_transcription_jobs;
  v_has_active boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if not public.can_edit_video_editor_guide(p_guide_id) then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select account_id into v_account_id from public.courses where id = p_guide_id;
  if not exists (
    select 1 from public.video_source_assets
    where id = p_source_asset_id and guide_id = p_guide_id
  ) then
    raise exception 'TRANSCRIPTION_SOURCE_MISMATCH: Source asset does not belong to the guide' using errcode = '22000';
  end if;

  if pg_catalog.octet_length(p_transcript_json::text) > 1048576 then
    raise exception 'TRANSCRIPTION_INVALID: JSON payload exceeds maximum limit of 1 MB' using errcode = '22000';
  end if;

  -- Shared Validator Check BEFORE inserting the job
  perform public.validate_video_source_transcript_internal(p_source_asset_id, p_transcript_json);

  select revision into v_base_revision from public.video_source_transcripts
  where source_asset_id = p_source_asset_id;

  v_expected_fingerprint := p_guide_id::text || ':' || p_source_asset_id::text || ':manual_import:manual_import:' || coalesce(v_base_revision::text, 'null') || ':' || pg_catalog.encode(extensions.digest(p_transcript_json::text, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_source_asset_id::text));

  select * into v_existing from public.video_transcription_jobs where request_id = p_request_id;
  if found then
    if v_existing.request_fingerprint = v_expected_fingerprint then
      return v_existing;
    else
      raise exception 'TRANSCRIPTION_REQUEST_MISMATCH: request_id already exists with different parameters' using errcode = '22000';
    end if;
  end if;

  select exists (
    select 1 from public.video_transcription_jobs
    where source_asset_id = p_source_asset_id
      and status in ('queued', 'extracting_audio', 'transcribing', 'validating', 'awaiting_approval')
  ) into v_has_active;

  if v_has_active then
    raise exception 'TRANSCRIPTION_ACTIVE_JOB_CONFLICT: An active job already exists for this source asset' using errcode = '22000';
  end if;

  insert into public.video_transcription_jobs (
    account_id,
    guide_id,
    source_asset_id,
    request_id,
    request_fingerprint,
    provider,
    provider_model,
    status,
    progress_stage,
    base_transcript_revision,
    result_transcript_json,
    created_by,
    created_at,
    updated_at
  ) values (
    v_account_id,
    p_guide_id,
    p_source_asset_id,
    p_request_id,
    v_expected_fingerprint,
    'manual_import',
    'manual_import',
    'awaiting_approval',
    'ready_for_review',
    v_base_revision,
    p_transcript_json,
    v_user_id,
    clock_timestamp(),
    clock_timestamp()
  ) returning * into v_existing;

  return v_existing;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.create_manual_transcription_import_job(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_manual_transcription_import_job(uuid, uuid, uuid, jsonb) to authenticated;


create or replace function public.approve_video_transcription_job(
  p_job_id uuid,
  p_expected_transcript_revision integer
)
returns public.video_transcription_jobs as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_job public.video_transcription_jobs;
  v_now timestamptz;
  v_current_revision integer;
  v_upsert_res public.video_source_transcripts;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_job from public.video_transcription_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'TRANSCRIPTION_JOB_NOT_FOUND' using errcode = '22000';
  end if;

  if not public.can_edit_video_editor_guide(v_job.guide_id) then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if v_job.status <> 'awaiting_approval' then
    raise exception 'TRANSCRIPTION_ILLEGAL_STATE: Only jobs awaiting approval can be approved' using errcode = '22000';
  end if;

  if v_job.result_transcript_json is null then
    raise exception 'TRANSCRIPTION_INVALID: Result transcript is missing' using errcode = '22000';
  end if;

  -- Revalidate at approval time before persisting
  perform public.validate_video_source_transcript_internal(v_job.source_asset_id, v_job.result_transcript_json);

  select revision into v_current_revision from public.video_source_transcripts
  where source_asset_id = v_job.source_asset_id;

  -- Authoritative base-revision conflict checks
  if v_current_revision is distinct from v_job.base_transcript_revision then
    raise exception
      'TRANSCRIPTION_APPROVAL_CONFLICT: The active transcript revision changed after job creation'
      using errcode = '22000';
  end if;

  if p_expected_transcript_revision is distinct from v_job.base_transcript_revision then
    raise exception
      'TRANSCRIPTION_APPROVAL_CONFLICT: The supplied revision does not match the job base revision'
      using errcode = '22000';
  end if;

  select * into v_upsert_res from public.upsert_video_source_transcript(
    v_job.guide_id,
    v_job.source_asset_id,
    v_job.result_transcript_json
  );

  v_now := clock_timestamp();

  update public.video_transcription_jobs
  set status = 'completed',
      result_transcript_revision = v_upsert_res.revision,
      approved_by = v_user_id,
      approved_at = v_now,
      completed_at = v_now,
      updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.approve_video_transcription_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.approve_video_transcription_job(uuid, integer) to authenticated;
