-- Keep provider metadata optional in both browser and database validation.
-- Date: 2026-07-17
-- Package: 06A Functional Corrections

-- 1. Create Internal Shared Validator Function
create or replace function public.validate_video_source_transcript_internal(
  p_source_asset_id uuid,
  p_transcript_json jsonb
)
returns void as $$
declare
  v_auth_duration numeric;
  v_schema_version integer;
  v_language text;
  v_duration numeric;
  v_words jsonb;
  v_word jsonb;
  v_word_id text;
  v_word_text text;
  v_word_start numeric;
  v_word_end numeric;
  v_ids text[] := array[]::text[];
  v_prev_start numeric := -1;
  v_prev_end numeric := -1;
  v_key text;
  v_word_key text;
  v_confidence numeric;
begin
  -- Load authoritative duration from public.video_source_assets
  select duration_seconds into v_auth_duration from public.video_source_assets where id = p_source_asset_id;
  if v_auth_duration is null then
    raise exception 'TRANSCRIPTION_INVALID: Authoritative source duration not found' using errcode = '22000';
  end if;

  -- Validate the main transcript object is an object
  if p_transcript_json is null or pg_catalog.jsonb_typeof(p_transcript_json) <> 'object' then
    raise exception 'TRANSCRIPTION_INVALID: Transcript must be a JSON object' using errcode = '22000';
  end if;

  -- Check that ONLY canonical fields exist on the main object (exact JSONB key-set check)
  for v_key in select pg_catalog.jsonb_object_keys(p_transcript_json) loop
    if v_key not in ('schemaVersion', 'sourceAssetId', 'language', 'duration', 'words') then
      raise exception 'TRANSCRIPTION_INVALID: Unexpected field % on transcript object', v_key using errcode = '22000';
    end if;
  end loop;

  -- Check for missing canonical fields on main object
  if not (p_transcript_json ? 'schemaVersion') then
    raise exception 'TRANSCRIPTION_INVALID: Missing schemaVersion' using errcode = '22000';
  end if;
  if not (p_transcript_json ? 'sourceAssetId') then
    raise exception 'TRANSCRIPTION_INVALID: Missing sourceAssetId' using errcode = '22000';
  end if;
  if not (p_transcript_json ? 'language') then
    raise exception 'TRANSCRIPTION_INVALID: Missing language' using errcode = '22000';
  end if;
  if not (p_transcript_json ? 'duration') then
    raise exception 'TRANSCRIPTION_INVALID: Missing duration' using errcode = '22000';
  end if;
  if not (p_transcript_json ? 'words') then
    raise exception 'TRANSCRIPTION_INVALID: Missing words' using errcode = '22000';
  end if;

  -- Schema version must be 1
  if pg_catalog.jsonb_typeof(p_transcript_json->'schemaVersion') <> 'number' then
    raise exception 'TRANSCRIPTION_INVALID: schemaVersion must be a number' using errcode = '22000';
  end if;
  v_schema_version := (p_transcript_json->>'schemaVersion')::integer;
  if v_schema_version is null or v_schema_version <> 1 then
    raise exception 'TRANSCRIPTION_INVALID: schemaVersion must be 1' using errcode = '22000';
  end if;

  -- Source asset ID must match
  if pg_catalog.jsonb_typeof(p_transcript_json->'sourceAssetId') <> 'string' or p_transcript_json->>'sourceAssetId' <> p_source_asset_id::text then
    raise exception 'TRANSCRIPTION_INVALID: sourceAssetId mismatch' using errcode = '22000';
  end if;

  -- Language check
  if pg_catalog.jsonb_typeof(p_transcript_json->'language') <> 'string' then
    raise exception 'TRANSCRIPTION_INVALID: language must be a string' using errcode = '22000';
  end if;
  v_language := p_transcript_json->>'language';
  if v_language is null or pg_catalog.length(pg_catalog.btrim(v_language)) = 0 then
    raise exception 'TRANSCRIPTION_INVALID: language must be a non-empty string' using errcode = '22000';
  end if;

  -- Duration check
  if pg_catalog.jsonb_typeof(p_transcript_json->'duration') <> 'number' then
    raise exception 'TRANSCRIPTION_INVALID: duration must be a number' using errcode = '22000';
  end if;
  v_duration := (p_transcript_json->>'duration')::numeric;
  if v_duration is null or v_duration <= 0 then
    raise exception 'TRANSCRIPTION_INVALID: duration must be positive and finite' using errcode = '22000';
  end if;
  if pg_catalog.abs(v_duration - v_auth_duration) > 0.001 then
    raise exception 'TRANSCRIPTION_INVALID: duration mismatch beyond 0.001s tolerance' using errcode = '22000';
  end if;

  -- Words check
  v_words := p_transcript_json->'words';
  if v_words is null or pg_catalog.jsonb_typeof(v_words) <> 'array' then
    raise exception 'TRANSCRIPTION_INVALID: words must be an array' using errcode = '22000';
  end if;

  -- Iterate and validate words
  for i in 0 .. pg_catalog.jsonb_array_length(v_words) - 1 loop
    v_word := v_words->i;

    if pg_catalog.jsonb_typeof(v_word) <> 'object' then
      raise exception 'TRANSCRIPTION_INVALID: Each word must be a JSON object' using errcode = '22000';
    end if;

    -- Check that ONLY canonical fields exist on the word object (exact JSONB key-set check)
    for v_word_key in select pg_catalog.jsonb_object_keys(v_word) loop
      if v_word_key not in ('id', 'text', 'startSourceTime', 'endSourceTime', 'confidence', 'speakerId') then
        raise exception 'TRANSCRIPTION_INVALID: Unexpected field % on word object', v_word_key using errcode = '22000';
      end if;
    end loop;

    -- Check for missing canonical fields on word object
    if not (v_word ? 'id') then
      raise exception 'TRANSCRIPTION_INVALID: Missing word id' using errcode = '22000';
    end if;
    if not (v_word ? 'text') then
      raise exception 'TRANSCRIPTION_INVALID: Missing word text' using errcode = '22000';
    end if;
    if not (v_word ? 'startSourceTime') then
      raise exception 'TRANSCRIPTION_INVALID: Missing word startSourceTime' using errcode = '22000';
    end if;
    if not (v_word ? 'endSourceTime') then
      raise exception 'TRANSCRIPTION_INVALID: Missing word endSourceTime' using errcode = '22000';
    end if;
    -- Require ID is string
    if pg_catalog.jsonb_typeof(v_word->'id') <> 'string' then
      raise exception 'TRANSCRIPTION_INVALID: word id must be a string' using errcode = '22000';
    end if;
    v_word_id := v_word->>'id';
    if v_word_id is null or pg_catalog.length(pg_catalog.btrim(v_word_id)) = 0 then
      raise exception 'TRANSCRIPTION_INVALID: word id is required' using errcode = '22000';
    end if;

    -- Check for duplicate word ID
    if v_word_id = any(v_ids) then
      raise exception 'TRANSCRIPTION_INVALID: duplicate word identifier found' using errcode = '22000';
    end if;
    v_ids := pg_catalog.array_append(v_ids, v_word_id);

    -- Require text is string
    if pg_catalog.jsonb_typeof(v_word->'text') <> 'string' then
      raise exception 'TRANSCRIPTION_INVALID: word text must be a string' using errcode = '22000';
    end if;
    v_word_text := v_word->>'text';
    if v_word_text is null or pg_catalog.length(pg_catalog.btrim(v_word_text)) = 0 then
      raise exception 'TRANSCRIPTION_INVALID: word text is required' using errcode = '22000';
    end if;

    -- Require start/end times are numbers
    if pg_catalog.jsonb_typeof(v_word->'startSourceTime') <> 'number' or pg_catalog.jsonb_typeof(v_word->'endSourceTime') <> 'number' then
      raise exception 'TRANSCRIPTION_INVALID: word start/end times must be numbers' using errcode = '22000';
    end if;
    v_word_start := (v_word->>'startSourceTime')::numeric;
    v_word_end := (v_word->>'endSourceTime')::numeric;
    if v_word_start is null or v_word_end is null or v_word_start < 0 or v_word_end < 0 then
      raise exception 'TRANSCRIPTION_INVALID: word start/end times must be non-negative numbers' using errcode = '22000';
    end if;
    if v_word_start >= v_word_end then
      raise exception 'TRANSCRIPTION_INVALID: word start time must be less than end time' using errcode = '22000';
    end if;
    if v_word_end > v_auth_duration + 0.001 then
      raise exception 'TRANSCRIPTION_INVALID: word end time exceeds authoritative duration' using errcode = '22000';
    end if;

    -- Chronological check
    if v_word_start < v_prev_start then
      raise exception 'TRANSCRIPTION_INVALID: words must be in chronological order' using errcode = '22000';
    end if;

    -- Overlap check (within 0.001 tolerance)
    if v_prev_end > v_word_start and (v_prev_end - v_word_start) > 0.001 then
      raise exception 'TRANSCRIPTION_INVALID: words cannot overlap by more than 0.001s' using errcode = '22000';
    end if;

    -- Strict confidence checks
    if pg_catalog.jsonb_typeof(v_word->'confidence') <> 'null' then
      if pg_catalog.jsonb_typeof(v_word->'confidence') <> 'number' then
        raise exception 'TRANSCRIPTION_INVALID: confidence must be null or a number' using errcode = '22000';
      end if;
      v_confidence := (v_word->>'confidence')::numeric;
      if v_confidence < 0 or v_confidence > 1 then
        raise exception 'TRANSCRIPTION_INVALID: confidence must be null or a number between 0 and 1' using errcode = '22000';
      end if;
    end if;

    -- Strict speakerId checks
    if pg_catalog.jsonb_typeof(v_word->'speakerId') <> 'null' then
      if pg_catalog.jsonb_typeof(v_word->'speakerId') <> 'string' or pg_catalog.length(pg_catalog.btrim(v_word->>'speakerId')) = 0 then
        raise exception 'TRANSCRIPTION_INVALID: speakerId must be null or a non-empty string' using errcode = '22000';
      end if;
    end if;

    v_prev_start := v_word_start;
    v_prev_end := v_word_end;
  end loop;
end;
$$ language plpgsql security definer set search_path = '';

-- Revoke all execution rights from PUBLIC/anon/authenticated on internal validator
revoke all on function public.validate_video_source_transcript_internal(uuid, jsonb) from public, anon, authenticated;
