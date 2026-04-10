-- Notifications Table
create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  recipient_id uuid references public.profiles(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete set null, -- Null for system/automated alerts
  type text not null, -- 'nudge', 'system_alert', 'announcement', 'extension_result'
  message text not null,
  related_course_id uuid references public.courses(id) on delete cascade,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Extension Requests Table
create table if not exists public.extension_requests (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  -- We don't strictly need manager_id if any manager can see it, but we can store it log who closed it
  manager_id uuid references public.profiles(id) on delete set null, 
  course_assignment_id uuid references public.user_progress(id) on delete cascade not null,
  requested_date timestamptz not null,
  reason_text text,
  status text default 'pending', -- 'pending', 'approved', 'denied'
  manager_reply text,
  created_at timestamptz default now()
);

-- RLS for Notifications
alter table public.notifications enable row level security;

create policy "Users can view own notifications" on public.notifications
  for select using (auth.uid() = recipient_id);

create policy "Users can update own notifications" on public.notifications
  for update using (auth.uid() = recipient_id);

create policy "Managers can insert notifications" on public.notifications
  for insert with check (public.get_my_role() = 'manager' or auth.uid() = sender_id);

-- RLS for Extension Requests
alter table public.extension_requests enable row level security;

create policy "Users can view own extension requests" on public.extension_requests
  for select using (auth.uid() = user_id);

create policy "Users can insert own extension requests" on public.extension_requests
  for insert with check (auth.uid() = user_id);

create policy "Managers can view all extension requests" on public.extension_requests
  for select using (public.get_my_role() = 'manager');

create policy "Managers can update all extension requests" on public.extension_requests
  for update using (public.get_my_role() = 'manager');
