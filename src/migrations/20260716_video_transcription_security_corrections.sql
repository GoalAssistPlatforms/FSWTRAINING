-- Migration: Video Transcription Security Corrections
-- Date: 2026-07-16
-- Package: 06A Corrections

-- 1. Create Rate Limit Events Table
create table if not exists public.transcription_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null,
  guide_id uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);

-- Enable RLS & Revoke direct browser permissions
alter table public.transcription_rate_limit_events enable row level security;
revoke all on table public.transcription_rate_limit_events from public, anon, authenticated;

-- Create Indexes
create index idx_rate_limit_events_query on public.transcription_rate_limit_events(user_id, guide_id, created_at);
create index transcription_rate_limit_events_created_at_idx on public.transcription_rate_limit_events(created_at);

-- 2. Implement Rate Limit Check & Record Function
create or replace function public.check_and_record_transcription_rate_limit(
  p_guide_id uuid,
  p_request_id uuid,
  out allowed boolean,
  out remaining integer,
  out retry_after_seconds integer
) as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_count integer;
  v_idempotent_count integer;
  v_now timestamptz;
begin
  -- Validate authenticated user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  -- Validate user may edit the guide
  if not public.can_edit_video_editor_guide(p_guide_id) then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  v_now := clock_timestamp();

  -- Global 24-hour retention cleanup
  delete from public.transcription_rate_limit_events
  where created_at < v_now - interval '24 hours';

  -- Acquire transaction-level advisory lock scoped to user and guide
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_user_id::text), pg_catalog.hashtext(p_guide_id::text));

  -- Check for existing idempotent request_id
  select count(*) into v_idempotent_count
  from public.transcription_rate_limit_events
  where request_id = p_request_id;

  if v_idempotent_count > 0 then
    -- Repeated request identifier returns previous state idempotently
    select count(*) into v_count
    from public.transcription_rate_limit_events
    where user_id = v_user_id
      and guide_id = p_guide_id
      and created_at > v_now - interval '10 minutes';

    allowed := true;
    remaining := greatest(0, 5 - v_count);
    retry_after_seconds := 0;
    return;
  end if;

  -- Count requests in last 10 minutes
  select count(*) into v_count
  from public.transcription_rate_limit_events
  where user_id = v_user_id
    and guide_id = p_guide_id
    and created_at > v_now - interval '10 minutes';

  if v_count >= 5 then
    allowed := false;
    remaining := 0;
    select ceiling(extract(epoch from (min(created_at) + interval '10 minutes' - v_now)))
    into retry_after_seconds
    from public.transcription_rate_limit_events
    where user_id = v_user_id
      and guide_id = p_guide_id
      and created_at > v_now - interval '10 minutes';

    -- In case of rounding edge, ensure retry is at least 1 second
    if retry_after_seconds <= 0 then
      retry_after_seconds := 1;
    end if;
  else
    -- Permitted request: insert event
    insert into public.transcription_rate_limit_events (request_id, user_id, guide_id, created_at)
    values (p_request_id, v_user_id, p_guide_id, v_now);

    allowed := true;
    remaining := 5 - (v_count + 1);
    retry_after_seconds := 0;
  end if;
end;
$$ language plpgsql security definer set search_path = '';

-- Revoke PUBLIC/anon access, grant to authenticated only
revoke all on function public.check_and_record_transcription_rate_limit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_and_record_transcription_rate_limit(uuid, uuid) to authenticated;

-- 3. Replace Manual Import Job Function to Enforce Constraint
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
  v_auth_duration numeric;
begin
  -- Authenticate & authorize
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if not public.can_edit_video_editor_guide(p_guide_id) then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  -- Validate guide owns source asset
  select account_id into v_account_id from public.courses where id = p_guide_id;
  if not exists (
    select 1 from public.video_source_assets
    where id = p_source_asset_id and guide_id = p_guide_id
  ) then
    raise exception 'TRANSCRIPTION_SOURCE_MISMATCH: Source asset does not belong to the guide' using errcode = '22000';
  end if;

  -- Verify duration exists
  select duration_seconds into v_auth_duration from public.video_source_assets
  where id = p_source_asset_id;
  if v_auth_duration is null then
    raise exception 'TRANSCRIPTION_SOURCE_DURATION_ERROR: Source asset duration is missing' using errcode = '22000';
  end if;

  -- Verify JSON payload size (1 MB limit)
  if pg_catalog.octet_length(p_transcript_json::text) > 1048576 then
    raise exception 'TRANSCRIPTION_INVALID: JSON payload exceeds maximum limit of 1 MB' using errcode = '22000';
  end if;

  -- Run Package 05 validation check
  if pg_catalog.abs((p_transcript_json->>'duration')::numeric - v_auth_duration) > 0.001 then
    raise exception 'TRANSCRIPTION_INVALID: duration mismatch' using errcode = '22000';
  end if;

  -- Get current transcript revision
  select revision into v_base_revision from public.video_source_transcripts
  where source_asset_id = p_source_asset_id;

  -- Compute fingerprint
  v_expected_fingerprint := p_guide_id::text || ':' || p_source_asset_id::text || ':manual_import:manual_import:' || coalesce(v_base_revision::text, 'null');

  -- Acquire xact advisory lock
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_source_asset_id::text));

  -- Idempotency check
  select * into v_existing from public.video_transcription_jobs where request_id = p_request_id;
  if found then
    if v_existing.request_fingerprint = v_expected_fingerprint then
      return v_existing;
    else
      raise exception 'TRANSCRIPTION_REQUEST_MISMATCH: request_id already exists with different parameters' using errcode = '22000';
    end if;
  end if;

  -- Verify no active job exists
  select exists (
    select 1 from public.video_transcription_jobs
    where source_asset_id = p_source_asset_id
      and status in ('queued', 'extracting_audio', 'transcribing', 'validating', 'awaiting_approval')
  ) into v_has_active;

  if v_has_active then
    raise exception 'TRANSCRIPTION_ACTIVE_JOB_CONFLICT: An active job already exists for this source asset' using errcode = '22000';
  end if;

  -- Insert directly into awaiting_approval (manual import creates no worker attempts)
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
