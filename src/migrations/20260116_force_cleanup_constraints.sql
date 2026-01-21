-- FORCE CLEANUP of Foreign Keys on user_progress
-- Run this in Supabase SQL Editor

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find ALL foreign keys on user_progress.course_id
    FOR r IN (
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = 'user_progress'
          AND kcu.column_name = 'course_id'
          AND tc.constraint_type = 'FOREIGN KEY'
    ) LOOP
        -- Drop the constraint
        RAISE NOTICE 'Dropping constraint: %', r.constraint_name;
        EXECUTE 'ALTER TABLE public.user_progress DROP CONSTRAINT "' || r.constraint_name || '"';
    END LOOP;
END $$;

-- Re-add the correct Cascade Constraint
ALTER TABLE public.user_progress
ADD CONSTRAINT user_progress_course_id_fkey_cascade
FOREIGN KEY (course_id)
REFERENCES public.courses(id)
ON DELETE CASCADE;

-- Ensure RLS Policies are correct (Just to be safe)
DROP POLICY IF EXISTS "Managers can delete any progress" ON public.user_progress;
CREATE POLICY "Managers can delete any progress" ON public.user_progress
  FOR DELETE USING (public.get_my_role() = 'manager');

DROP POLICY IF EXISTS "Managers can delete courses" ON public.courses;
CREATE POLICY "Managers can delete courses" ON public.courses
  FOR DELETE USING (public.get_my_role() = 'manager');
