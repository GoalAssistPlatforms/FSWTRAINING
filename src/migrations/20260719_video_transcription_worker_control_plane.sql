-- Migration: Video Transcription Worker Control Plane
-- Date: 2026-07-19
-- Package: 06B.1

-- 1. Drop existing worker functions from 06A to replace signatures safely
drop function if exists public.claim_next_video_transcription_job(text, integer);
drop function if exists public.heartbeat_video_transcription_job(uuid, text, integer, integer);
drop function if exists public.record_video_transcription_stage(uuid, text, integer, text, text);
drop function if exists public.record_video_transcription_result(uuid, text, integer, jsonb, text, jsonb);
drop function if exists public.record_video_transcription_failure(uuid, text, integer, text, text, boolean, integer);
drop function if exists public.record_video_transcription_failure(uuid, text, integer, text);
drop function if exists public.recover_stale_video_transcription_jobs(integer);

-- 2. Claim Job
create or replace function public.claim_next_video_transcription_job(
  p_lease_owner text,
  p_lease_duration_seconds integer
)
returns public.video_transcription_jobs as $$
declare
  v_job public.video_transcription_jobs;
  v_now timestamptz;
begin
  if p_lease_owner is null or pg_catalog.length(trim(p_lease_owner)) = 0 then
    raise exception 'WORKER_INVALID_ID: Lease owner cannot be empty' using errcode = '22000';
  end if;

  if p_lease_duration_seconds is null or p_lease_duration_seconds < 15 or p_lease_duration_seconds > 300 then
    raise exception 'WORKER_INVALID_LEASE_DURATION: Duration must be between 15 and 300 seconds' using errcode = '22000';
  end if;

  v_now := pg_catalog.clock_timestamp();

  -- Strict locking logic matching exact requirements
  select * into v_job from public.video_transcription_jobs
  where status = 'queued'
    and provider <> 'manual_import'
    and (next_attempt_at is null or next_attempt_at <= v_now)
  order by next_attempt_at nulls first, created_at asc, id asc
  for update skip locked
  limit 1;

  if v_job.id is null then
    return null;
  end if;

  v_job.status := 'extracting_audio';
  v_job.progress_stage := 'extracting_audio';
  v_job.lease_owner := p_lease_owner;
  v_job.lease_generation := coalesce(v_job.lease_generation, 0) + 1;
  v_job.lease_acquired_at := v_now;
  v_job.lease_expires_at := v_now + (p_lease_duration_seconds || ' seconds')::interval;
  v_job.last_heartbeat_at := v_now;
  v_job.attempt_count := coalesce(v_job.attempt_count, 0) + 1;
  v_job.error_code := null;
  v_job.error_message_safe := null;
  v_job.updated_at := v_now;

  update public.video_transcription_jobs
  set
    status = v_job.status,
    progress_stage = v_job.progress_stage,
    lease_owner = v_job.lease_owner,
    lease_generation = v_job.lease_generation,
    lease_acquired_at = v_job.lease_acquired_at,
    lease_expires_at = v_job.lease_expires_at,
    last_heartbeat_at = v_job.last_heartbeat_at,
    attempt_count = v_job.attempt_count,
    error_code = v_job.error_code,
    error_message_safe = v_job.error_message_safe,
    updated_at = v_job.updated_at
  where id = v_job.id;

  insert into public.video_transcription_attempts (
    job_id,
    attempt_number,
    provider,
    status,
    started_at
  ) values (
    v_job.id,
    v_job.attempt_count,
    v_job.provider,
    'started',
    v_now
  );

  return v_job;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.claim_next_video_transcription_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_next_video_transcription_job(text, integer) to service_role;


-- 3. Heartbeat Job
create or replace function public.heartbeat_video_transcription_job(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_generation integer,
  p_lease_duration_seconds integer
)
returns boolean as $$
declare
  v_now timestamptz;
begin
  if p_lease_duration_seconds is null or p_lease_duration_seconds < 15 or p_lease_duration_seconds > 300 then
    raise exception 'WORKER_INVALID_LEASE_DURATION: Duration must be between 15 and 300 seconds' using errcode = '22000';
  end if;

  v_now := pg_catalog.clock_timestamp();

  update public.video_transcription_jobs
  set
    last_heartbeat_at = v_now,
    lease_expires_at = v_now + (p_lease_duration_seconds || ' seconds')::interval,
    updated_at = v_now
  where id = p_job_id
    and lease_owner = p_lease_owner
    and lease_generation = p_lease_generation
    and status in ('extracting_audio', 'transcribing', 'validating')
    and lease_expires_at > v_now;

  return found;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.heartbeat_video_transcription_job(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.heartbeat_video_transcription_job(uuid, text, integer, integer) to service_role;


-- 4. Record Progress Stage
create or replace function public.record_video_transcription_stage(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_generation integer,
  p_stage text,
  p_status text
)
returns boolean as $$
declare
  v_job public.video_transcription_jobs;
  v_is_valid boolean := false;
begin
  select * into v_job from public.video_transcription_jobs
  where id = p_job_id
    and lease_owner = p_lease_owner
    and lease_generation = p_lease_generation
    and status in ('extracting_audio', 'transcribing', 'validating')
    and lease_expires_at > pg_catalog.clock_timestamp()
  for update;

  if not found then
    return false;
  end if;

  if v_job.status = 'extracting_audio' and v_job.progress_stage = 'extracting_audio' then
    if p_status = 'transcribing' and p_stage = 'submitting' then v_is_valid := true; end if;
  elsif v_job.status = 'transcribing' and v_job.progress_stage = 'submitting' then
    if p_status = 'transcribing' and p_stage = 'provider_processing' then v_is_valid := true; end if;
  elsif v_job.status = 'transcribing' and v_job.progress_stage = 'provider_processing' then
    if p_status = 'validating' and p_stage = 'normalising' then v_is_valid := true; end if;
  elsif v_job.status = 'validating' and v_job.progress_stage = 'normalising' then
    if p_status = 'validating' and p_stage = 'validating' then v_is_valid := true; end if;
  end if;

  if not v_is_valid then
    raise exception 'WORKER_INVALID_TRANSITION' using errcode = '22000';
  end if;

  update public.video_transcription_jobs
  set
    progress_stage = p_stage,
    status = p_status,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_job_id;

  return true;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.record_video_transcription_stage(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_video_transcription_stage(uuid, text, integer, text, text) to service_role;


-- 5. Record Result
create or replace function public.record_video_transcription_result(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_generation integer,
  p_transcript_json jsonb,
  p_provider_request_id text,
  p_provider_metadata jsonb default null
)
returns boolean as $$
declare
  v_job public.video_transcription_jobs;
  v_now timestamptz;
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
  v_prev_start numeric := -1.0;
  v_prev_end numeric := -1.0;
  v_ids text[] := '{}';
  v_filtered_metadata jsonb;
  v_attempt_rows integer;
begin
  v_now := pg_catalog.clock_timestamp();

  select * into v_job from public.video_transcription_jobs
  where id = p_job_id
    and lease_owner = p_lease_owner
    and lease_generation = p_lease_generation
    and status = 'validating'
    and progress_stage = 'validating'
    and lease_expires_at > v_now
  for update;

  if not found then
    return false;
  end if;

  -- Load authoritative duration
  select duration_seconds into v_auth_duration from public.video_source_assets where id = v_job.source_asset_id;
  if v_auth_duration is null then
    raise exception 'TRANSCRIPT_INVALID: authoritative source duration not found' using errcode = '22000';
  end if;

  -- Validate the canonical transcript
  if p_transcript_json is null or pg_catalog.jsonb_typeof(p_transcript_json) <> 'object' then
    raise exception 'TRANSCRIPT_INVALID: Transcript must be a JSON object' using errcode = '22000';
  end if;

  v_schema_version := (p_transcript_json->>'schemaVersion')::integer;
  if v_schema_version is null or v_schema_version <> 1 then
    raise exception 'TRANSCRIPT_INVALID: schemaVersion must be 1' using errcode = '22000';
  end if;

  if p_transcript_json->>'sourceAssetId' is null or p_transcript_json->>'sourceAssetId' <> v_job.source_asset_id::text then
    raise exception 'TRANSCRIPT_INVALID: sourceAssetId mismatch' using errcode = '22000';
  end if;

  v_language := p_transcript_json->>'language';
  if v_language is null or pg_catalog.length(pg_catalog.btrim(v_language)) = 0 then
    raise exception 'TRANSCRIPT_INVALID: language must be a non-empty string' using errcode = '22000';
  end if;

  v_duration := (p_transcript_json->>'duration')::numeric;
  if v_duration is null or v_duration < 0 or pg_catalog.abs(v_duration - v_auth_duration) > 0.001 then
    raise exception 'TRANSCRIPT_INVALID: duration mismatch beyond 0.001s tolerance' using errcode = '22000';
  end if;

  v_words := p_transcript_json->'words';
  if v_words is null or pg_catalog.jsonb_typeof(v_words) <> 'array' then
    raise exception 'TRANSCRIPT_INVALID: words must be an array' using errcode = '22000';
  end if;

  for i in 0 .. pg_catalog.jsonb_array_length(v_words) - 1 loop
    v_word := v_words->i;

    v_word_id := v_word->>'id';
    if v_word_id is null or pg_catalog.length(pg_catalog.btrim(v_word_id)) = 0 then
      raise exception 'TRANSCRIPT_INVALID: word id is required' using errcode = '22000';
    end if;

    if v_word_id = any(v_ids) then
      raise exception 'TRANSCRIPT_INVALID: duplicate word identifier found' using errcode = '22000';
    end if;
    v_ids := pg_catalog.array_append(v_ids, v_word_id);

    v_word_text := v_word->>'text';
    if v_word_text is null or pg_catalog.length(pg_catalog.btrim(v_word_text)) = 0 then
      raise exception 'TRANSCRIPT_INVALID: word text is required' using errcode = '22000';
    end if;

    v_word_start := (v_word->>'startSourceTime')::numeric;
    v_word_end := (v_word->>'endSourceTime')::numeric;
    if v_word_start is null or v_word_end is null or v_word_start < 0 or v_word_end < 0 then
      raise exception 'TRANSCRIPT_INVALID: word start/end times must be non-negative numbers' using errcode = '22000';
    end if;
    if v_word_start >= v_word_end then
      raise exception 'TRANSCRIPT_INVALID: word start time must be less than end time' using errcode = '22000';
    end if;
    if v_word_end > v_auth_duration + 0.001 then
      raise exception 'TRANSCRIPT_INVALID: word end time exceeds authoritative duration' using errcode = '22000';
    end if;

    if v_word_start < v_prev_start then
      raise exception 'TRANSCRIPT_INVALID: words must be in chronological order' using errcode = '22000';
    end if;

    if v_prev_end > v_word_start and (v_prev_end - v_word_start) > 0.001 then
      raise exception 'TRANSCRIPT_INVALID: words cannot overlap by more than 0.001s' using errcode = '22000';
    end if;

    if not (v_word ? 'confidence') then
      raise exception 'TRANSCRIPT_INVALID: word confidence property is required' using errcode = '22000';
    end if;
    if not (v_word ? 'speakerId') then
      raise exception 'TRANSCRIPT_INVALID: word speakerId property is required' using errcode = '22000';
    end if;

    if pg_catalog.jsonb_typeof(v_word->'confidence') <> 'null' then
      if pg_catalog.jsonb_typeof(v_word->'confidence') <> 'number' or (v_word->>'confidence')::numeric < 0 or (v_word->>'confidence')::numeric > 1 then
        raise exception 'TRANSCRIPT_INVALID: confidence must be null or a number between 0 and 1' using errcode = '22000';
      end if;
    end if;

    if pg_catalog.jsonb_typeof(v_word->'speakerId') <> 'null' then
      if pg_catalog.jsonb_typeof(v_word->'speakerId') <> 'string' or pg_catalog.length(pg_catalog.btrim(v_word->>'speakerId')) = 0 then
        raise exception 'TRANSCRIPT_INVALID: speakerId must be null or a non-empty string' using errcode = '22000';
      end if;
    end if;

    v_prev_start := v_word_start;
    v_prev_end := v_word_end;
  end loop;

  update public.video_transcription_jobs
  set
    status = 'awaiting_approval',
    progress_stage = 'ready_for_review',
    result_transcript_json = p_transcript_json,
    updated_at = v_now,
    lease_owner = null,
    lease_generation = null,
    lease_acquired_at = null,
    lease_expires_at = null
  where id = p_job_id;

  if p_provider_metadata is not null then
    v_filtered_metadata := pg_catalog.jsonb_build_object(
      'model', p_provider_metadata->'model',
      'durationMilliseconds', p_provider_metadata->'durationMilliseconds',
      'wordCount', p_provider_metadata->'wordCount',
      'providerStatus', p_provider_metadata->'providerStatus'
    );
  else
    v_filtered_metadata := null;
  end if;

  update public.video_transcription_attempts
  set
    status = 'completed',
    finished_at = v_now,
    provider_request_id = p_provider_request_id,
    provider_metadata_json = v_filtered_metadata
  where job_id = p_job_id and attempt_number = v_job.attempt_count and status = 'started';

  get diagnostics v_attempt_rows = row_count;
  if v_attempt_rows <> 1 then
    raise exception 'WORKER_ATTEMPT_STATE_INVALID' using errcode = '22000';
  end if;

  return true;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.record_video_transcription_result(uuid, text, integer, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_video_transcription_result(uuid, text, integer, jsonb, text, jsonb) to service_role;


-- 6. Record Failure
create or replace function public.record_video_transcription_failure(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_generation integer,
  p_error_code text
)
returns boolean as $$
declare
  v_job public.video_transcription_jobs;
  v_now timestamptz;
  v_new_status text;
  v_retry_delay integer;
  v_is_retryable boolean;
  v_safe_message text;
  v_max_attempts integer := 4;
  v_attempt_rows integer;
begin
  if p_error_code in ('SOURCE_NOT_READY', 'SOURCE_DOWNLOAD_FAILED', 'AUDIO_EXTRACTION_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE') then
    v_is_retryable := true;
  elsif p_error_code in ('SOURCE_NOT_FOUND', 'AUDIO_TOO_LARGE', 'PROVIDER_AUTHENTICATION_FAILED', 'PROVIDER_INVALID_RESPONSE', 'TRANSCRIPT_NORMALISATION_FAILED', 'TRANSCRIPT_VALIDATION_FAILED', 'INTERNAL_WORKER_ERROR') then
    v_is_retryable := false;
  else
    raise exception 'WORKER_UNKNOWN_ERROR_CODE' using errcode = '22000';
  end if;

  if p_error_code = 'SOURCE_NOT_READY' then v_safe_message := 'Source video is not yet ready';
  elsif p_error_code = 'SOURCE_DOWNLOAD_FAILED' then v_safe_message := 'Failed to download source video';
  elsif p_error_code = 'AUDIO_EXTRACTION_FAILED' then v_safe_message := 'Failed to extract audio';
  elsif p_error_code = 'PROVIDER_RATE_LIMITED' then v_safe_message := 'Provider rate limit exceeded';
  elsif p_error_code = 'PROVIDER_TIMEOUT' then v_safe_message := 'Provider request timed out';
  elsif p_error_code = 'PROVIDER_UNAVAILABLE' then v_safe_message := 'Provider unavailable';
  elsif p_error_code = 'SOURCE_NOT_FOUND' then v_safe_message := 'Source video not found';
  elsif p_error_code = 'AUDIO_TOO_LARGE' then v_safe_message := 'Extracted audio too large';
  elsif p_error_code = 'PROVIDER_AUTHENTICATION_FAILED' then v_safe_message := 'Provider authentication failed';
  elsif p_error_code = 'PROVIDER_INVALID_RESPONSE' then v_safe_message := 'Provider returned invalid response';
  elsif p_error_code = 'TRANSCRIPT_NORMALISATION_FAILED' then v_safe_message := 'Transcript normalisation failed';
  elsif p_error_code = 'TRANSCRIPT_VALIDATION_FAILED' then v_safe_message := 'Transcript validation failed';
  elsif p_error_code = 'INTERNAL_WORKER_ERROR' then v_safe_message := 'Internal worker error';
  end if;

  v_now := pg_catalog.clock_timestamp();

  select * into v_job from public.video_transcription_jobs
  where id = p_job_id
    and lease_owner = p_lease_owner
    and lease_generation = p_lease_generation
    and status in ('extracting_audio', 'transcribing', 'validating')
    and lease_expires_at > v_now
  for update;

  if not found then
    return false;
  end if;

  if v_is_retryable and v_job.attempt_count < v_max_attempts then
    v_new_status := 'queued';

    if v_job.attempt_count = 1 then v_retry_delay := 30;
    elsif v_job.attempt_count = 2 then v_retry_delay := 120;
    elsif v_job.attempt_count = 3 then v_retry_delay := 480;
    else v_retry_delay := 900;
    end if;
  else
    v_new_status := 'failed';
  end if;

  update public.video_transcription_jobs
  set
    status = v_new_status,
    error_code = p_error_code,
    error_message_safe = v_safe_message,
    next_attempt_at = case when v_new_status = 'queued' then v_now + (v_retry_delay || ' seconds')::interval else null end,
    updated_at = v_now,
    lease_owner = null,
    lease_acquired_at = null,
    lease_expires_at = null
  where id = p_job_id;

  update public.video_transcription_attempts
  set
    status = 'failed',
    finished_at = v_now,
    error_code = p_error_code,
    error_message_safe = v_safe_message
  where job_id = p_job_id and attempt_number = v_job.attempt_count and status = 'started';

  get diagnostics v_attempt_rows = row_count;
  if v_attempt_rows <> 1 then
    raise exception 'WORKER_ATTEMPT_STATE_INVALID' using errcode = '22000';
  end if;

  return true;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.record_video_transcription_failure(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.record_video_transcription_failure(uuid, text, integer, text) to service_role;


-- 7. Recover Stale Jobs
create or replace function public.recover_stale_video_transcription_jobs(
  p_limit integer
)
returns table(job_id uuid, new_status text) as $$
declare
  v_now timestamptz;
  v_row record;
  v_new_status text;
  v_retry_delay integer;
  v_max_attempts integer := 4;
  v_attempt_rows integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'WORKER_INVALID_RECOVERY_LIMIT' using errcode = '22000';
  end if;

  v_now := pg_catalog.clock_timestamp();

  for v_row in (
    select * from public.video_transcription_jobs
    where status in ('extracting_audio', 'transcribing', 'validating')
      and lease_expires_at is not null
      and lease_expires_at <= v_now
      and provider <> 'manual_import'
    order by lease_expires_at asc
    for update skip locked
    limit p_limit
  ) loop
    if v_row.attempt_count < v_max_attempts then
      v_new_status := 'queued';
      if v_row.attempt_count = 1 then v_retry_delay := 30;
      elsif v_row.attempt_count = 2 then v_retry_delay := 120;
      elsif v_row.attempt_count = 3 then v_retry_delay := 480;
      else v_retry_delay := 900;
      end if;
    else
      v_new_status := 'failed';
    end if;

    update public.video_transcription_jobs
    set
      status = v_new_status,
      next_attempt_at = case when v_new_status = 'queued' then v_now + (v_retry_delay || ' seconds')::interval else null end,
      error_code = 'WORKER_STALE_LEASE_RECOVERY',
      error_message_safe = 'Worker lease expired and job was recovered',
      lease_owner = null,
      lease_generation = coalesce(lease_generation, 0) + 1,
      lease_acquired_at = null,
      lease_expires_at = null,
      updated_at = v_now
    where id = v_row.id;

    update public.video_transcription_attempts
    set
      status = 'failed',
      finished_at = v_now,
      error_code = 'WORKER_STALE_LEASE_RECOVERY',
      error_message_safe = 'Worker lease expired and job was recovered'
    where public.video_transcription_attempts.job_id = v_row.id and public.video_transcription_attempts.attempt_number = v_row.attempt_count and public.video_transcription_attempts.status = 'started';

    get diagnostics v_attempt_rows = row_count;
    if v_attempt_rows <> 1 then
      raise exception 'WORKER_ATTEMPT_STATE_INVALID' using errcode = '22000';
    end if;

    job_id := v_row.id;
    new_status := v_new_status;
    return next;
  end loop;

  return;
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.recover_stale_video_transcription_jobs(integer) from public, anon, authenticated;
grant execute on function public.recover_stale_video_transcription_jobs(integer) to service_role;
