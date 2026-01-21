-- Create a "Security Definer" function to delete courses
-- This runs with SYSTEM privileges, effectively bypassing Row Level Security on the tables.
-- Run this in Supabase SQL Editor.

create or replace function delete_course_admin(target_course_id uuid)
returns void
language plpgsql
security definer -- This is the magic keyword. It runs as the database owner.
as $$
begin
  -- 1. Verify the user is a manager
  if not exists (
      select 1 from public.profiles 
      where id = auth.uid() 
      and role = 'manager'
  ) then
     raise exception 'Access Denied: You must be a Manager to delete courses.';
  end if;

  -- 2. Delete foreign keys (user_progress) explicitly just in case cascades fail
  delete from public.user_progress where course_id = target_course_id;

  -- 3. Delete the course
  delete from public.courses where id = target_course_id;
  
end;
$$;
