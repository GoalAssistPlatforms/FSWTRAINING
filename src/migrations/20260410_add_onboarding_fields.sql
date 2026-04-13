-- Add full_name column to profiles table if it doesn't already exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;

-- Add department column if it doesn't already exist (in case it wasn't added by the dashboard previously)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department text;
