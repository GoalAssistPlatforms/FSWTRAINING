begin;

create extension if not exists vector;

create table if not exists public.course_generation_jobs (
  id uuid default gen_random_uuid() primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  title text not null,
  objective text,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  error_message text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.course_source_documents (
  id uuid default gen_random_uuid() primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  generation_job_id uuid not null references public.course_generation_jobs(id) on delete cascade,
  original_name text not null check (length(trim(original_name)) > 0),
  mime_type text not null
    check (mime_type in ('application/pdf', 'text/plain', 'text/markdown')),
  size_bytes bigint not null check (size_bytes between 0 and 20971520),
  storage_path text not null unique,
  extracted_characters integer not null default 0,
  page_count integer,
  summary text,
  key_topics text[] not null default '{}',
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  error_message text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_source_chunks (
  id uuid default gen_random_uuid() primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_id uuid not null references public.course_source_documents(id) on delete cascade,
  content text not null,
  embedding vector(1536) not null,
  chunk_index integer not null,
  page_start integer,
  page_end integer,
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists idx_course_generation_jobs_account
  on public.course_generation_jobs(account_id);
create index if not exists idx_course_generation_jobs_course
  on public.course_generation_jobs(course_id);
create index if not exists idx_course_source_documents_job
  on public.course_source_documents(generation_job_id);
create index if not exists idx_course_source_documents_account
  on public.course_source_documents(account_id);
create index if not exists idx_course_source_chunks_document
  on public.course_source_chunks(document_id, chunk_index);
create index if not exists idx_course_source_chunks_embedding
  on public.course_source_chunks using hnsw (embedding vector_cosine_ops);

alter table public.course_generation_jobs enable row level security;
alter table public.course_source_documents enable row level security;
alter table public.course_source_chunks enable row level security;

create or replace function public.enforce_course_source_document_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document_count integer;
  v_total_bytes bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.generation_job_id::text, 0)
  );

  select count(*), coalesce(sum(document.size_bytes), 0)
  into v_document_count, v_total_bytes
  from public.course_source_documents document
  where document.generation_job_id = new.generation_job_id;

  if v_document_count >= 10 then
    raise exception 'A course can have no more than 10 source documents' using errcode = '22023';
  end if;

  if v_total_bytes + new.size_bytes > 52428800 then
    raise exception 'Course source documents cannot exceed 50 MB in total' using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_course_source_document_limits() from public;

drop trigger if exists enforce_course_source_document_limits
  on public.course_source_documents;
create trigger enforce_course_source_document_limits
  before insert on public.course_source_documents
  for each row execute function public.enforce_course_source_document_limits();

drop policy if exists "Managers can view course generation jobs" on public.course_generation_jobs;
create policy "Managers can view course generation jobs"
  on public.course_generation_jobs for select
  using (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "Managers can create course generation jobs" on public.course_generation_jobs;
create policy "Managers can create course generation jobs"
  on public.course_generation_jobs for insert
  with check (
    created_by = auth.uid()
    and public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "Managers can update course generation jobs" on public.course_generation_jobs;
create policy "Managers can update course generation jobs"
  on public.course_generation_jobs for update
  using (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  )
  with check (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "Managers can delete course generation jobs" on public.course_generation_jobs;
create policy "Managers can delete course generation jobs"
  on public.course_generation_jobs for delete
  using (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "Managers can view course source documents" on public.course_source_documents;
create policy "Managers can view course source documents"
  on public.course_source_documents for select
  using (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "Managers can create course source documents" on public.course_source_documents;
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
        and job.status = 'processing'
    )
  );

drop policy if exists "Managers can update course source documents" on public.course_source_documents;
create policy "Managers can update course source documents"
  on public.course_source_documents for update
  using (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  )
  with check (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
    and exists (
      select 1
      from public.course_generation_jobs job
      where job.id = course_source_documents.generation_job_id
        and job.account_id = course_source_documents.account_id
    )
  );

drop policy if exists "Managers can delete course source documents" on public.course_source_documents;
create policy "Managers can delete course source documents"
  on public.course_source_documents for delete
  using (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "Managers can view course source chunks" on public.course_source_chunks;
create policy "Managers can view course source chunks"
  on public.course_source_chunks for select
  using (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "Managers can create course source chunks" on public.course_source_chunks;
create policy "Managers can create course source chunks"
  on public.course_source_chunks for insert
  with check (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
    and exists (
      select 1
      from public.course_source_documents document
      join public.course_generation_jobs job
        on job.id = document.generation_job_id
      where document.id = course_source_chunks.document_id
        and document.account_id = course_source_chunks.account_id
        and document.status = 'processing'
        and job.status = 'processing'
    )
  );

drop policy if exists "Managers can delete course source chunks" on public.course_source_chunks;
create policy "Managers can delete course source chunks"
  on public.course_source_chunks for delete
  using (
    public.get_user_account_role(account_id, auth.uid()) in ('manager', 'admin')
  );

create or replace function public.create_course_generation_job(
  p_title text,
  p_objective text default null
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

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Course title is required' using errcode = '22023';
  end if;

  select count(*)
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
    created_by
  )
  values (
    v_account_id,
    trim(p_title),
    nullif(trim(coalesce(p_objective, '')), ''),
    auth.uid()
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function public.create_course_generation_job(text, text) from public;
grant execute on function public.create_course_generation_job(text, text) to authenticated;

create or replace function public.complete_course_generation_job(
  p_job_id uuid,
  p_course_id uuid
)
returns public.course_generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.course_generation_jobs;
  v_course_account_id uuid;
begin
  select * into v_job
  from public.course_generation_jobs
  where id = p_job_id
  for update;

  if v_job.id is null
    or (public.get_user_account_role(v_job.account_id, auth.uid()) in ('manager', 'admin')) is not true then
    raise exception 'Course generation job not found' using errcode = '42501';
  end if;

  if v_job.status <> 'processing' or v_job.course_id is not null then
    raise exception 'Course generation job has already been finalised' using errcode = '22000';
  end if;

  if not exists (
    select 1
    from public.course_source_documents document
    where document.generation_job_id = p_job_id
      and document.status = 'ready'
  ) or exists (
    select 1
    from public.course_source_documents document
    where document.generation_job_id = p_job_id
      and document.status <> 'ready'
  ) then
    raise exception 'Course source documents are not ready' using errcode = '22000';
  end if;

  select account_id into v_course_account_id
  from public.courses
  where id = p_course_id;

  if v_course_account_id is distinct from v_job.account_id then
    raise exception 'Course and source documents belong to different workspaces' using errcode = '22000';
  end if;

  update public.course_generation_jobs
  set course_id = p_course_id,
      status = 'completed',
      error_message = null,
      completed_at = now(),
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function public.complete_course_generation_job(uuid, uuid) from public;
grant execute on function public.complete_course_generation_job(uuid, uuid) to authenticated;

create or replace function public.match_course_source_chunks(
  query_embedding vector(1536),
  p_generation_job_id uuid,
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
security invoker
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
    and document.status = 'ready'
    and public.get_user_account_role(document.account_id, auth.uid()) in ('manager', 'admin')
    and 1 - (chunk.embedding OPERATOR(public.<=>) query_embedding) > match_threshold
  order by chunk.embedding OPERATOR(public.<=>) query_embedding
  limit least(greatest(match_count, 1), 12);
$$;

revoke execute on function public.match_course_source_chunks(vector, uuid, float, integer) from public;
grant execute on function public.match_course_source_chunks(vector, uuid, float, integer) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'course_sources',
  'course_sources',
  false,
  20971520,
  array['application/pdf', 'text/plain', 'text/markdown']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Managers can read course source files" on storage.objects;
create policy "Managers can read course source files"
  on storage.objects for select
  using (
    bucket_id = 'course_sources'
    and exists (
      select 1
      from public.account_memberships membership
      where membership.user_id = auth.uid()
        and membership.role in ('manager', 'admin')
        and membership.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Managers can upload course source files" on storage.objects;
create policy "Managers can upload course source files"
  on storage.objects for insert
  with check (
    bucket_id = 'course_sources'
    and exists (
      select 1
      from public.account_memberships membership
      where membership.user_id = auth.uid()
        and membership.role in ('manager', 'admin')
        and membership.account_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Managers can delete course source files" on storage.objects;
create policy "Managers can delete course source files"
  on storage.objects for delete
  using (
    bucket_id = 'course_sources'
    and exists (
      select 1
      from public.account_memberships membership
      where membership.user_id = auth.uid()
        and membership.role in ('manager', 'admin')
        and membership.account_id::text = (storage.foldername(name))[1]
    )
  );

commit;
