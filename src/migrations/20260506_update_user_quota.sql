-- Run this script in the Supabase SQL Editor
-- This updates the check_user_quota function to exclude 'admin' accounts from the quota limit check.

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

  -- Count current users (excluding admin)
  SELECT count(*) INTO v_current_users
  FROM profiles
  WHERE role != 'admin';

  -- Return true if limit is reached or exceeded
  RETURN v_max_users > 0 AND v_current_users >= v_max_users;
END;
$$;
