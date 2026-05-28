-- CREATE FEEDBACKS TABLE
create table if not exists public.feedbacks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null, -- 'positive', 'negative', 'urgent'
  content text not null,
  screenshot_url text,
  status text default 'pending', -- 'pending', 'under-review', 'acting-on', 'resolved', 'archived'
  admin_response text,
  responded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS on feedbacks table
alter table public.feedbacks enable row level security;

-- Policies for feedbacks table
drop policy if exists "Users can view all feedbacks" on public.feedbacks;
drop policy if exists "Users can insert own feedbacks" on public.feedbacks;
drop policy if exists "Admins manage all feedbacks" on public.feedbacks;

create policy "Users can view all feedbacks" on public.feedbacks
  for select using (true); -- Publicly viewable catalog

create policy "Users can insert own feedbacks" on public.feedbacks
  for insert with check (auth.uid() = user_id);

create policy "Admins manage all feedbacks" on public.feedbacks
  for all using (public.get_my_role() = 'admin');

-- CREATE FEEDBACK SCREENSHOTS STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) 
VALUES ('feedback_screenshots', 'feedback_screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for feedback screenshots bucket
drop policy if exists "Feedback screenshots are publicly accessible." on storage.objects;
drop policy if exists "Users can upload feedback screenshots." on storage.objects;

CREATE POLICY "Feedback screenshots are publicly accessible."
ON storage.objects FOR SELECT
USING ( bucket_id = 'feedback_screenshots' );

CREATE POLICY "Users can upload feedback screenshots."
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'feedback_screenshots' );
