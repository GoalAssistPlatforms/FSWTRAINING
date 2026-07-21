-- Migration: Video Transcription Functional Corrections
-- Date: 2026-07-17
-- Package: 06A Functional Corrections

-- 1. Create Internal Shared Validator Function
create or replace function public.validate_video_source_transcript_internal(
  p_source_asset_id uuid,
  p_transcript_json jsonb
)
returns void as $$
declare
  v_auth_duration numeric;
  v_schema_version integer;
  v_language text;
  v_duration numeric;
  v_words jsonb;
  v_word jsonb;
  v_word_id text;
  v_word_text text;
  v_word_start numeric;
  v_word_end numeric;
  v_ids text[] := array[]::text[];
  v_prev_start numeric := -1;
  v_prev_end numeric := -1;
  v_key text;
  v_word_key text;
  v_confidence numeric;
begin
  -- Load authoritative duration from public.video_source_assets
  select duration_seconds into v_auth_duration from public.video_source_assets where id = p_source_asset_id;
  if v_auth_duration is null then
    raise exception 'TRANSCRIPTION_INVALID: Authoritative source duration not found' using errcode = '22000';
  end if;

  -- Validate the main transcript object is an object
  if p_transcript_json is null or pg_catalog.jsonb_typeof(p_transcript_json) <> 'object' then
    raise exception 'TRANSCRIPTION_INVALID: Transcript must be a JSON object' using errcode = '22000';
  end if;

  -- Check that ONLY canonical fields exist on the main object (exact JSONB key-set check)
  for v_key in select pg_catalog.jsonb_object_keys(p_transcript_json) loop
    if v_key not in ('schemaVersion', 'sourceAssetId', 'language', 'duration', 'words') then
      raise exception 'TRANSCRIPTION_INVALID: Unexpected field % on transcript object', v_key using errcode = '22000';
    end if;
  end loop;

  -- Check for missing canonical fields on main object
  if not (p_transcript_json ? 'schemaVersion') then
    raise exception 'TRANSCRIPTION_INVALID: Missing schemaVersion' using errcode = '22000';
  end if;
  if not (p_transcript_json ? 'sourceAssetId') then
    raise exception 'TRANSCRIPTION_INVALID: Missing sourceAssetId' using errcode = '22000';
  end if;
  if not (p_transcript_json ? 'language') then
    raise exception 'TRANSCRIPTION_INVALID: Missing language' using errcode = '22000';
  end if;
  if not (p_transcript_json ? 'duration') then
    raise exception 'TRANSCRIPTION_INVALID: Missing duration' using errcode = '22000';
  end if;
  if not (p_transcript_json ? 'words') then
    raise exception 'TRANSCRIPTION_INVALID: Missing words' using errcode = '22000';
  end if;

  -- Schema version must be 1
  if pg_catalog.jsonb_typeof(p_transcript_json->'schemaVersion') <> 'number' then
    raise exception 'TRANSCRIPTION_INVALID: schemaVersion must be a number' using errcode = '22000';
  end if;
  v_schema_version := (p_transcript_json->>'schemaVersion')::integer;
  if v_schema_version is null or v_schema_version <> 1 then
    raise exception 'TRANSCRIPTION_INVALID: schemaVersion must be 1' using errcode = '22000';
  end if;

  -- Source asset ID must match
  if pg_catalog.jsonb_typeof(p_transcript_json->'sourceAssetId') <> 'string' or p_transcript_json->>'sourceAssetId' <> p_source_asset_id::text then
    raise exception 'TRANSCRIPTION_INVALID: sourceAssetId mismatch' using errcode = '22000';
  end if;

  -- Language check
  if pg_catalog.jsonb_typeof(p_transcript_json->'language') <> 'string' then
    raise exception 'TRANSCRIPTION_INVALID: language must be a string' using errcode = '22000';
  end if;
  v_language := p_transcript_json->>'language';
  if v_language is null or pg_catalog.length(pg_catalog.btrim(v_language)) = 0 then
    raise exception 'TRANSCRIPTION_INVALID: language must be a non-empty string' using errcode = '22000';
  end if;

  -- Duration check
  if pg_catalog.jsonb_typeof(p_transcript_json->'duration') <> 'number' then
    raise exception 'TRANSCRIPTION_INVALID: duration must be a number' using errcode = '22000';
  end if;
  v_duration := (p_transcript_json->>'duration')::numeric;
  if v_duration is null or v_duration <= 0 then
    raise exception 'TRANSCRIPTION_INVALID: duration must be positive and finite' using errcode = '22000';
  end if;
  if pg_catalog.abs(v_duration - v_auth_duration) > 0.001 then
    raise exception 'TRANSCRIPTION_INVALID: duration mismatch beyond 0.001s tolerance' using errcode = '22000';
  end if;

  -- Words check
  v_words := p_transcript_json->'words';
  if v_words is null or pg_catalog.jsonb_typeof(v_words) <> 'array' then
    raise exception 'TRANSCRIPTION_INVALID: words must be an array' using errcode = '22000';
  end if;

  -- Iterate and validate words
  for i in 0 .. pg_catalog.jsonb_array_length(v_words) - 1 loop
    v_word := v_words->i;

    if pg_catalog.jsonb_typeof(v_word) <> 'object' then
      raise exception 'TRANSCRIPTION_INVALID: Each word must be a JSON object' using errcode = '22000';
    end if;

    -- Check that ONLY canonical fields exist on the word object (exact JSONB key-set check)
    for v_word_key in select pg_catalog.jsonb_object_keys(v_word) loop
      if v_word_key not in ('id', 'text', 'startSourceTime', 'endSourceTime', 'confidence', 'speakerId') then
        raise exception 'TRANSCRIPTION_INVALID: Unexpected field % on word object', v_word_key using errcode = '22000';
      end if;
    end loop;

    -- Check for missing canonical fields on word object
    if not (v_word ? 'id') then
      raise exception 'TRANSCRIPTION_INVALID: Missing word id' using errcode = '22000';
    end if;
    if not (v_word ? 'text') then
      raise exception 'TRANSCRIPTION_INVALID: Missing word text' using errcode = '22000';
    end if;
    if not (v_word ? 'startSourceTime') then
      raise exception 'TRANSCRIPTION_INVALID: Missing word startSourceTime' using errcode = '22000';
    end if;
    if not (v_word ? 'endSourceTime') then
      raise exception 'TRANSCRIPTION_INVALID: Missing word endSourceTime' using errcode = '22000';
    end if;
    if not (v_word ? 'confidence') then
      raise exception 'TRANSCRIPTION_INVALID: word confidence property is required' using errcode = '22000';
    end if;
    if not (v_word ? 'speakerId') then
      raise exception 'TRANSCRIPTION_INVALID: word speakerId property is required' using errcode = '22000';
    end if;

    -- Require ID is string
    if pg_catalog.jsonb_typeof(v_word->'id') <> 'string' then
      raise exception 'TRANSCRIPTION_INVALID: word id must be a string' using errcode = '22000';
    end if;
    v_word_id := v_word->>'id';
    if v_word_id is null or pg_catalog.length(pg_catalog.btrim(v_word_id)) = 0 then
      raise exception 'TRANSCRIPTION_INVALID: word id is required' using errcode = '22000';
    end if;

    -- Check for duplicate word ID
    if v_word_id = any(v_ids) then
      raise exception 'TRANSCRIPTION_INVALID: duplicate word identifier found' using errcode = '22000';
    end if;
    v_ids := pg_catalog.array_append(v_ids, v_word_id);

    -- Require text is string
    if pg_catalog.jsonb_typeof(v_word->'text') <> 'string' then
      raise exception 'TRANSCRIPTION_INVALID: word text must be a string' using errcode = '22000';
    end if;
    v_word_text := v_word->>'text';
    if v_word_text is null or pg_catalog.length(pg_catalog.btrim(v_word_text)) = 0 then
      raise exception 'TRANSCRIPTION_INVALID: word text is required' using errcode = '22000';
    end if;

    -- Require start/end times are numbers
    if pg_catalog.jsonb_typeof(v_word->'startSourceTime') <> 'number' or pg_catalog.jsonb_typeof(v_word->'endSourceTime') <> 'number' then
      raise exception 'TRANSCRIPTION_INVALID: word start/end times must be numbers' using errcode = '22000';
    end if;
    v_word_start := (v_word->>'startSourceTime')::numeric;
    v_word_end := (v_word->>'endSourceTime')::numeric;
    if v_word_start is null or v_word_end is null or v_word_start < 0 or v_word_end < 0 then
      raise exception 'TRANSCRIPTION_INVALID: word start/end times must be non-negative numbers' using errcode = '22000';
    end if;
    if v_word_start >= v_word_end then
      raise exception 'TRANSCRIPTION_INVALID: word start time must be less than end time' using errcode = '22000';
    end if;
    if v_word_end > v_auth_duration + 0.001 then
      raise exception 'TRANSCRIPTION_INVALID: word end time exceeds authoritative duration' using errcode = '22000';
    end if;

    -- Chronological check
    if v_word_start < v_prev_start then
      raise exception 'TRANSCRIPTION_INVALID: words must be in chronological order' using errcode = '22000';
    end if;

    -- Overlap check (within 0.001 tolerance)
    if v_prev_end > v_word_start and (v_prev_end - v_word_start) > 0.001 then
      raise exception 'TRANSCRIPTION_INVALID: words cannot overlap by more than 0.001s' using errcode = '22000';
    end if;

    -- Strict confidence checks
    if pg_catalog.jsonb_typeof(v_word->'confidence') <> 'null' then
      if pg_catalog.jsonb_typeof(v_word->'confidence') <> 'number' then
        raise exception 'TRANSCRIPTION_INVALID: confidence must be null or a number' using errcode = '22000';
      end if;
      v_confidence := (v_word->>'confidence')::numeric;
      if v_confidence < 0 or v_confidence > 1 then
        raise exception 'TRANSCRIPTION_INVALID: confidence must be null or a number between 0 and 1' using errcode = '22000';
      end if;
    end if;

    -- Strict speakerId checks
    if pg_catalog.jsonb_typeof(v_word->'speakerId') <> 'null' then
      if pg_catalog.jsonb_typeof(v_word->'speakerId') <> 'string' or pg_catalog.length(pg_catalog.btrim(v_word->>'speakerId')) = 0 then
        raise exception 'TRANSCRIPTION_INVALID: speakerId must be null or a non-empty string' using errcode = '22000';
      end if;
    end if;

    v_prev_start := v_word_start;
    v_prev_end := v_word_end;
  end loop;
end;
$$ language plpgsql security definer set search_path = '';

-- Revoke all execution rights from PUBLIC/anon/authenticated on internal validator
revoke all on function public.validate_video_source_transcript_internal(uuid, jsonb) from public, anon, authenticated;

-- 2. Replace Rate Limiter Check Function to enforce ID matching
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
  v_now timestamptz;
  v_existing_event public.transcription_rate_limit_events;
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
  select * into v_existing_event
  from public.transcription_rate_limit_events
  where request_id = p_request_id;

  if found then
    -- Verify user and guide match. Mismatch raises a generic exception to prevent session/ID leak
    if v_existing_event.user_id <> v_user_id or v_existing_event.guide_id <> p_guide_id then
      raise exception 'TRANSCRIPTION_REQUEST_MISMATCH: Request ID mismatch' using errcode = '22000';
    end if;

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

-- Revoke/grant rate-limiter permissions
revoke all on function public.check_and_record_transcription_rate_limit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_and_record_transcription_rate_limit(uuid, uuid) to authenticated;

-- 3. Replace upsert_video_source_transcript to use internal validator
create or replace function public.upsert_video_source_transcript(
  p_guide_id uuid,
  p_source_asset_id uuid,
  p_transcript_json jsonb
)
returns public.video_source_transcripts as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_account_id uuid;
  v_res public.video_source_transcripts;
  v_new_revision integer;
  v_existing_json jsonb;
  v_schema_version integer;
  v_language text;
  v_duration numeric;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'TRANSCRIPT_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if not public.can_edit_video_source_transcript(p_guide_id, p_source_asset_id) then
    raise exception 'TRANSCRIPT_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select account_id into v_account_id from public.courses where id = p_guide_id;
  if v_account_id is null then
    raise exception 'TRANSCRIPT_INVALID: guide account not found' using errcode = '22000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_source_asset_id::text));

  -- Shared Validator Check
  perform public.validate_video_source_transcript_internal(p_source_asset_id, p_transcript_json);

  -- Extract columns from transcript json
  v_schema_version := (p_transcript_json->>'schemaVersion')::integer;
  v_language := p_transcript_json->>'language';
  v_duration := (p_transcript_json->>'duration')::numeric;

  select revision, transcript_json into v_new_revision, v_existing_json
  from public.video_source_transcripts
  where source_asset_id = p_source_asset_id;

  if found then
    if v_existing_json = p_transcript_json then
      select * into v_res from public.video_source_transcripts where source_asset_id = p_source_asset_id;
      return v_res;
    end if;
    v_new_revision := v_new_revision + 1;
  else
    v_new_revision := 1;
  end if;

  insert into public.video_source_transcripts (
    account_id,
    guide_id,
    source_asset_id,
    schema_version,
    language,
    duration,
    transcript_json,
    revision,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  values (
    v_account_id,
    p_guide_id,
    p_source_asset_id,
    v_schema_version,
    v_language,
    v_duration,
    p_transcript_json,
    v_new_revision,
    v_user_id,
    v_user_id,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (source_asset_id)
  do update set
    schema_version = excluded.schema_version,
    language = excluded.language,
    duration = excluded.duration,
    transcript_json = excluded.transcript_json,
    revision = excluded.revision,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_res;

  return v_res;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.upsert_video_source_transcript(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_video_source_transcript(uuid, uuid, jsonb) to authenticated;

-- 4. Replace create_manual_transcription_import_job to use internal validator
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

  v_expected_fingerprint := p_guide_id::text || ':' || p_source_asset_id::text || ':manual_import:manual_import:' || coalesce(v_base_revision::text, 'null');

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

-- 5. Replace approve_video_transcription_job to revalidate at approval time
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

  if (v_current_revision is null and p_expected_transcript_revision is not null) or
     (v_current_revision is not null and p_expected_transcript_revision is null) or
     (v_current_revision is not null and v_current_revision <> p_expected_transcript_revision) then
    raise exception 'TRANSCRIPTION_APPROVAL_CONFLICT: The active transcript revision changed after job creation' using errcode = '22000';
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
