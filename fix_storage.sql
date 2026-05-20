-- 1. Create the 'course_assets' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('course_assets', 'course_assets', true)
ON CONFLICT (id) DO NOTHING;

-- Safely drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Manager Upload" ON storage.objects;
DROP POLICY IF EXISTS "Manager Delete" ON storage.objects;

-- 2. Allow Public Read Access (for Course Player)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'course_assets' );

-- 3. Allow Managers and Admins to Upload (for AI Generation)
CREATE POLICY "Manager Upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course_assets' 
  AND auth.role() = 'authenticated'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'admin')
);

-- 4. Allow Managers and Admins to Delete (Optional, for cleanup)
CREATE POLICY "Manager Delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course_assets'
  AND auth.role() = 'authenticated'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'admin')
);
