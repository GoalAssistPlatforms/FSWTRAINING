
-- 1. Create the 'course_assets' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('course_assets', 'course_assets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow Public Read Access (for Course Player)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'course_assets' );

-- 3. Allow Managers to Upload (for AI Generation)
CREATE POLICY "Manager Upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course_assets' 
  AND auth.role() = 'authenticated'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
);

-- 4. Allow Managers to Delete (Optional, for cleanup)
CREATE POLICY "Manager Delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course_assets'
  AND auth.role() = 'authenticated'
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
);
