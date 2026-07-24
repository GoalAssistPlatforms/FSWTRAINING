-- Auto-create profile trigger to handle Supabase signups reliably.
-- The trigger uses the same quota function as the browser pre-check so both paths count active seats consistently.

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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Serialise concurrent signups so the enforced limit cannot be exceeded.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.profiles.signup_quota'));

  IF public.check_user_quota() THEN
    RAISE EXCEPTION 'Platform user limit reached. Please contact your administrator.';
  END IF;

  INSERT INTO public.profiles (id, email, role, full_name, department)
  VALUES (
    new.id,
    new.email,
    'user',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'department'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
