-- Migration to add Certificate and Course Expiry columns

-- 1. Add expiry_months to courses (NULL by default, meaning never expires)
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS expiry_months int DEFAULT NULL;

-- 2. Add certificate tracking to user_progress
ALTER TABLE public.user_progress 
ADD COLUMN IF NOT EXISTS certificate_id uuid DEFAULT uuid_generate_v4();

ALTER TABLE public.user_progress
ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL;

-- Note: We only generate the certificate_id default on insertion.
-- New certificates will get an ID instantly. Older completions might
-- get a default ID if they are touched, or they already did via the default constraint depending on Postgres behavior. 
-- In PG, adding a column with a default populates existing rows with the default. So old completions get a cert ID!
