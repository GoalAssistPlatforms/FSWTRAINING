-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- DUMP existing tables if we're recreating (optional but helpful during dev)
-- drop table if exists public.guide_chunks;
-- drop table if exists public.guide_documents;

-- Create a table to store the high-level documents (PDFs)
create table if not exists public.guide_documents (
    id uuid default gen_random_uuid() primary key,
    title text not null,
    description text,
    file_url text, -- URL to the file in Supabase Storage if applicable
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz default now()
);

-- Create a table to store the individual paragraphs/chunks of text from the documents
create table if not exists public.guide_chunks (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.guide_documents(id) on delete cascade not null,
    content text not null, -- The actual text paragraph
    embedding vector(1536), -- The OpenAI embedding vector length
    chunk_index integer, -- To keep track of the order of paragraphs in the document
    created_at timestamptz default now()
);

-- Create an index to speed up vector similarity searches
-- This uses IVF Flat but HNSW is better for Supabase pgvector >= 0.5.0
create index on public.guide_chunks using hnsw (embedding vector_cosine_ops);

-- RLS POLICIES FOR guide_documents
alter table public.guide_documents enable row level security;

-- Everyone can read documents
create policy "Everyone can view guide documents" on public.guide_documents
    for select using (true);

-- Only managers can insert/update documents
create policy "Managers can insert guide documents" on public.guide_documents
    for insert with check (public.get_my_role() = 'manager');

create policy "Managers can update guide documents" on public.guide_documents
    for update using (public.get_my_role() = 'manager');

create policy "Managers can delete guide documents" on public.guide_documents
    for delete using (public.get_my_role() = 'manager');

-- RLS POLICIES FOR guide_chunks
alter table public.guide_chunks enable row level security;

-- Everyone can read chunks
create policy "Everyone can view guide chunks" on public.guide_chunks
    for select using (true);

-- Only managers can insert chunks
create policy "Managers can insert guide chunks" on public.guide_chunks
    for insert with check (public.get_my_role() = 'manager');

create policy "Managers can delete guide chunks" on public.guide_chunks
    for delete using (public.get_my_role() = 'manager');

-- ---
-- MATCHING FUNCTION
-- ---
-- This function takes a vector (the user's query) and returns the top matching document chunks
create or replace function public.match_guide_chunks (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  document_title text,
  file_url text
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.document_id,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.title as document_title,
    d.file_url as file_url
  from public.guide_chunks c
  join public.guide_documents d on c.document_id = d.id
  where 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ---
-- STORAGE BUCKET FOR PDFS
-- ---
insert into storage.buckets (id, name, public) 
values ('guides', 'guides', true) 
on conflict (id) do nothing;

create policy "Everyone can view files in guides bucket"
  on storage.objects for select
  using ( bucket_id = 'guides' );

create policy "Managers can insert files into guides bucket"
  on storage.objects for insert
  with check ( bucket_id = 'guides' and public.get_my_role() = 'manager' );

create policy "Managers can delete files from guides bucket"
  on storage.objects for delete
  using ( bucket_id = 'guides' and public.get_my_role() = 'manager' );
