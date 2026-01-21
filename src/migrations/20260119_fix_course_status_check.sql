-- Fix for "courses_status_check" violation
-- The previous constraint likely only allowed 'draft' and 'live'.
-- We need to allow 'archived' for the soft delete to work.

ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_status_check;

ALTER TABLE public.courses 
  ADD CONSTRAINT courses_status_check 
  CHECK (status IN ('draft', 'live', 'archived'));
