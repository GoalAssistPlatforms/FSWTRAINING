-- Auto-create profile trigger to handle Supabase signups reliably
-- This bypasses the need for client-side RLS inserts when auth.uid() is null (e.g. before email confirmation)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  current_user_count integer;
  max_allowed_users integer;
BEGIN
  -- Check user limit
  SELECT count(*) INTO current_user_count FROM public.profiles;
  
  BEGIN
    SELECT max_users INTO max_allowed_users FROM public.platform_settings WHERE id = 1;
    -- Note: We exclude 'admin' from the limit logic if we want, but since admin is 1 user it's fine to just count all profiles.
    IF max_allowed_users IS NOT NULL AND current_user_count >= max_allowed_users THEN
      RAISE EXCEPTION 'Platform user limit reached. Please contact your administrator.';
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- Ignore if platform_settings doesn't exist yet
  END;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists just in case
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
