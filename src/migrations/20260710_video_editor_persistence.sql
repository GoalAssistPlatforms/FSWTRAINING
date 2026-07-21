-- 20260710_video_editor_persistence.sql
-- Run this in your Supabase SQL Editor to introduce persistence for the new video editor.

-- 1. Table public.accounts
create table if not exists public.accounts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz default now() not null
);

-- 2. Table public.account_memberships
create table if not exists public.account_memberships (
  account_id uuid references public.accounts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null check (role in ('learner', 'editor', 'manager', 'admin')),
  created_at timestamptz default now() not null,
  primary key (account_id, user_id)
);

-- 3. Trigger function to enforce membership changes security
create or replace function public.check_membership_change()
returns trigger as $$
declare
  v_caller_role text;
begin
  -- Bypass check only if executing in a trusted database owner context
  if session_user = (
    select pg_catalog.pg_get_userbyid(database_record.datdba)
    from pg_catalog.pg_database as database_record
    where database_record.datname = current_database()
  ) then
    return new;
  end if;

  -- Get caller's membership role in the target account
  select role into v_caller_role from public.account_memberships
  where account_id = coalesce(new.account_id, old.account_id)
  and user_id = auth.uid();

  -- Reject if caller has no role
  if v_caller_role is null then
    raise exception 'Access Denied: membership required' using errcode = '42501';
  end if;

  -- Block self-promotion or promotion beyond caller's role
  if TG_OP = 'UPDATE' then
    if old.account_id != new.account_id then
      raise exception 'Cannot change account of membership' using errcode = '42501';
    end if;
    if old.user_id != new.user_id then
      raise exception 'Cannot change user of membership' using errcode = '42501';
    end if;
    if old.role != new.role then
      -- Only admin can change roles
      if v_caller_role != 'admin' then
        raise exception 'Only account administrators can change roles' using errcode = '42501';
      end if;
    end if;
  end if;

  if TG_OP = 'INSERT' then
    if v_caller_role != 'admin' and v_caller_role != 'manager' then
      raise exception 'Only administrators or managers can insert memberships' using errcode = '42501';
    end if;
    -- Cannot insert a role higher than caller's role
    if new.role = 'admin' and v_caller_role != 'admin' then
      raise exception 'Cannot promote to admin' using errcode = '42501';
    end if;
  end if;

  if TG_OP = 'DELETE' then
    if v_caller_role != 'admin' and v_caller_role != 'manager' then
      raise exception 'Only administrators or managers can delete memberships' using errcode = '42501';
    end if;
    if old.role = 'admin' and v_caller_role != 'admin' then
      raise exception 'Cannot delete admin membership' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists enforce_membership_security on public.account_memberships;
create trigger enforce_membership_security
  before insert or update or delete on public.account_memberships
  for each row execute function public.check_membership_change();

-- 4. Alter courses table to add account isolation column (nullable initially)
alter table public.courses add column if not exists account_id uuid references public.accounts(id) on delete cascade;

-- 5. Safe backfill path inside a transaction block
do $$
declare
  v_bootstrap_id uuid;
begin
  -- Check if there are existing courses
  if exists (select 1 from public.courses where account_id is null) then
    -- Create bootstrap account if not exists
    insert into public.accounts (name)
    values ('Bootstrap Platform Account')
    returning id into v_bootstrap_id;

    -- Assign courses to bootstrap account
    update public.courses
    set account_id = v_bootstrap_id
    where account_id is null;

    -- Create memberships for existing managers and admins
    insert into public.account_memberships (account_id, user_id, role)
    select v_bootstrap_id, id, role
    from public.profiles
    where role in ('manager', 'admin')
    on conflict do nothing;
  end if;

  -- Ensure no course remains without an account
  if exists (select 1 from public.courses where account_id is null) then
    raise exception 'Migration failed: Not all courses could be assigned to a bootstrap account.';
  end if;
end;
$$;

-- Make account_id required and enforce constraints
alter table public.courses alter column account_id set not null;

-- 6. Table public.video_source_assets
create table if not exists public.video_source_assets (
  id uuid default gen_random_uuid() primary key,
  account_id uuid references public.accounts(id) on delete cascade not null,
  guide_id uuid references public.courses(id) on delete cascade not null,
  original_storage_path text not null,
  proxy_storage_path text,
  audio_storage_path text,
  duration_seconds numeric not null check (duration_seconds >= 0),
  width integer check (width is null or width >= 0),
  height integer check (height is null or height >= 0),
  frame_rate numeric,
  video_codec text,
  audio_codec text,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  preparation_status text not null check (preparation_status in ('uploaded', 'preparing', 'ready', 'failed')),
  preparation_error text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Trigger function to enforce original storage path immutability
create or replace function public.check_original_storage_path_immutable()
returns trigger as $$
begin
  -- Bypass check only if executing in a trusted database owner context
  if session_user = (
    select pg_catalog.pg_get_userbyid(database_record.datdba)
    from pg_catalog.pg_database as database_record
    where database_record.datname = current_database()
  ) then
    return new;
  end if;

  if new.original_storage_path is distinct from old.original_storage_path then
    raise exception 'original_storage_path is immutable' using errcode = '428C9';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists enforce_original_storage_path_immutable on public.video_source_assets;
create trigger enforce_original_storage_path_immutable
  before update on public.video_source_assets
  for each row execute function public.check_original_storage_path_immutable();

-- 7. Table public.video_editor_projects
create table if not exists public.video_editor_projects (
  id uuid default gen_random_uuid() primary key,
  account_id uuid references public.accounts(id) on delete cascade not null,
  guide_id uuid references public.courses(id) on delete cascade not null,
  source_asset_id uuid references public.video_source_assets(id) on delete cascade not null,
  schema_version integer not null check (schema_version = 2),
  revision integer not null check (revision >= 0),
  status text not null check (status in ('preparing', 'ready', 'editing', 'rendering', 'completed', 'failed')),
  sequence_json jsonb not null,
  legacy_video_edits_json jsonb default null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  last_saved_at timestamptz default null,
  constraint unique_guide_source_asset unique (guide_id, source_asset_id),
  constraint chk_sequence_asset_match check (((sequence_json->>'sourceAssetId') = source_asset_id::text) is true),
  constraint chk_sequence_schema_version check (((sequence_json->>'schemaVersion')::int = 2) is true),
  constraint chk_sequence_clips_array check ((jsonb_typeof(sequence_json->'clips') = 'array') is true)
);

-- 8. Table public.video_editor_commands
create table if not exists public.video_editor_commands (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.video_editor_projects(id) on delete cascade not null,
  project_revision integer not null check (project_revision >= 0),
  command_type text not null,
  payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
  inverse_payload_json jsonb not null check (jsonb_typeof(inverse_payload_json) = 'object'),
  group_id uuid default null,
  actor_id uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null
);

-- Trigger function to enforce append-only rule on commands
create or replace function public.block_command_modification()
returns trigger as $$
begin
  -- Bypass check only if executing in a trusted database owner context
  if session_user = (
    select pg_catalog.pg_get_userbyid(database_record.datdba)
    from pg_catalog.pg_database as database_record
    where database_record.datname = current_database()
  ) then
    return old;
  end if;

  raise exception 'video_editor_commands is append-only' using errcode = '428C9';
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists block_command_updates on public.video_editor_commands;
create trigger block_command_updates
  before update or delete on public.video_editor_commands
  for each row execute function public.block_command_modification();

-- Indexes
create index if not exists idx_courses_account on public.courses(account_id);
create index if not exists idx_ve_projects_guide on public.video_editor_projects(guide_id);
create index if not exists idx_ve_projects_source_asset on public.video_editor_projects(source_asset_id);
create index if not exists idx_ve_commands_project_revision on public.video_editor_commands(project_id, project_revision);
create index if not exists idx_ve_commands_project_created on public.video_editor_commands(project_id, created_at);

-- 9. Row Level Security Helper Functions
create or replace function public.get_user_account_role(p_account_id uuid, p_user_id uuid)
returns text as $$
declare
  v_role text;
begin
  select role into v_role from public.account_memberships
  where account_id = p_account_id and user_id = p_user_id;
  return v_role;
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.can_view_video_editor_guide(p_guide_id uuid)
returns boolean as $$
declare
  v_account_id uuid;
begin
  select account_id into v_account_id from public.courses where id = p_guide_id;
  if v_account_id is null then
    return false;
  end if;
  return (public.get_user_account_role(v_account_id, auth.uid()) in ('editor', 'manager', 'admin')) is true;
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.can_edit_video_editor_guide(p_guide_id uuid)
returns boolean as $$
declare
  v_account_id uuid;
begin
  select account_id into v_account_id from public.courses where id = p_guide_id;
  if v_account_id is null then
    return false;
  end if;
  return (public.get_user_account_role(v_account_id, auth.uid()) in ('manager', 'admin')) is true;
end;
$$ language plpgsql security definer set search_path = '';

-- Enable RLS
alter table public.accounts enable row level security;
alter table public.account_memberships enable row level security;
alter table public.video_source_assets enable row level security;
alter table public.video_editor_projects enable row level security;
alter table public.video_editor_commands enable row level security;

-- RLS Policies
-- Accounts
drop policy if exists "Members can view accounts" on public.accounts;
create policy "Members can view accounts" on public.accounts
  for select using (
    public.get_user_account_role(id, auth.uid()) is not null
  );

-- Memberships
drop policy if exists "Members can view memberships" on public.account_memberships;
create policy "Members can view memberships" on public.account_memberships
  for select using (
    public.get_user_account_role(account_id, auth.uid()) is not null
  );

-- Source Assets (only viewable/editable by editors with member role on guide's account)
drop policy if exists "Users can view source assets" on public.video_source_assets;
create policy "Users can view source assets" on public.video_source_assets
  for select using (public.can_view_video_editor_guide(guide_id));

drop policy if exists "Managers can insert source assets" on public.video_source_assets;
create policy "Managers can insert source assets" on public.video_source_assets
  for insert with check (public.can_edit_video_editor_guide(guide_id));

drop policy if exists "Managers can update source assets" on public.video_source_assets;
create policy "Managers can update source assets" on public.video_source_assets
  for update using (public.can_edit_video_editor_guide(guide_id));

-- Projects (only viewable/editable by editors with member role on guide's account)
drop policy if exists "Users can view editor projects" on public.video_editor_projects;
create policy "Users can view editor projects" on public.video_editor_projects
  for select using (public.can_view_video_editor_guide(guide_id));

drop policy if exists "Managers can insert editor projects" on public.video_editor_projects;
create policy "Managers can insert editor projects" on public.video_editor_projects
  for insert with check (public.can_edit_video_editor_guide(guide_id));

drop policy if exists "Managers can update editor projects" on public.video_editor_projects;
create policy "Managers can update editor projects" on public.video_editor_projects
  for update using (public.can_edit_video_editor_guide(guide_id));

-- Commands (only selectable by authorized editors on guide's account)
drop policy if exists "Users can view commands" on public.video_editor_commands;
create policy "Users can view commands" on public.video_editor_commands
  for select using (
    exists (
      select 1 from public.video_editor_projects p
      where p.id = project_id
      and public.can_view_video_editor_guide(p.guide_id)
    )
  );

-- 10. Secure Source Asset Creation RPC (Derives tenant and actor values server-side)
create or replace function public.create_video_source_asset(
  p_guide_id uuid,
  p_original_storage_path text,
  p_duration_seconds numeric,
  p_file_size_bytes bigint
)
returns public.video_source_assets as $$
declare
  v_asset public.video_source_assets;
  v_account_id uuid;
begin
  select account_id into v_account_id from public.courses where id = p_guide_id;
  if v_account_id is null then
    raise exception 'Invalid guide: no account associated' using errcode = '22000';
  end if;

  if not public.can_edit_video_editor_guide(p_guide_id) then
    raise exception 'Access Denied: Editing rights required for this guide.' using errcode = '42501';
  end if;

  insert into public.video_source_assets (
    account_id,
    guide_id,
    original_storage_path,
    duration_seconds,
    file_size_bytes,
    preparation_status,
    created_by
  )
  values (
    v_account_id,
    p_guide_id,
    p_original_storage_path,
    p_duration_seconds,
    p_file_size_bytes,
    'uploaded',
    auth.uid()
  )
  returning * into v_asset;

  return v_asset;
end;
$$ language plpgsql security definer set search_path = '';

-- Revoke default public execution
revoke execute on function public.create_video_source_asset(uuid, text, numeric, bigint) from public;
grant execute on function public.create_video_source_asset(uuid, text, numeric, bigint) to authenticated;

-- 11. Atomic Project Creation Function
create or replace function public.create_video_editor_project(
  p_guide_id uuid,
  p_source_asset_id uuid,
  p_sequence_json jsonb,
  p_legacy_video_edits_json jsonb default null
)
returns public.video_editor_projects as $$
declare
  v_project public.video_editor_projects;
  v_account_id uuid;
begin
  select account_id into v_account_id from public.courses where id = p_guide_id;
  if v_account_id is null then
    raise exception 'Invalid guide: no account associated' using errcode = '22000';
  end if;

  if not public.can_edit_video_editor_guide(p_guide_id) then
    raise exception 'Access Denied: Editing rights required for this guide.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.video_source_assets
    where id = p_source_asset_id and guide_id = p_guide_id
  ) then
    raise exception 'Source asset mismatch' using errcode = '22000';
  end if;

  if coalesce((p_sequence_json->>'schemaVersion')::int, 0) != 2 then
    raise exception 'Sequence schema version must be 2' using errcode = '22000';
  end if;

  if p_sequence_json->>'sourceAssetId' is distinct from p_source_asset_id::text then
    raise exception 'Sequence source asset ID mismatch' using errcode = '22000';
  end if;

  insert into public.video_editor_projects (
    account_id,
    guide_id,
    source_asset_id,
    schema_version,
    revision,
    status,
    sequence_json,
    legacy_video_edits_json,
    created_by
  )
  values (
    v_account_id,
    p_guide_id,
    p_source_asset_id,
    2,
    0,
    'ready',
    p_sequence_json,
    p_legacy_video_edits_json,
    auth.uid()
  )
  returning * into v_project;

  return v_project;
exception
  when unique_violation then
    raise exception 'PROJECT_CREATION_CONFLICT' using errcode = 'PVE02';
end;
$$ language plpgsql security definer set search_path = '';

-- Revoke default public execution
revoke execute on function public.create_video_editor_project(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.create_video_editor_project(uuid, uuid, jsonb, jsonb) to authenticated;

-- 12. Atomic Revision Controlled Saving Function
create or replace function public.save_video_editor_project(
  p_project_id uuid,
  p_expected_revision integer,
  p_sequence_json jsonb,
  p_status text default null,
  p_commands jsonb default '[]'::jsonb
)
returns public.video_editor_projects as $$
declare
  v_project public.video_editor_projects;
  v_new_revision integer;
  v_cmd jsonb;
begin
  select * into v_project from public.video_editor_projects
  where id = p_project_id for update;

  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  if not public.can_edit_video_editor_guide(v_project.guide_id) then
    raise exception 'Access Denied: Editing rights required for this project.' using errcode = '42501';
  end if;

  if v_project.revision != p_expected_revision then
    raise exception 'PROJECT_REVISION_CONFLICT: Expected revision %, but stored revision is %',
      p_expected_revision, v_project.revision using errcode = 'PVE01';
  end if;

  if coalesce((p_sequence_json->>'schemaVersion')::int, 0) != 2 then
    raise exception 'Sequence schema version must be 2' using errcode = '22000';
  end if;

  if p_sequence_json->>'sourceAssetId' is distinct from v_project.source_asset_id::text then
    raise exception 'Sequence source asset ID mismatch' using errcode = '22000';
  end if;

  v_new_revision := v_project.revision + 1;

  for v_cmd in select * from jsonb_array_elements(p_commands) loop
    if jsonb_typeof(v_cmd) != 'object' then
      raise exception 'Command is not a JSON object' using errcode = '22000';
    end if;

    insert into public.video_editor_commands (
      id,
      project_id,
      project_revision,
      command_type,
      payload_json,
      inverse_payload_json,
      group_id,
      actor_id
    )
    values (
      coalesce((v_cmd->>'id')::uuid, gen_random_uuid()),
      p_project_id,
      v_new_revision,
      v_cmd->>'type',
      v_cmd->'payload',
      v_cmd->'inversePayload',
      (v_cmd->>'groupId')::uuid,
      auth.uid()
    );
  end loop;

  update public.video_editor_projects
  set
    revision = v_new_revision,
    sequence_json = p_sequence_json,
    status = coalesce(p_status, status),
    updated_at = now(),
    last_saved_at = now()
  where id = p_project_id
  returning * into v_project;

  return v_project;
end;
$$ language plpgsql security definer set search_path = '';

-- Revoke default public execution
revoke execute on function public.save_video_editor_project(uuid, integer, jsonb, text, jsonb) from public;
grant execute on function public.save_video_editor_project(uuid, integer, jsonb, text, jsonb) to authenticated;
