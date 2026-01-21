-- Fix Course Deletion Permissions and Constraints
-- Copy and Run this in the Supabase SQL Editor

-- 1. Ensure ON DELETE CASCADE for user_progress
-- We drop and re-add the constraint to ensure it cascades deletes from courses -> user_progress
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_progress_course_id_fkey') THEN
    ALTER TABLE public.user_progress DROP CONSTRAINT user_progress_course_id_fkey;
  END IF;
END $$;

ALTER TABLE public.user_progress
ADD CONSTRAINT user_progress_course_id_fkey
FOREIGN KEY (course_id)
REFERENCES public.courses(id)
ON DELETE CASCADE;

-- 2. Grant Managers permission to delete user_progress rows
-- This allows the 'manager' role to delete progress records for ANY user, which is required when deleting a course.
DROP POLICY IF EXISTS "Managers can delete any progress" ON public.user_progress;
CREATE POLICY "Managers can delete any progress" ON public.user_progress
  FOR DELETE USING (public.get_my_role() = 'manager');

-- 3. Grant Managers permission to delete courses
-- Ensures managers have explicit permission to delete rows from the courses table.
DROP POLICY IF EXISTS "Managers can delete courses" ON public.courses;
CREATE POLICY "Managers can delete courses" ON public.courses
  FOR DELETE USING (public.get_my_role() = 'manager');
