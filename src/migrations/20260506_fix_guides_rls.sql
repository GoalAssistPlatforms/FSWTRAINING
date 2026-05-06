-- Run this script in your Supabase SQL Editor
-- This fixes the Row Level Security (RLS) policies for the guides feature
-- to allow 'admin' users to create and manage guides, not just 'manager' users.

-- 1. Update RLS for guide_documents
DROP POLICY IF EXISTS "Managers can insert guide documents" ON public.guide_documents;
CREATE POLICY "Managers and Admins can insert guide documents" ON public.guide_documents
    FOR INSERT WITH CHECK (public.get_my_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "Managers can update guide documents" ON public.guide_documents;
CREATE POLICY "Managers and Admins can update guide documents" ON public.guide_documents
    FOR UPDATE USING (public.get_my_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "Managers can delete guide documents" ON public.guide_documents;
CREATE POLICY "Managers and Admins can delete guide documents" ON public.guide_documents
    FOR DELETE USING (public.get_my_role() IN ('manager', 'admin'));

-- 2. Update RLS for guide_chunks
DROP POLICY IF EXISTS "Managers can insert guide chunks" ON public.guide_chunks;
CREATE POLICY "Managers and Admins can insert guide chunks" ON public.guide_chunks
    FOR INSERT WITH CHECK (public.get_my_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "Managers can delete guide chunks" ON public.guide_chunks;
CREATE POLICY "Managers and Admins can delete guide chunks" ON public.guide_chunks
    FOR DELETE USING (public.get_my_role() IN ('manager', 'admin'));

-- 3. Update RLS for storage bucket
DROP POLICY IF EXISTS "Managers can insert files into guides bucket" ON storage.objects;
CREATE POLICY "Managers and Admins can insert files into guides bucket" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'guides' AND public.get_my_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS "Managers can delete files from guides bucket" ON storage.objects;
CREATE POLICY "Managers and Admins can delete files from guides bucket" ON storage.objects
    FOR DELETE USING (bucket_id = 'guides' AND public.get_my_role() IN ('manager', 'admin'));
