begin;

alter table public.course_generation_jobs
  add column if not exists request_json jsonb not null default '{}'::jsonb,
  add column if not exists stage text not null default 'preparing',
  add column if not exists stage_message text,
  add column if not exists workflow_run_id text,
  add column if not exists total_units integer not null default 0 check (total_units >= 0),
  add column if not exists completed_units integer not null default 0 check (completed_units >= 0),
  add column if not exists outline_json jsonb,
  add column if not exists thumbnail_url text,
  add column if not exists thumbnail_status text not null default 'pending'
    check (thumbnail_status in ('pending', 'completed', 'failed')),
  add column if not exists warning_count integer not null default 0 check (warning_count >= 0),
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists error_code text;

alter table public.course_generation_jobs
  drop constraint if exists course_generation_jobs_status_check;

alter table public.course_generation_jobs
  add constraint course_generation_jobs_status_check
  check (status in (
    'processing',
    'uploading',
    'queued',
    'running',
    'completed',
    'failed',
    'cancelled'
  ));

alter table public.course_source_documents
  drop constraint if exists course_source_documents_status_check;

alter table public.course_source_documents
  add constraint course_source_documents_status_check
  check (status in ('uploaded', 'processing', 'ready', 'failed'));

create table if not exists public.course_generation_lessons (
  id uuid default gen_random_uuid() primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  generation_job_id uuid not null references public.course_generation_jobs(id) on delete cascade,
  module_index integer not null check (module_index >= 0),
  lesson_index integer not null check (lesson_index >= 0),
  module_title text not null,
  title text not null,
  concept text,
  target_activity text,
  status text not null default 'pending'
    check (status in ('pending', 'writing', 'assets', 'completed', 'failed')),
  content_json jsonb,
  gamma_generation_id text,
  gamma_id text,
  gamma_url text,
  gamma_export_id text,
  gamma_pdf_url text,
  audio_tracks jsonb not null default '[]'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (generation_job_id, module_index, lesson_index)
);

create index if not exists idx_course_generation_jobs_active
  on public.course_generation_jobs(account_id, status, created_at desc);

create index if not exists idx_course_generation_jobs_creator
  on public.course_generation_jobs(created_by, created_at desc);

create index if not exists idx_course_generation_lessons_job
  on public.course_generation_lessons(generation_job_id, module_index, lesson_index);

alter table public.course_generation_lessons enable row level security;

drop policy if exists "Managers can view course generation lessons"
  on public.course_generation_lessons;
create policy "Managers can view course generation lessons"
  on public.course_generation_lessons for select
  using (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "Managers can update course generation jobs"
  on public.course_generation_jobs;

revoke update on public.course_generation_jobs from authenticated;
grant select, insert, delete on public.course_generation_jobs to authenticated;
grant select on public.course_generation_lessons to authenticated;

drop policy if exists "Managers can create course source documents"
  on public.course_source_documents;
create policy "Managers can create course source documents"
  on public.course_source_documents for insert
  with check (
    created_by = auth.uid()
    and public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
    and exists (
      select 1
      from public.course_generation_jobs job
      where job.id = course_source_documents.generation_job_id
        and job.account_id = course_source_documents.account_id
        and job.status in ('processing', 'uploading')
    )
  );

create or replace function public.create_background_course_generation_job(
  p_title text,
  p_objective text default null,
  p_request_json jsonb default '{}'::jsonb
)
returns public.course_generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.course_generation_jobs;
  v_account_id uuid;
  v_account_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(pg_catalog.btrim(coalesce(p_title, '')), '') is null then
    raise exception 'Course title is required' using errcode = '22023';
  end if;

  select pg_catalog.count(*)
  into v_account_count
  from public.account_memberships membership
  where membership.user_id = auth.uid()
    and membership.role in ('manager', 'admin');

  if v_account_count <> 1 then
    raise exception 'Exactly one manager workspace membership is required' using errcode = '42501';
  end if;

  select membership.account_id
  into v_account_id
  from public.account_memberships membership
  where membership.user_id = auth.uid()
    and membership.role in ('manager', 'admin')
  limit 1;

  insert into public.course_generation_jobs (
    account_id,
    title,
    objective,
    request_json,
    status,
    stage,
    stage_message,
    created_by
  )
  values (
    v_account_id,
    pg_catalog.btrim(p_title),
    nullif(pg_catalog.btrim(coalesce(p_objective, '')), ''),
    coalesce(p_request_json, '{}'::jsonb),
    'uploading',
    'uploading_sources',
    'Preparing course source files',
    auth.uid()
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function public.create_background_course_generation_job(text, text, jsonb) from public;
grant execute on function public.create_background_course_generation_job(text, text, jsonb) to authenticated;

create or replace function public.prepare_background_course_generation_start(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.course_generation_jobs;
  v_role text;
begin
  select * into v_job
  from public.course_generation_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Course generation job not found' using errcode = 'P0002';
  end if;

  v_role := public.get_user_account_role(v_job.account_id, auth.uid());
  if v_job.created_by is distinct from auth.uid() and v_role <> 'admin' then
    raise exception 'Course generation job not found' using errcode = '42501';
  end if;

  if v_job.status in ('queued', 'running') or v_job.workflow_run_id = 'starting' then
    return pg_catalog.jsonb_build_object(
      'should_start', false,
      'job', pg_catalog.to_jsonb(v_job)
    );
  end if;

  if v_job.status not in ('uploading', 'processing', 'failed', 'cancelled') then
    raise exception 'Course generation job cannot be started' using errcode = '22000';
  end if;

  if v_job.status = 'failed' then
    update public.course_generation_lessons
    set gamma_generation_id = case when gamma_id is null then null else gamma_generation_id end,
        gamma_export_id = case when gamma_pdf_url is null then null else gamma_export_id end,
        error_code = null,
        error_message = null,
        updated_at = pg_catalog.now()
    where generation_job_id = p_job_id
      and status <> 'completed';
  end if;

  update public.course_generation_jobs
  set status = 'queued',
      stage = 'queued',
      stage_message = 'Course generation queued',
      workflow_run_id = 'starting',
      thumbnail_status = case
        when v_job.status = 'failed' and thumbnail_status = 'failed' then 'pending'
        else thumbnail_status
      end,
      cancel_requested_at = null,
      finished_at = null,
      error_code = null,
      error_message = null,
      updated_at = pg_catalog.now()
  where id = p_job_id
  returning * into v_job;

  return pg_catalog.jsonb_build_object(
    'should_start', true,
    'job', pg_catalog.to_jsonb(v_job)
  );
end;
$$;

revoke execute on function public.prepare_background_course_generation_start(uuid) from public;
grant execute on function public.prepare_background_course_generation_start(uuid) to authenticated;

create or replace function public.request_course_generation_cancel(
  p_job_id uuid
)
returns public.course_generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.course_generation_jobs;
  v_role text;
begin
  select * into v_job
  from public.course_generation_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Course generation job not found' using errcode = 'P0002';
  end if;

  v_role := public.get_user_account_role(v_job.account_id, auth.uid());
  if v_job.created_by is distinct from auth.uid() and v_role <> 'admin' then
    raise exception 'Course generation job not found' using errcode = '42501';
  end if;

  if v_job.status not in ('uploading', 'queued', 'running', 'processing') then
    return v_job;
  end if;

  if v_job.status = 'uploading' then
    update public.course_generation_jobs
    set status = 'cancelled',
        stage = 'cancelled',
        stage_message = 'Course generation cancelled',
        cancel_requested_at = pg_catalog.now(),
        finished_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = p_job_id
    returning * into v_job;
    return v_job;
  end if;

  update public.course_generation_jobs
  set cancel_requested_at = pg_catalog.now(),
      stage_message = 'Cancellation requested',
      updated_at = pg_catalog.now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function public.request_course_generation_cancel(uuid) from public;
grant execute on function public.request_course_generation_cancel(uuid) to authenticated;

create or replace function public.claim_background_course_generation(
  p_job_id uuid
)
returns public.course_generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.course_generation_jobs;
begin
  select * into v_job
  from public.course_generation_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Course generation job not found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_job.account_id::text, 1)
  );

  if v_job.cancel_requested_at is not null then
    update public.course_generation_jobs
    set status = 'cancelled',
        stage = 'cancelled',
        stage_message = 'Course generation cancelled',
        finished_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = p_job_id
    returning * into v_job;
    return v_job;
  end if;

  if exists (
    select 1
    from public.course_generation_jobs active_job
    where active_job.account_id = v_job.account_id
      and active_job.id <> p_job_id
      and active_job.status = 'running'
  ) then
    update public.course_generation_jobs
    set status = 'queued',
        stage = 'queued',
        stage_message = 'Waiting for the current course to finish',
        updated_at = pg_catalog.now()
    where id = p_job_id
    returning * into v_job;
    return v_job;
  end if;

  update public.course_generation_jobs
  set status = 'running',
      stage = case when outline_json is null then 'processing_sources' else stage end,
      stage_message = case when outline_json is null then 'Preparing course sources' else stage_message end,
      started_at = coalesce(started_at, pg_catalog.now()),
      last_heartbeat_at = pg_catalog.now(),
      attempt_count = attempt_count + 1,
      error_code = null,
      error_message = null,
      updated_at = pg_catalog.now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function public.claim_background_course_generation(uuid) from public;
revoke execute on function public.claim_background_course_generation(uuid) from authenticated;
grant execute on function public.claim_background_course_generation(uuid) to service_role;

create or replace function public.match_course_source_chunks_for_worker(
  query_embedding public.vector(1536),
  p_generation_job_id uuid,
  p_account_id uuid,
  match_threshold float default 0.18,
  match_count integer default 6
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  document_name text,
  page_start integer,
  page_end integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    chunk.id,
    chunk.document_id,
    chunk.content,
    1 - (chunk.embedding OPERATOR(public.<=>) query_embedding) as similarity,
    document.original_name as document_name,
    chunk.page_start,
    chunk.page_end
  from public.course_source_chunks chunk
  join public.course_source_documents document
    on document.id = chunk.document_id
  where document.generation_job_id = p_generation_job_id
    and document.account_id = p_account_id
    and document.status = 'ready'
    and 1 - (chunk.embedding OPERATOR(public.<=>) query_embedding) > match_threshold
  order by chunk.embedding OPERATOR(public.<=>) query_embedding
  limit least(greatest(match_count, 1), 12);
$$;

revoke execute on function public.match_course_source_chunks_for_worker(public.vector, uuid, uuid, float, integer) from public;
revoke execute on function public.match_course_source_chunks_for_worker(public.vector, uuid, uuid, float, integer) from authenticated;
grant execute on function public.match_course_source_chunks_for_worker(public.vector, uuid, uuid, float, integer) to service_role;

create or replace function public.finalise_background_course_generation(
  p_job_id uuid,
  p_title text,
  p_description text,
  p_content_json jsonb,
  p_thumbnail_url text,
  p_allow_pretest boolean default false
)
returns public.courses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.course_generation_jobs;
  v_course public.courses;
begin
  select * into v_job
  from public.course_generation_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Course generation job not found' using errcode = 'P0002';
  end if;

  if v_job.course_id is not null then
    select * into v_course from public.courses where id = v_job.course_id;
    return v_course;
  end if;

  if v_job.status <> 'running' then
    raise exception 'Course generation job is not running' using errcode = '22000';
  end if;

  if v_job.cancel_requested_at is not null then
    raise exception 'Course generation job has been cancelled' using errcode = '57014';
  end if;

  if exists (
    select 1
    from public.course_generation_lessons lesson
    where lesson.generation_job_id = p_job_id
      and lesson.status <> 'completed'
  ) or not exists (
    select 1
    from public.course_generation_lessons lesson
    where lesson.generation_job_id = p_job_id
  ) then
    raise exception 'Course lessons are not complete' using errcode = '22000';
  end if;

  insert into public.courses (
    account_id,
    title,
    description,
    content_json,
    thumbnail_url,
    allow_pretest,
    status
  )
  values (
    v_job.account_id,
    p_title,
    p_description,
    p_content_json,
    p_thumbnail_url,
    coalesce(p_allow_pretest, false),
    'draft'
  )
  returning * into v_course;

  update public.course_generation_jobs
  set course_id = v_course.id,
      status = 'completed',
      stage = 'completed',
      stage_message = 'Course draft is ready',
      completed_units = greatest(completed_units, total_units),
      error_code = null,
      error_message = null,
      finished_at = pg_catalog.now(),
      completed_at = pg_catalog.now(),
      last_heartbeat_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_job_id;

  if v_job.created_by is not null then
    insert into public.notifications (
      recipient_id,
      sender_id,
      type,
      message,
      related_course_id
    ) values (
      v_job.created_by,
      null,
      'system_alert',
      'Your generated course is ready to review.',
      v_course.id
    );
  end if;

  return v_course;
end;
$$;

revoke execute on function public.finalise_background_course_generation(uuid, text, text, jsonb, text, boolean) from public;
revoke execute on function public.finalise_background_course_generation(uuid, text, text, jsonb, text, boolean) from authenticated;
grant execute on function public.finalise_background_course_generation(uuid, text, text, jsonb, text, boolean) to service_role;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'course_generation_jobs'
  ) then
    alter publication supabase_realtime add table public.course_generation_jobs;
  end if;
end;
$$;

commit;
