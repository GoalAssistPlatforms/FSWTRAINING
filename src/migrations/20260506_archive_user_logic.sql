-- Run this script in the Supabase SQL Editor
-- This implements the new Archive User functionality.

-- 1. Create a function to archive a user safely
CREATE OR REPLACE FUNCTION archive_user_by_manager(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges
AS $$
BEGIN
  -- Simply update the user's role to 'archived' in the profiles table.
  -- This will naturally exclude them from active queries and prevent app access.
  UPDATE profiles 
  SET role = 'archived' 
  WHERE id = target_user_id AND role = 'user';
END;
$$;

-- 2. Update the quota check to explicitly count only 'user' and 'manager' roles
-- so that archived users no longer consume capacity allocation.
CREATE OR REPLACE FUNCTION check_user_quota()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_users int;
  v_current_users int;
BEGIN
  -- Get the global max users limit
  SELECT max_users INTO v_max_users
  FROM platform_settings
  WHERE id = 1;

  -- Default to a safe limit if setting is missing
  IF v_max_users IS NULL THEN
    v_max_users := 10;
  END IF;

  -- Count current users (excluding admin AND archived)
  SELECT count(*) INTO v_current_users
  FROM profiles
  WHERE role IN ('user', 'manager');

  -- Return true if limit is reached or exceeded
  RETURN v_current_users >= v_max_users;
END;
$$;
