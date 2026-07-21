-- Migration: Video Transcription Jobs Schema
-- Date: 2026-07-15
-- Package: 06A

-- 1. Create Tables
create table if not exists public.video_transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  guide_id uuid not null references public.courses(id) on delete cascade,
  source_asset_id uuid not null references public.video_source_assets(id) on delete cascade,
  request_id uuid not null unique,
  request_fingerprint text not null,
  provider text not null,
  provider_model text not null,
  status text not null default 'queued',
  progress_stage text not null default 'preparing_source',
  base_transcript_revision integer,
  result_transcript_json jsonb,
  result_transcript_revision integer,
  error_code text,
  error_message_safe text,
  attempt_count integer not null default 0,
  lease_owner text,
  lease_generation integer,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  next_attempt_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  rejected_by uuid references public.profiles(id) on delete set null,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,

  -- Constraints
  constraint check_status check (status in (
    'queued', 'extracting_audio', 'transcribing', 'validating', 'awaiting_approval', 'completed', 'rejected', 'failed', 'cancelled'
  )),
  constraint check_progress_stage check (progress_stage in (
    'preparing_source', 'extracting_audio', 'submitting', 'provider_processing', 'normalising', 'validating', 'ready_for_review'
  )),
  constraint check_result_json check (
    (status not in ('awaiting_approval', 'completed')) or result_transcript_json is not null
  ),
  constraint check_approved check (
    status <> 'completed' or (approved_by is not null and approved_at is not null and completed_at is not null)
  ),
  constraint check_rejected check (
    status <> 'rejected' or (rejected_by is not null and rejected_at is not null)
  ),
  constraint check_cancelled check (
    status <> 'cancelled' or (cancelled_by is not null and cancelled_at is not null)
  )
);

create table if not exists public.video_transcription_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.video_transcription_jobs(id) on delete cascade,
  attempt_number integer not null,
  provider text not null,
  provider_request_id text,
  status text not null,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  error_code text,
  error_message_safe text,
  provider_metadata_json jsonb,

  constraint unique_job_attempt unique (job_id, attempt_number)
);

-- 2. Indexes
create unique index idx_active_transcription_job on public.video_transcription_jobs(source_asset_id)
where status in ('queued', 'extracting_audio', 'transcribing', 'validating', 'awaiting_approval');

create index idx_transcription_jobs_guide on public.video_transcription_jobs(guide_id);
create index idx_transcription_jobs_status on public.video_transcription_jobs(status);
create index idx_transcription_attempts_job on public.video_transcription_attempts(job_id);

-- 3. Row-Level Security
alter table public.video_transcription_jobs enable row level security;
alter table public.video_transcription_attempts enable row level security;

create policy select_transcription_jobs on public.video_transcription_jobs
  for select using (
    auth.uid() is not null and
    public.can_edit_video_editor_guide(guide_id)
  );

create policy select_transcription_attempts on public.video_transcription_attempts
  for select using (
    exists (
      select 1 from public.video_transcription_jobs j
      where j.id = job_id
        and public.can_edit_video_editor_guide(j.guide_id)
    )
  );

-- 4. Secure RPC Helper Functions

-- Create Job
create or replace function public.create_video_transcription_job(
  p_guide_id uuid,
  p_source_asset_id uuid,
  p_request_id uuid,
  p_provider text,
  p_settings_json jsonb
)
returns public.video_transcription_jobs as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_account_id uuid;
  v_base_revision integer;
  v_expected_fingerprint text;
  v_existing public.video_transcription_jobs;
  v_provider_model text;
  v_has_active boolean;
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
  if not exists (
    select 1 from public.video_source_assets
    where id = p_source_asset_id and duration_seconds is not null
  ) then
    raise exception 'TRANSCRIPTION_SOURCE_DURATION_ERROR: Source asset duration is missing' using errcode = '22000';
  end if;

  -- Determine provider model
  if p_provider = 'manual_import' then
    v_provider_model := 'manual_import';
  else
    v_provider_model := coalesce(p_settings_json->>'model', 'whisper-1');
  end if;

  -- Get current transcript revision
  select revision into v_base_revision from public.video_source_transcripts
  where source_asset_id = p_source_asset_id;

  -- Compute deterministic fingerprint
  v_expected_fingerprint := p_guide_id::text || ':' || p_source_asset_id::text || ':' || p_provider || ':' || v_provider_model || ':' || coalesce(v_base_revision::text, 'null');

  -- Acquire xact advisory lock to serialize requests
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
    created_by,
    created_at,
    updated_at
  ) values (
    v_account_id,
    p_guide_id,
    p_source_asset_id,
    p_request_id,
    v_expected_fingerprint,
    p_provider,
    v_provider_model,
    'queued',
    'preparing_source',
    v_base_revision,
    v_user_id,
    clock_timestamp(),
    clock_timestamp()
  ) returning * into v_existing;

  return v_existing;
end;
$$ language plpgsql security definer set search_path = '';

-- Claim job (service role only)
create or replace function public.claim_next_video_transcription_job(
  p_lease_owner text,
  p_lease_duration_seconds integer
)
returns public.video_transcription_jobs as $$
#variable_conflict use_column
declare
  v_job public.video_transcription_jobs;
  v_now timestamptz;
begin
  v_now := clock_timestamp();

  -- Find next queued job and lock it
  select * into v_job from public.video_transcription_jobs
  where status = 'queued'
  order by created_at asc
  for update skip locked
  limit 1;

  if v_job.id is null then
    return null;
  end if;

  -- Update job lease details
  update public.video_transcription_jobs
  set
    status = 'extracting_audio',
    progress_stage = 'extracting_audio',
    lease_owner = p_lease_owner,
    lease_generation = coalesce(lease_generation, 0) + 1,
    lease_acquired_at = v_now,
    lease_expires_at = v_now + (p_lease_duration_seconds || ' seconds')::interval,
    last_heartbeat_at = v_now,
    attempt_count = attempt_count + 1,
    updated_at = v_now
  where id = v_job.id
  returning * into v_job;

  -- Record the start attempt
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

-- Heartbeat (service role only)
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
  v_now := clock_timestamp();

  update public.video_transcription_jobs
  set
    last_heartbeat_at = v_now,
    lease_expires_at = v_now + (p_lease_duration_seconds || ' seconds')::interval,
    updated_at = v_now
  where id = p_job_id
    and lease_owner = p_lease_owner
    and lease_generation = p_lease_generation
    and status in ('extracting_audio', 'transcribing', 'validating');

  return found;
end;
$$ language plpgsql security definer set search_path = '';

-- Record Progress Stage (service role only)
create or replace function public.record_video_transcription_stage(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_generation integer,
  p_stage text,
  p_status text
)
returns boolean as $$
begin
  update public.video_transcription_jobs
  set
    progress_stage = p_stage,
    status = p_status,
    updated_at = clock_timestamp()
  where id = p_job_id
    and lease_owner = p_lease_owner
    and lease_generation = p_lease_generation
    and status in ('extracting_audio', 'transcribing', 'validating');

  return found;
end;
$$ language plpgsql security definer set search_path = '';

-- Record Result (service role only)
create or replace function public.record_video_transcription_result(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_generation integer,
  p_transcript_json jsonb,
  p_provider_request_id text
)
returns boolean as $$
declare
  v_now timestamptz;
  v_attempt_count integer;
begin
  v_now := clock_timestamp();

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
  where id = p_job_id
    and lease_owner = p_lease_owner
    and lease_generation = p_lease_generation
    and status in ('extracting_audio', 'transcribing', 'validating');

  if not found then
    return false;
  end if;

  select attempt_count into v_attempt_count from public.video_transcription_jobs
  where id = p_job_id;

  update public.video_transcription_attempts
  set
    status = 'completed',
    finished_at = v_now,
    provider_request_id = p_provider_request_id
  where job_id = p_job_id and attempt_number = v_attempt_count;

  return true;
end;
$$ language plpgsql security definer set search_path = '';

-- Record Failure (service role only)
create or replace function public.record_video_transcription_failure(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_generation integer,
  p_error_code text,
  p_error_message_safe text,
  p_is_retryable boolean,
  p_max_attempts integer,
  p_retry_delay_seconds integer
)
returns boolean as $$
declare
  v_now timestamptz;
  v_attempt_count integer;
  v_new_status text;
begin
  v_now := clock_timestamp();

  select attempt_count into v_attempt_count from public.video_transcription_jobs
  where id = p_job_id;

  if p_is_retryable and v_attempt_count < p_max_attempts then
    v_new_status := 'queued';
  else
    v_new_status := 'failed';
  end if;

  update public.video_transcription_jobs
  set
    status = v_new_status,
    error_code = p_error_code,
    error_message_safe = p_error_message_safe,
    next_attempt_at = case when v_new_status = 'queued' then v_now + (p_retry_delay_seconds || ' seconds')::interval else null end,
    updated_at = v_now,
    lease_owner = null,
    lease_generation = null,
    lease_acquired_at = null,
    lease_expires_at = null
  where id = p_job_id
    and lease_owner = p_lease_owner
    and lease_generation = p_lease_generation;

  if not found then
    return false;
  end if;

  update public.video_transcription_attempts
  set
    status = 'failed',
    finished_at = v_now,
    error_code = p_error_code,
    error_message_safe = p_error_message_safe
  where job_id = p_job_id and attempt_number = v_attempt_count;

  return true;
end;
$$ language plpgsql security definer set search_path = '';

-- Stale Lease Recovery (service role only)
create or replace function public.recover_stale_video_transcription_job(
  p_job_id uuid,
  p_recovery_threshold_seconds integer
)
returns boolean as $$
declare
  v_now timestamptz;
  v_attempt_count integer;
begin
  v_now := clock_timestamp();

  update public.video_transcription_jobs
  set
    status = 'queued',
    next_attempt_at = v_now,
    lease_owner = null,
    lease_generation = coalesce(lease_generation, 0) + 1,
    lease_acquired_at = null,
    lease_expires_at = null,
    updated_at = v_now
  where id = p_job_id
    and status in ('extracting_audio', 'transcribing', 'validating')
    and lease_expires_at is not null
    and lease_expires_at < v_now;

  if not found then
    return false;
  end if;

  -- Record worker failure/recovery event on the active attempt
  select attempt_count into v_attempt_count from public.video_transcription_jobs
  where id = p_job_id;

  update public.video_transcription_attempts
  set
    status = 'failed',
    finished_at = v_now,
    error_code = 'WORKER_STALE_LEASE_RECOVERY',
    error_message_safe = 'Worker lease expired and job was recovered back to queued'
  where job_id = p_job_id and attempt_number = v_attempt_count;

  return true;
end;
$$ language plpgsql security definer set search_path = '';

-- Cancel Job
create or replace function public.cancel_video_transcription_job(
  p_job_id uuid
)
returns public.video_transcription_jobs as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_job public.video_transcription_jobs;
  v_now timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_job from public.video_transcription_jobs where id = p_job_id;
  if not found then
    raise exception 'TRANSCRIPTION_JOB_NOT_FOUND' using errcode = '22000';
  end if;

  if not public.can_edit_video_editor_guide(v_job.guide_id) then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if v_job.status not in ('queued', 'extracting_audio', 'transcribing', 'validating') then
    raise exception 'TRANSCRIPTION_ILLEGAL_STATE: Cannot cancel job in terminal or review states' using errcode = '22000';
  end if;

  v_now := clock_timestamp();

  update public.video_transcription_jobs
  set
    status = 'cancelled',
    cancelled_by = v_user_id,
    cancelled_at = v_now,
    updated_at = v_now,
    lease_owner = null,
    lease_generation = coalesce(lease_generation, 0) + 1,
    lease_acquired_at = null,
    lease_expires_at = null
  where id = p_job_id
  returning * into v_job;

  -- Close active attempt as cancelled
  update public.video_transcription_attempts
  set
    status = 'cancelled',
    finished_at = v_now,
    error_code = 'JOB_CANCELLED_BY_USER'
  where job_id = p_job_id and attempt_number = v_job.attempt_count;

  return v_job;
end;
$$ language plpgsql security definer set search_path = '';

-- Retry Job
create or replace function public.retry_video_transcription_job(
  p_job_id uuid
)
returns public.video_transcription_jobs as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_job public.video_transcription_jobs;
  v_now timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_job from public.video_transcription_jobs where id = p_job_id;
  if not found then
    raise exception 'TRANSCRIPTION_JOB_NOT_FOUND' using errcode = '22000';
  end if;

  if not public.can_edit_video_editor_guide(v_job.guide_id) then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if v_job.status <> 'failed' then
    raise exception 'TRANSCRIPTION_ILLEGAL_STATE: Only failed jobs can be manually retried' using errcode = '22000';
  end if;

  v_now := clock_timestamp();

  update public.video_transcription_jobs
  set
    status = 'queued',
    progress_stage = 'preparing_source',
    next_attempt_at = v_now,
    error_code = null,
    error_message_safe = null,
    updated_at = v_now,
    lease_owner = null,
    lease_generation = coalesce(lease_generation, 0) + 1,
    lease_acquired_at = null,
    lease_expires_at = null
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$ language plpgsql security definer set search_path = '';

-- Approve Job
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

  -- Lock the job for update
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

  -- Verify active transcript revision matches base revision
  select revision into v_current_revision from public.video_source_transcripts
  where source_asset_id = v_job.source_asset_id;

  if (v_current_revision is null and p_expected_transcript_revision is not null) or
     (v_current_revision is not null and p_expected_transcript_revision is null) or
     (v_current_revision is not null and v_current_revision <> p_expected_transcript_revision) then
    raise exception 'TRANSCRIPTION_APPROVAL_CONFLICT: The active transcript revision changed after job creation' using errcode = '22000';
  end if;

  -- Invoke atomic Package 05 upsert pathway
  select * into v_upsert_res from public.upsert_video_source_transcript(
    v_job.guide_id,
    v_job.source_asset_id,
    v_job.result_transcript_json
  );

  v_now := clock_timestamp();

  -- Update job status to completed
  update public.video_transcription_jobs
  set
    status = 'completed',
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

-- Reject Job
create or replace function public.reject_video_transcription_job(
  p_job_id uuid
)
returns public.video_transcription_jobs as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_job public.video_transcription_jobs;
  v_now timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_job from public.video_transcription_jobs where id = p_job_id;
  if not found then
    raise exception 'TRANSCRIPTION_JOB_NOT_FOUND' using errcode = '22000';
  end if;

  if not public.can_edit_video_editor_guide(v_job.guide_id) then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if v_job.status <> 'awaiting_approval' then
    raise exception 'TRANSCRIPTION_ILLEGAL_STATE: Only jobs awaiting approval can be rejected' using errcode = '22000';
  end if;

  v_now := clock_timestamp();

  update public.video_transcription_jobs
  set
    status = 'rejected',
    rejected_by = v_user_id,
    rejected_at = v_now,
    updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$ language plpgsql security definer set search_path = '';

-- Create Manual Import Job
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
  if octet_length(p_transcript_json::text) > 1048576 then
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

-- 5. Revoke worker execute permissions from PUBLIC / anon / authenticated
revoke all on function public.claim_next_video_transcription_job(text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_video_transcription_job(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.record_video_transcription_stage(uuid, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.record_video_transcription_result(uuid, text, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.record_video_transcription_failure(uuid, text, integer, text, text, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.recover_stale_video_transcription_job(uuid, integer) from public, anon, authenticated;
