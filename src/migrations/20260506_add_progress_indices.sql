-- Migration to add progress tracking columns to user_progress
ALTER TABLE public.user_progress
ADD COLUMN IF NOT EXISTS last_module_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_lesson_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS highest_module_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS highest_lesson_index integer DEFAULT 0;
