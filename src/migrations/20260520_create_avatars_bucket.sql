-- Create the avatars bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage objects (it usually is by default, but safe to ensure)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow public read access to avatars
CREATE POLICY "Avatar images are publicly accessible."
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Allow authenticated users to upload avatars
CREATE POLICY "Users can upload avatars."
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'avatars' );

-- Allow authenticated users to update avatars
CREATE POLICY "Users can update avatars."
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'avatars' );
