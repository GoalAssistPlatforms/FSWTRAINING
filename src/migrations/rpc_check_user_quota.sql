-- Run this script in the Supabase SQL Editor
-- This function allows anonymous users (during signup) to check if the platform has reached its user quota limit without exposing the actual profiles data or platform settings.

CREATE OR REPLACE FUNCTION check_user_quota()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with the privileges of the creator (postgres/admin), bypassing RLS
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

  -- Count current users
  SELECT count(*) INTO v_current_users
  FROM profiles;

  -- Return true if limit is reached or exceeded
  RETURN v_current_users >= v_max_users;
END;
$$;
