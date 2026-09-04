-- "Ask a manager": when the knowledge base cannot answer a chat question the learner can
-- forward it to a manager, the manager replies from their notifications or dashboard, the
-- reply lands back in the learner's chat, and the manager decides whether the answer is
-- folded into the knowledge base for next time.

create table if not exists public.guide_questions (
  id uuid default gen_random_uuid() primary key,
  asker_id uuid references public.profiles(id) on delete cascade not null,
  asker_name text,
  manager_id uuid references public.profiles(id) on delete set null,
  manager_name text,
  manager_avatar_url text,
  -- Chat history lives in chat_conversations, which is optional in some environments,
  -- so this is deliberately not a foreign key.
  conversation_id uuid,
  question text not null,
  answer text,
  status text default 'pending' not null,
  save_to_kb boolean default false not null,
  kb_document_id uuid references public.guide_documents(id) on delete set null,
  created_at timestamptz default now(),
  answered_at timestamptz,
  constraint guide_questions_status_check check (status in ('pending', 'answered'))
);

create index if not exists guide_questions_status_idx on public.guide_questions (status, created_at desc);
create index if not exists guide_questions_asker_idx on public.guide_questions (asker_id, created_at desc);
create index if not exists guide_questions_conversation_idx on public.guide_questions (conversation_id);

alter table public.notifications
  add column if not exists related_question_id uuid references public.guide_questions(id) on delete cascade;

-- RLS: learners see their own questions, managers and admins see all of them.
-- Rows are only ever created through escalate_guide_question(), so there is no insert policy.
alter table public.guide_questions enable row level security;

drop policy if exists "Users view own questions" on public.guide_questions;
create policy "Users view own questions" on public.guide_questions
  for select using (auth.uid() = asker_id);

drop policy if exists "Managers view all questions" on public.guide_questions;
create policy "Managers view all questions" on public.guide_questions
  for select using (public.get_my_role() in ('manager', 'admin'));

drop policy if exists "Managers update questions" on public.guide_questions;
create policy "Managers update questions" on public.guide_questions
  for update using (public.get_my_role() in ('manager', 'admin'));

-- Saving an answer into the knowledge base writes a guide document from the manager's
-- browser, so admins need the same write access managers already have.
drop policy if exists "Managers can insert guide documents" on public.guide_documents;
create policy "Managers can insert guide documents" on public.guide_documents
  for insert with check (public.get_my_role() in ('manager', 'admin'));

drop policy if exists "Managers can insert guide chunks" on public.guide_chunks;
create policy "Managers can insert guide chunks" on public.guide_chunks
  for insert with check (public.get_my_role() in ('manager', 'admin'));

-- ---
-- Who a learner is allowed to send a question to. Managers only: admin accounts are not
-- offered in the picker.
-- Profiles RLS hides other people's profiles from learners, so this returns just the
-- public-facing details needed to draw the manager picker.
-- ---
create or replace function public.get_askable_managers()
returns table (
  id uuid,
  full_name text,
  email text,
  avatar_url text,
  job_title text,
  department text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.avatar_url, p.job_title, p.department
  from public.profiles p
  where p.role = 'manager'
    and auth.uid() is not null
  order by coalesce(p.full_name, p.email);
$$;

-- ---
-- Forward an unanswered chat question to a chosen manager and notify them.
-- ---
create or replace function public.escalate_guide_question(
  p_question text,
  p_manager_id uuid,
  p_conversation_id uuid default null
)
returns public.guide_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asker public.profiles;
  v_manager public.profiles;
  v_row public.guide_questions;
  v_question text := btrim(coalesce(p_question, ''));
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to ask a manager.';
  end if;

  if v_question = '' then
    raise exception 'A question is required.';
  end if;

  select * into v_asker from public.profiles where id = auth.uid();
  select * into v_manager from public.profiles where id = p_manager_id;

  if v_manager.id is null or v_manager.role <> 'manager' then
    raise exception 'That person is not available to answer questions.';
  end if;

  insert into public.guide_questions (
    asker_id, asker_name, manager_id, manager_name, manager_avatar_url, conversation_id, question
  )
  values (
    auth.uid(),
    coalesce(v_asker.full_name, v_asker.email),
    v_manager.id,
    coalesce(v_manager.full_name, v_manager.email),
    v_manager.avatar_url,
    p_conversation_id,
    v_question
  )
  returning * into v_row;

  insert into public.notifications (recipient_id, sender_id, type, message, related_question_id)
  values (
    v_manager.id,
    auth.uid(),
    'guide_question',
    coalesce(v_asker.full_name, v_asker.email, 'A team member') || ' asked: "' || v_question || '"',
    v_row.id
  );

  return v_row;
end;
$$;

-- ---
-- Answer a forwarded question. Writes the reply into the learner's chat thread (when chat
-- history is set up), notifies them, and records whether the answer was kept for the
-- knowledge base.
-- ---
create or replace function public.answer_guide_question(
  p_question_id uuid,
  p_answer text,
  p_save_to_kb boolean default false,
  p_kb_document_id uuid default null
)
returns public.guide_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager public.profiles;
  v_row public.guide_questions;
  v_reply text;
  v_answer text := btrim(coalesce(p_answer, ''));
begin
  select * into v_manager from public.profiles where id = auth.uid();

  if v_manager.id is null or v_manager.role not in ('manager', 'admin') then
    raise exception 'Only managers can answer questions.';
  end if;

  if v_answer = '' then
    raise exception 'An answer is required.';
  end if;

  update public.guide_questions
     set answer = v_answer,
         status = 'answered',
         answered_at = now(),
         manager_id = v_manager.id,
         manager_name = coalesce(v_manager.full_name, v_manager.email),
         manager_avatar_url = v_manager.avatar_url,
         save_to_kb = coalesce(p_save_to_kb, false),
         kb_document_id = p_kb_document_id
   where id = p_question_id
     and status = 'pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'That question has already been answered.';
  end if;

  -- Kept in step with formatManagerReply() in src/guideChatEscalation.js so a live reply
  -- and a reloaded chat thread read identically.
  v_reply := '**' || coalesce(v_row.manager_name, 'Your manager') || ' replied:**' || chr(10) || chr(10) || v_row.answer;

  if v_row.conversation_id is not null and to_regclass('public.chat_messages') is not null then
    begin
      execute 'insert into public.chat_messages (conversation_id, user_id, role, content, sources) '
              || 'values ($1, $2, ''assistant'', $3, ''[]''::jsonb)'
        using v_row.conversation_id, v_row.asker_id, v_reply;
    exception when others then
      raise warning 'Manager reply could not be added to the chat thread: %', sqlerrm;
    end;
  end if;

  insert into public.notifications (recipient_id, sender_id, type, message, related_question_id)
  values (v_row.asker_id, v_manager.id, 'question_answered', v_reply, v_row.id);

  return v_row;
end;
$$;

grant execute on function public.get_askable_managers() to authenticated;
grant execute on function public.escalate_guide_question(text, uuid, uuid) to authenticated;
grant execute on function public.answer_guide_question(uuid, text, boolean, uuid) to authenticated;
