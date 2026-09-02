-- Migration: Background transcription via Vercel Workflows
-- Date: 2026-09-02
--
-- Transcription jobs are processed by a Vercel Workflow run started from
-- /api/transcription/start rather than by an always-on polling worker. The
-- existing lease, stage and result functions are reused unchanged; this adds
-- the pieces a per-job run needs: a way to claim one specific job, a start
-- handshake for the web app, and a record of which run owns the job.

alter table public.video_transcription_jobs
  add column if not exists workflow_run_id text;

comment on column public.video_transcription_jobs.workflow_run_id is
  'Vercel Workflow run processing this job. "starting" while the run is being created.';

-- 1. Start handshake (called by the web app through the start endpoint).
create or replace function public.prepare_video_transcription_start(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.video_transcription_jobs;
  v_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_job
  from public.video_transcription_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'TRANSCRIPTION_JOB_NOT_FOUND' using errcode = '22000';
  end if;

  if not public.can_edit_video_editor_guide(v_job.guide_id) then
    raise exception 'TRANSCRIPTION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if v_job.provider = 'manual_import' then
    raise exception 'TRANSCRIPTION_ILLEGAL_STATE: Manual imports are not transcribed in the background' using errcode = '22000';
  end if;

  v_now := pg_catalog.clock_timestamp();

  -- A run is already processing this job.
  if v_job.status in ('extracting_audio', 'transcribing', 'validating') then
    return pg_catalog.jsonb_build_object('should_start', false, 'job', pg_catalog.to_jsonb(v_job));
  end if;

  -- A run is attached and waiting to retry. Allow a fresh start only if it has gone quiet for
  -- much longer than the longest retry delay, which means the run was lost.
  if v_job.status = 'queued'
     and v_job.workflow_run_id is not null
     and v_job.updated_at > v_now - interval '30 minutes' then
    return pg_catalog.jsonb_build_object('should_start', false, 'job', pg_catalog.to_jsonb(v_job));
  end if;

  if v_job.status <> 'queued' then
    raise exception 'TRANSCRIPTION_ILLEGAL_STATE: Only queued jobs can be started' using errcode = '22000';
  end if;

  update public.video_transcription_jobs
  set workflow_run_id = 'starting',
      updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  return pg_catalog.jsonb_build_object('should_start', true, 'job', pg_catalog.to_jsonb(v_job));
end;
$$;

revoke all on function public.prepare_video_transcription_start(uuid) from public, anon;
grant execute on function public.prepare_video_transcription_start(uuid) to authenticated;

-- 2. Claim one specific job (called by the workflow with the service role).
-- Returns the job row either way: the caller checks the status to see whether the claim took.
-- A job whose next attempt is still in the future is returned unchanged so the run can sleep.
create or replace function public.claim_video_transcription_job(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_duration_seconds integer
)
returns public.video_transcription_jobs
language plpgsql
security definer
set search_path = ''
as $$
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

  select * into v_job
  from public.video_transcription_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'TRANSCRIPTION_JOB_NOT_FOUND' using errcode = '22000';
  end if;

  if v_job.status <> 'queued'
     or v_job.provider = 'manual_import'
     or (v_job.next_attempt_at is not null and v_job.next_attempt_at > v_now) then
    return v_job;
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
$$;

revoke all on function public.claim_video_transcription_job(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_video_transcription_job(uuid, text, integer) to service_role;

-- 3. A manual retry detaches the finished run so the web app can start a new one.
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
    lease_expires_at = null,
    workflow_run_id = null
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$ language plpgsql security definer set search_path = '';
