-- Run this script in the Supabase SQL Editor
-- Anonymous callers can check whether the active seat quota is full without reading profile or platform setting rows.

CREATE OR REPLACE FUNCTION public.check_user_quota()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max_users integer;
  v_current_users bigint;
BEGIN
  SELECT max_users
  INTO v_max_users
  FROM public.platform_settings
  WHERE id = 1;

  v_max_users := COALESCE(v_max_users, 10);

  SELECT count(*)
  INTO v_current_users
  FROM public.profiles
  WHERE role IN ('user', 'manager');

  RETURN v_max_users > 0 AND v_current_users >= v_max_users;
END;
$$;

REVOKE ALL ON FUNCTION public.check_user_quota() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_user_quota() TO anon, authenticated;
