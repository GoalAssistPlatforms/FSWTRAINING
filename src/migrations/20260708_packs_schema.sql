-- Create packs table
create table if not exists public.packs (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create pack_items table
create table if not exists public.pack_items (
  id uuid default gen_random_uuid() primary key,
  pack_id uuid references public.packs(id) on delete cascade not null,
  item_type text not null check (item_type in ('course', 'guide', 'document', 'link')),
  item_id uuid not null, -- references courses.id (for course/guide) or guide_documents.id (for doc/link)
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Create pack_assignments table
create table if not exists public.pack_assignments (
  id uuid default gen_random_uuid() primary key,
  pack_id uuid references public.packs(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  due_date timestamptz,
  status text default 'assigned' check (status in ('assigned', 'in-progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, pack_id)
);

-- Create user_pack_item_progress table (specifically for documents and links)
create table if not exists public.user_pack_item_progress (
  id uuid default gen_random_uuid() primary key,
  assignment_id uuid references public.pack_assignments(id) on delete cascade not null,
  item_type text not null check (item_type in ('document', 'link')),
  item_id uuid not null, -- references guide_documents.id
  completed_at timestamptz default now(),
  unique(assignment_id, item_type, item_id)
);

-- Enable RLS
alter table public.packs enable row level security;
alter table public.pack_items enable row level security;
alter table public.pack_assignments enable row level security;
alter table public.user_pack_item_progress enable row level security;

-- Policies for packs
drop policy if exists "Everyone can view packs" on public.packs;
drop policy if exists "Managers can insert packs" on public.packs;
drop policy if exists "Managers can update packs" on public.packs;
drop policy if exists "Managers can delete packs" on public.packs;

create policy "Everyone can view packs" on public.packs
  for select using (true);

create policy "Managers can insert packs" on public.packs
  for insert with check (public.get_my_role() = 'manager' or public.get_my_role() = 'admin');

create policy "Managers can update packs" on public.packs
  for update using (public.get_my_role() = 'manager' or public.get_my_role() = 'admin');

create policy "Managers can delete packs" on public.packs
  for delete using (public.get_my_role() = 'manager' or public.get_my_role() = 'admin');

-- Policies for pack_items
drop policy if exists "Everyone can view pack items" on public.pack_items;
drop policy if exists "Managers can manage pack items" on public.pack_items;

create policy "Everyone can view pack items" on public.pack_items
  for select using (true);

create policy "Managers can manage pack items" on public.pack_items
  for all using (public.get_my_role() = 'manager' or public.get_my_role() = 'admin');

-- Policies for pack_assignments
drop policy if exists "Users view own pack assignments" on public.pack_assignments;
drop policy if exists "Managers manage pack assignments" on public.pack_assignments;
drop policy if exists "Users update own pack assignments status" on public.pack_assignments;

create policy "Users view own pack assignments" on public.pack_assignments
  for select using (auth.uid() = user_id or public.get_my_role() = 'manager' or public.get_my_role() = 'admin');

create policy "Users update own pack assignments status" on public.pack_assignments
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Managers manage pack assignments" on public.pack_assignments
  for all using (public.get_my_role() = 'manager' or public.get_my_role() = 'admin');

-- Policies for user_pack_item_progress
drop policy if exists "Users view own pack item progress" on public.user_pack_item_progress;
drop policy if exists "Users modify own pack item progress" on public.user_pack_item_progress;

create policy "Users view own pack item progress" on public.user_pack_item_progress
  for select using (
    exists (
      select 1 from public.pack_assignments 
      where pack_assignments.id = user_pack_item_progress.assignment_id 
      and (pack_assignments.user_id = auth.uid() or public.get_my_role() = 'manager' or public.get_my_role() = 'admin')
    )
  );

create policy "Users modify own pack item progress" on public.user_pack_item_progress
  for all using (
    exists (
      select 1 from public.pack_assignments 
      where pack_assignments.id = user_pack_item_progress.assignment_id 
      and (pack_assignments.user_id = auth.uid() or public.get_my_role() = 'manager' or public.get_my_role() = 'admin')
    )
  );
