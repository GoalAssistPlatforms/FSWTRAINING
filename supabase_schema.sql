-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  role text default 'user',
  created_at timestamptz default now()
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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- USER PROGRESS
create table if not exists public.user_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  course_id uuid references public.courses(id) on delete cascade not null,
  status text, -- 'completed', 'in-progress'
  completed_at timestamptz,
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

-- RLS POLICIES
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.user_progress enable row level security;

-- Profiles
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Managers can view all profiles" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Managers can view all profiles" on public.profiles
  for select using (public.get_my_role() = 'manager');

-- Courses
drop policy if exists "Public view live courses" on public.courses;
drop policy if exists "Managers view all courses" on public.courses;
create policy "Public view live courses" on public.courses
  for select using (status = 'live');

create policy "Managers view all courses" on public.courses
  for all using (public.get_my_role() = 'manager');

-- User Progress
drop policy if exists "Users view own progress" on public.user_progress;
create policy "Users view own progress" on public.user_progress
  for all using (auth.uid() = user_id);
