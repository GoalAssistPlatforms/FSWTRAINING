-- 1. Drop old team-specific helper functions
drop function if exists public.regenerate_team_join_code(uuid) cascade;
drop function if exists public.join_team_with_code(text) cascade;
drop function if exists public.is_manager_of_team(uuid) cascade;
drop function if exists public.is_in_team(uuid) cascade;
drop function if exists public.is_manager_of_user(uuid) cascade;

-- 2. Update Profiles Policy
drop policy if exists "Managers can view team member profiles" on public.profiles;

create policy "Managers can view all profiles" on public.profiles
  for select using (
    public.get_my_role() = 'manager'
  );

-- 3. Update User Progress Policy
drop policy if exists "Managers manage team progress" on public.user_progress;

create policy "Managers manage all user progress" on public.user_progress
  for all using (
    public.get_my_role() = 'manager'
  );

-- (Optional: We leave the basic tables and table-specific table-RLS alone to prevent breaking data initially,
--  they simply won't be actively queried anymore.)
