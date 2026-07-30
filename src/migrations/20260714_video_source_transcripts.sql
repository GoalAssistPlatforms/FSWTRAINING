-- 1. Table public.video_source_transcripts
create table if not exists public.video_source_transcripts (
  id uuid default gen_random_uuid() primary key,
  account_id uuid references public.accounts(id) on delete cascade not null,
  guide_id uuid references public.courses(id) on delete cascade not null,
  source_asset_id uuid references public.video_source_assets(id) on delete cascade not null,
  schema_version integer not null check (schema_version = 1),
  language text not null check (length(trim(language)) > 0),
  duration numeric not null check (duration >= 0),
  transcript_json jsonb not null,
  revision integer not null check (revision >= 1),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint video_source_transcripts_source_asset_id_unique unique (source_asset_id)
);

-- Enable RLS
alter table public.video_source_transcripts enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can view transcripts" on public.video_source_transcripts;

-- 2. Transcript Read Permission Helper Function
create or replace function public.can_view_video_source_transcript(
  p_guide_id uuid,
  p_source_asset_id uuid
)
returns boolean
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_account_id uuid;
  v_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return false;
  end if;

  -- Confirm relationship: source asset belongs to the guide
  if not exists (
    select 1 from public.video_source_assets a
    where a.id = p_source_asset_id and a.guide_id = p_guide_id
  ) then
    return false;
  end if;

  -- Derive the account from the course
  select account_id into v_account_id from public.courses where id = p_guide_id;
  if v_account_id is null then
    return false;
  end if;

  v_role := public.get_user_account_role(v_account_id, v_user_id);
  if v_role is null then
    return false;
  end if;

  -- Apply role permissions
  if v_role in ('editor', 'manager', 'admin') then
    return true;
  end if;

  if v_role = 'learner' then
    return exists (
      select 1 from public.user_progress
      where user_id = v_user_id and course_id = p_guide_id
    );
  end if;

  return false;
end;
$$ language plpgsql;

-- 3. Transcript Write Permission Helper Function
create or replace function public.can_edit_video_source_transcript(
  p_guide_id uuid,
  p_source_asset_id uuid
)
returns boolean
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_account_id uuid;
  v_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return false;
  end if;

  -- Confirm relationship: source asset belongs to the guide
  if not exists (
    select 1 from public.video_source_assets a
    where a.id = p_source_asset_id and a.guide_id = p_guide_id
  ) then
    return false;
  end if;

  -- Derive the account from the course
  select account_id into v_account_id from public.courses where id = p_guide_id;
  if v_account_id is null then
    return false;
  end if;

  v_role := public.get_user_account_role(v_account_id, v_user_id);

  -- Only manager and admin are allowed to edit/upsert
  if v_role in ('manager', 'admin') then
    return true;
  end if;

  return false;
end;
$$ language plpgsql;

-- Select Policy checking can_view_video_source_transcript
create policy "Users can view transcripts" on public.video_source_transcripts
  for select using (public.can_view_video_source_transcript(guide_id, source_asset_id));

-- 4. Secure Read Function
create or replace function public.get_video_source_transcript(
  p_guide_id uuid,
  p_source_asset_id uuid
)
returns table (
  id uuid,
  account_id uuid,
  guide_id uuid,
  source_asset_id uuid,
  schema_version integer,
  language text,
  duration numeric,
  transcript_json jsonb,
  revision integer,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
) as $$
#variable_conflict use_column
begin
  -- Apply can_view_video_source_transcript
  if not public.can_view_video_source_transcript(p_guide_id, p_source_asset_id) then
    raise exception 'TRANSCRIPT_PERMISSION_DENIED' using errcode = '42501';
  end if;

  return query
  select
    t.id, t.account_id, t.guide_id, t.source_asset_id,
    t.schema_version, t.language, t.duration, t.transcript_json,
    t.revision, t.created_by, t.updated_by, t.created_at, t.updated_at
  from public.video_source_transcripts t
  where t.source_asset_id = p_source_asset_id and t.guide_id = p_guide_id;
end;
$$ language plpgsql security definer set search_path = '';

-- Revoke execution from PUBLIC, grant only to authenticated
revoke all on function public.get_video_source_transcript(uuid, uuid) from public;
grant execute on function public.get_video_source_transcript(uuid, uuid) to authenticated;

-- 5. Atomic Upsert Function
create or replace function public.upsert_video_source_transcript(
  p_guide_id uuid,
  p_source_asset_id uuid,
  p_transcript_json jsonb
)
returns public.video_source_transcripts as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_account_id uuid;
  v_auth_duration numeric;
  v_language text;
  v_schema_version integer;
  v_duration numeric;
  v_words jsonb;
  v_word jsonb;
  v_word_id text;
  v_word_text text;
  v_word_start numeric;
  v_word_end numeric;
  v_prev_start numeric := -1.0;
  v_prev_end numeric := -1.0;
  v_ids text[] := '{}';
  v_current_revision integer;
  v_existing_id uuid;
  v_created_by uuid;
  v_created_at timestamptz;
  v_updated_at timestamptz;
  v_result public.video_source_transcripts;
  v_existing_json jsonb;
begin
  -- 1. Derive user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'TRANSCRIPT_PERMISSION_DENIED' using errcode = '42501';
  end if;

  -- 2. Call can_edit_video_source_transcript
  if not public.can_edit_video_source_transcript(p_guide_id, p_source_asset_id) then
    raise exception 'TRANSCRIPT_PERMISSION_DENIED' using errcode = '42501';
  end if;

  -- 3. Derive account from guide
  select account_id into v_account_id from public.courses where id = p_guide_id;
  if v_account_id is null then
    raise exception 'TRANSCRIPT_INVALID: guide account not found' using errcode = '22000';
  end if;

  -- 4. Load authoritative duration from public.video_source_assets
  select duration_seconds into v_auth_duration from public.video_source_assets where id = p_source_asset_id;
  if v_auth_duration is null then
    raise exception 'TRANSCRIPT_INVALID: authoritative source duration not found' using errcode = '22000';
  end if;

  -- 5. Acquire transaction advisory lock derived from the source asset identifier
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_source_asset_id::text));

  -- 6. Validate the transcript structure
  if p_transcript_json is null or pg_catalog.jsonb_typeof(p_transcript_json) <> 'object' then
    raise exception 'TRANSCRIPT_INVALID: Transcript must be a JSON object' using errcode = '22000';
  end if;

  -- Schema version must be 1
  v_schema_version := (p_transcript_json->>'schemaVersion')::integer;
  if v_schema_version is null or v_schema_version <> 1 then
    raise exception 'TRANSCRIPT_INVALID: schemaVersion must be 1' using errcode = '22000';
  end if;

  -- Source asset ID must match
  if p_transcript_json->>'sourceAssetId' is null or p_transcript_json->>'sourceAssetId' <> p_source_asset_id::text then
    raise exception 'TRANSCRIPT_INVALID: sourceAssetId mismatch' using errcode = '22000';
  end if;

  -- Language check
  v_language := p_transcript_json->>'language';
  if v_language is null or pg_catalog.length(pg_catalog.btrim(v_language)) = 0 then
    raise exception 'TRANSCRIPT_INVALID: language must be a non-empty string' using errcode = '22000';
  end if;

  -- Duration check
  v_duration := (p_transcript_json->>'duration')::numeric;
  if v_duration is null or v_duration < 0 or pg_catalog.abs(v_duration - v_auth_duration) > 0.001 then
    raise exception 'TRANSCRIPT_INVALID: duration mismatch beyond 0.001s tolerance' using errcode = '22000';
  end if;

  -- Words check
  v_words := p_transcript_json->'words';
  if v_words is null or pg_catalog.jsonb_typeof(v_words) <> 'array' then
    raise exception 'TRANSCRIPT_INVALID: words must be an array' using errcode = '22000';
  end if;

  -- Iterate and validate words
  for i in 0 .. pg_catalog.jsonb_array_length(v_words) - 1 loop
    v_word := v_words->i;

    -- Require ID
    v_word_id := v_word->>'id';
    if v_word_id is null or pg_catalog.length(pg_catalog.btrim(v_word_id)) = 0 then
      raise exception 'TRANSCRIPT_INVALID: word id is required' using errcode = '22000';
    end if;

    -- Check for duplicate word ID
    if v_word_id = any(v_ids) then
      raise exception 'TRANSCRIPT_INVALID: duplicate word identifier found' using errcode = '22000';
    end if;
    v_ids := pg_catalog.array_append(v_ids, v_word_id);

    -- Require text
    v_word_text := v_word->>'text';
    if v_word_text is null or pg_catalog.length(pg_catalog.btrim(v_word_text)) = 0 then
      raise exception 'TRANSCRIPT_INVALID: word text is required' using errcode = '22000';
    end if;

    -- Require start/end times
    v_word_start := (v_word->>'startSourceTime')::numeric;
    v_word_end := (v_word->>'endSourceTime')::numeric;
    if v_word_start is null or v_word_end is null or v_word_start < 0 or v_word_end < 0 then
      raise exception 'TRANSCRIPT_INVALID: word start/end times must be non-negative numbers' using errcode = '22000';
    end if;
    if v_word_start >= v_word_end then
      raise exception 'TRANSCRIPT_INVALID: word start time must be less than end time' using errcode = '22000';
    end if;
    if v_word_end > v_auth_duration + 0.001 then
      raise exception 'TRANSCRIPT_INVALID: word end time exceeds authoritative duration' using errcode = '22000';
    end if;

    -- Chronological check
    if v_word_start < v_prev_start then
      raise exception 'TRANSCRIPT_INVALID: words must be in chronological order' using errcode = '22000';
    end if;

    -- Overlap check (within 0.001 tolerance)
    if v_prev_end > v_word_start and (v_prev_end - v_word_start) > 0.001 then
      raise exception 'TRANSCRIPT_INVALID: words cannot overlap by more than 0.001s' using errcode = '22000';
    end if;

    -- Strict confidence and speakerId presence/type checks
    if not (v_word ? 'confidence') then
      raise exception 'TRANSCRIPT_INVALID: word confidence property is required' using errcode = '22000';
    end if;
    if not (v_word ? 'speakerId') then
      raise exception 'TRANSCRIPT_INVALID: word speakerId property is required' using errcode = '22000';
    end if;

    if pg_catalog.jsonb_typeof(v_word->'confidence') <> 'null' then
      if pg_catalog.jsonb_typeof(v_word->'confidence') <> 'number' or (v_word->>'confidence')::numeric < 0 or (v_word->>'confidence')::numeric > 1 then
        raise exception 'TRANSCRIPT_INVALID: confidence must be null or a number between 0 and 1' using errcode = '22000';
      end if;
    end if;

    if pg_catalog.jsonb_typeof(v_word->'speakerId') <> 'null' then
      if pg_catalog.jsonb_typeof(v_word->'speakerId') <> 'string' or pg_catalog.length(pg_catalog.btrim(v_word->>'speakerId')) = 0 then
        raise exception 'TRANSCRIPT_INVALID: speakerId must be null or a non-empty string' using errcode = '22000';
      end if;
    end if;

    v_prev_start := v_word_start;
    v_prev_end := v_word_end;
  end loop;

  -- 7. Read existing transcript
  select t.id, t.revision, t.created_by, t.created_at, t.transcript_json into v_existing_id, v_current_revision, v_created_by, v_created_at, v_existing_json
  from public.video_source_transcripts t
  where t.source_asset_id = p_source_asset_id;

  v_updated_at := pg_catalog.clock_timestamp();

  if v_existing_id is not null then
    -- Idempotent check for identical payload
    if v_existing_json = p_transcript_json then
      select * into v_result from public.video_source_transcripts where id = v_existing_id;
      return v_result;
    end if;

    -- Replacement: increment revision
    update public.video_source_transcripts
    set
      transcript_json = p_transcript_json,
      language = v_language,
      duration = v_duration,
      revision = v_current_revision + 1,
      updated_by = v_user_id,
      updated_at = v_updated_at
    where id = v_existing_id
    returning * into v_result;
  else
    -- Initial import: revision 1
    insert into public.video_source_transcripts (
      account_id,
      guide_id,
      source_asset_id,
      schema_version,
      language,
      duration,
      transcript_json,
      revision,
      created_by,
      updated_by,
      created_at,
      updated_at
    ) values (
      v_account_id,
      p_guide_id,
      p_source_asset_id,
      1,
      v_language,
      v_duration,
      p_transcript_json,
      1,
      v_user_id,
      v_user_id,
      v_updated_at,
      v_updated_at
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$$ language plpgsql security definer set search_path = '';

-- Revoke execution from PUBLIC, grant only to authenticated
revoke all on function public.upsert_video_source_transcript(uuid, uuid, jsonb) from public;
grant execute on function public.upsert_video_source_transcript(uuid, uuid, jsonb) to authenticated;
