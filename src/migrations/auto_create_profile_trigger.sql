-- Auto-create profile trigger to handle Supabase signups reliably
-- This bypasses the need for client-side RLS inserts when auth.uid() is null (e.g. before email confirmation)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
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
