-- Migration to add pre-test option and tracking

-- Add allow_pretest to courses table
alter table public.courses 
add column if not exists allow_pretest boolean default false not null;

-- Add exempted_lessons to user_progress table
alter table public.user_progress 
add column if not exists exempted_lessons jsonb default '[]'::jsonb not null;
