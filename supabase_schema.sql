-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  role text default 'user',
  created_at timestamptz default now()
);

-- TEAMS
create table if not exists public.teams (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  join_code text unique,
  manager_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- TEAM MEMBERS
create table if not exists public.team_members (
  team_id uuid references public.teams(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text default 'member',
  created_at timestamptz default now(),
  unique(team_id, user_id)
);

-- COURSES
create table if not exists public.courses (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  thumbnail_url text,
  video_bg_url text,
  content_json jsonb,
  status text default 'draft', -- 'draft', 'live', 'archived'
  expiry_months integer, -- Number of months before this course's certificate expires (null = never)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- USER PROGRESS
create table if not exists public.user_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  course_id uuid references public.courses(id) on delete cascade not null,
  status text, -- 'completed', 'in-progress'
  assigned_by uuid references public.profiles(id) on delete set null,
  due_date timestamptz,
  is_mandatory boolean default false,
  completed_at timestamptz,
  certificate_id uuid default uuid_generate_v4(), -- Auto-generate unique ID for the cert
  expires_at timestamptz, -- When the completion expires (based on course expiry_months)
  created_at timestamptz default now(),
  unique(user_id, course_id)
);

-- HELPER FUNCTION TO AVOID RLS RECURSION
-- This function runs with the privileges of the creator (system), bypassing RLS
create or replace function public.get_my_role()
returns text as $$
begin
  return (select role from public.profiles where id = auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- PLATFORM SETTINGS
create table if not exists public.platform_settings (
  id integer primary key default 1,
  max_users integer default 10,
  max_courses_per_period integer default 12,
  max_guides_per_period integer default 12,
  subscription_start_date timestamptz default now(),
  renewal_period_months integer default 12,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (id = 1) -- Ensures only one row exists
);

-- Platform Settings RLS
alter table public.platform_settings enable row level security;
drop policy if exists "Admins manage platform settings" on public.platform_settings;
drop policy if exists "Managers view platform settings" on public.platform_settings;

create policy "Admins manage platform settings" on public.platform_settings
  for all using (public.get_my_role() = 'admin');

create policy "Managers view platform settings" on public.platform_settings
  for select using (public.get_my_role() = 'manager' or public.get_my_role() = 'admin');
-- Team Code Regeneration Func and Join Logic Removed
-- Because the application is now a single-tenant model where managers see all users.

-- RLS POLICIES
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.user_progress enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- Teams
drop policy if exists "Managers manage own teams" on public.teams;
drop policy if exists "Users view own teams" on public.teams;

create policy "Managers manage own teams" on public.teams
  for all using (manager_id = auth.uid());

create policy "Users view own teams" on public.teams
  for select using (false); -- Obsolete

-- Team Members
drop policy if exists "Managers manage team members" on public.team_members;
drop policy if exists "Users view own team members" on public.team_members;

create policy "Managers manage team members" on public.team_members
  for all using (false); -- Obsolete

create policy "Users view own team members" on public.team_members
  for select using (false); -- Obsolete

-- Profiles
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Managers can view all profiles" on public.profiles;
drop policy if exists "Managers can view team member profiles" on public.profiles;

create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Managers and Admins can view all profiles" on public.profiles
  for select using (
    public.get_my_role() = 'manager' or public.get_my_role() = 'admin'
  );

-- Courses
drop policy if exists "Public view live courses" on public.courses;
drop policy if exists "Managers view all courses" on public.courses;
create policy "Public view live courses" on public.courses
  for select using (status = 'live' or public.get_my_role() = 'admin');

create policy "Managers and Admins view all courses" on public.courses
  for all using (public.get_my_role() = 'manager' or public.get_my_role() = 'admin');

-- User Progress
drop policy if exists "Users view own progress" on public.user_progress;
drop policy if exists "Managers view team progress" on public.user_progress;
drop policy if exists "Managers manage team progress" on public.user_progress;
drop policy if exists "Managers manage all user progress" on public.user_progress;

create policy "Users view own progress" on public.user_progress
  for all using (auth.uid() = user_id);

create policy "Managers and Admins manage all user progress" on public.user_progress
  for all using (
    public.get_my_role() = 'manager' or public.get_my_role() = 'admin'
  );

-- USER DELETION FUNCTION (RPC)
create or replace function public.delete_user_by_manager(target_user_id uuid)
returns boolean as $$
declare
    caller_role text;
begin
    -- Get the role of the user making the request
    select role into caller_role from public.profiles where id = auth.uid();
    
    -- Ensure the caller is a manager or admin
    if caller_role != 'manager' and caller_role != 'admin' then
        raise exception 'Unauthorized: Only managers and admins can delete users';
    end if;

    -- Ensure a manager isn't deleting themselves
    if auth.uid() = target_user_id then
        raise exception 'Unauthorized: Managers cannot delete their own accounts using this function';
    end if;

    -- Explicitly delete child records to avoid any FK constraint issues
    -- Some Supabase environments link these directly to auth.users without cascade
    delete from public.user_progress where user_id = target_user_id;
    delete from public.team_members where user_id = target_user_id;

    -- Delete from public.profiles
    delete from public.profiles where id = target_user_id;

    -- Delete from auth.users (this deletes the core auth account)
    delete from auth.users where id = target_user_id;

    return true;
end;
$$ language plpgsql security definer set search_path = public;
