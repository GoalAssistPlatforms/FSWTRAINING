-- Add tags to guide_documents
alter table public.guide_documents 
add column if not exists tags text[] default array[]::text[];

-- Add tags to courses (for interactive guides)
alter table public.courses 
add column if not exists tags text[] default array[]::text[];
