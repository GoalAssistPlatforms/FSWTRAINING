-- 20260713_video_editor_initial_edit_transaction.sql
-- Run this to add transaction-safe atomic initial editing support to the video editor.

-- 1. Add nullable creation_request_id column to public.video_editor_projects
alter table public.video_editor_projects
add column if not exists creation_request_id uuid default null;

-- 2. Create partial unique index to enforce idempotency request identifiers safely
create unique index if not exists video_editor_projects_creation_request_id_unique
on public.video_editor_projects (creation_request_id)
where creation_request_id is not null;

-- 3. Create the atomic initial edit function with OUT parameters
create or replace function public.create_video_editor_project_with_initial_commands(
  p_creation_request_id uuid,
  p_guide_id uuid,
  p_source_asset_id uuid,
  p_sequence_json jsonb,
  p_legacy_video_edits_json jsonb,
  p_commands jsonb,
  out o_project public.video_editor_projects,
  out o_is_replay boolean
)
returns record as $$
declare
  v_project public.video_editor_projects;
  v_account_id uuid;
  v_cmd jsonb;
  v_asset_duration numeric;
  v_clip jsonb;
  v_last_end numeric := 0;
  v_clip_start numeric;
  v_clip_end numeric;
  v_stored_count integer;
  v_idx integer;
  v_stored_cmd public.video_editor_commands%rowtype;
begin
  -- Idempotency check: if project with creation_request_id already exists
  if p_creation_request_id is not null then
    select * into v_project from public.video_editor_projects
    where creation_request_id = p_creation_request_id;

    if found then
      -- 8. Idempotent replay validation: check if everything matches exactly
      if v_project.created_by is distinct from auth.uid() or
         v_project.guide_id is distinct from p_guide_id or
         v_project.source_asset_id is distinct from p_source_asset_id or
         v_project.sequence_json is distinct from p_sequence_json or
         v_project.legacy_video_edits_json is distinct from p_legacy_video_edits_json then
        raise exception 'IDEMPOTENCY_REQUEST_MISMATCH' using errcode = 'PVE03';
      end if;

      -- Check commands count
      select count(*)::int into v_stored_count
      from public.video_editor_commands
      where project_id = v_project.id;

      if v_stored_count != jsonb_array_length(p_commands) then
        raise exception 'IDEMPOTENCY_REQUEST_MISMATCH' using errcode = 'PVE03';
      end if;

      -- Compare each command in order
      v_idx := 0;
      for v_stored_cmd in
        select * from public.video_editor_commands
        where project_id = v_project.id
        order by created_at asc, id asc
      loop
        v_cmd := p_commands->v_idx;
        if (v_cmd->>'id')::uuid is distinct from v_stored_cmd.id or
           (v_cmd->>'type') is distinct from v_stored_cmd.command_type or
           (v_cmd->'payload') is distinct from v_stored_cmd.payload_json or
           (v_cmd->'inversePayload') is distinct from v_stored_cmd.inverse_payload_json then
          raise exception 'IDEMPOTENCY_REQUEST_MISMATCH' using errcode = 'PVE03';
        end if;
        v_idx := v_idx + 1;
      end loop;

      o_project := v_project;
      o_is_replay := true;
      return;
    end if;
  end if;

  -- 1. Authentication Check
  if auth.uid() is null then
    raise exception 'Access Denied: Unauthenticated user' using errcode = '42501';
  end if;

  -- 2. Account derivation and validation
  select account_id into v_account_id from public.courses where id = p_guide_id;
  if v_account_id is null then
    raise exception 'Invalid guide: no account associated' using errcode = '22000';
  end if;

  -- 3. Validate guide and source asset relationship and account isolation
  select duration_seconds into v_asset_duration from public.video_source_assets
  where id = p_source_asset_id and guide_id = p_guide_id and account_id = v_account_id;

  if not found then
    raise exception 'Source asset mismatch' using errcode = '22000';
  end if;

  -- 4. Validate account editing permission
  if not public.can_edit_video_editor_guide(p_guide_id) then
    raise exception 'Access Denied: Editing rights required for this guide.' using errcode = '42501';
  end if;

  -- 5. Validate sequence
  if coalesce((p_sequence_json->>'schemaVersion')::int, 0) != 2 then
    raise exception 'Sequence schema version must be 2' using errcode = '22000';
  end if;

  if p_sequence_json->>'sourceAssetId' is distinct from p_source_asset_id::text then
    raise exception 'Sequence source asset ID mismatch' using errcode = '22000';
  end if;

  if jsonb_typeof(p_sequence_json->'clips') != 'array' then
    raise exception 'Sequence clips must be an array' using errcode = '22000';
  end if;

  -- Validate clips
  for v_clip in select * from jsonb_array_elements(p_sequence_json->'clips') loop
    if jsonb_typeof(v_clip) != 'object' then
      raise exception 'Sequence clip is not an object' using errcode = '22000';
    end if;
    if v_clip->>'id' is null or v_clip->>'id' = '' then
      raise exception 'Sequence clip id is required' using errcode = '22000';
    end if;
    if v_clip->>'sourceAssetId' is distinct from p_source_asset_id::text then
      raise exception 'Sequence clip source asset ID mismatch' using errcode = '22000';
    end if;

    v_clip_start := (v_clip->>'sourceStart')::numeric;
    v_clip_end := (v_clip->>'sourceEnd')::numeric;

    if v_clip_start is null or v_clip_end is null then
      raise exception 'Sequence clip start and end times must be numbers' using errcode = '22000';
    end if;

    if v_clip_start < 0 or v_clip_end > v_asset_duration then
      raise exception 'Sequence clip boundaries exceed source duration' using errcode = '22000';
    end if;

    if v_clip_start >= v_clip_end then
      raise exception 'Sequence clip start must be less than end' using errcode = '22000';
    end if;

    if v_clip_start < v_last_end then
      raise exception 'Sequence clips must be chronological and non-overlapping' using errcode = '22000';
    end if;

    v_last_end := v_clip_end;
  end loop;

  -- 6. Validate command array (must be non-empty)
  if jsonb_typeof(p_commands) != 'array' or jsonb_array_length(p_commands) = 0 then
    raise exception 'Initial commands array must be non-empty' using errcode = '22000';
  end if;

  -- Check uniqueness of command ID in request array
  select count(distinct value->>'id')::int into v_stored_count
  from jsonb_array_elements(p_commands);

  if v_stored_count != jsonb_array_length(p_commands) then
    raise exception 'Duplicate command ID within request' using errcode = '22000';
  end if;

  -- Command pre-validation
  for v_cmd in select * from jsonb_array_elements(p_commands) loop
    if jsonb_typeof(v_cmd) != 'object' then
      raise exception 'Command is not a JSON object' using errcode = '22000';
    end if;
    if v_cmd->>'id' is null or (v_cmd->>'id') = '' then
      raise exception 'Command ID is required' using errcode = '22000';
    end if;

    -- Validate UUID format
    begin
      perform (v_cmd->>'id')::uuid;
    exception when others then
      raise exception 'Command ID must be a valid UUID' using errcode = '22000';
    end;

    if v_cmd->>'type' is null or (v_cmd->>'type') = '' then
      raise exception 'Command type is required' using errcode = '22000';
    end if;
    if v_cmd->'payload' is null or jsonb_typeof(v_cmd->'payload') != 'object' then
      raise exception 'Command payload must be a JSON object' using errcode = '22000';
    end if;
    if v_cmd->'inversePayload' is null or jsonb_typeof(v_cmd->'inversePayload') != 'object' then
      raise exception 'Command inversePayload must be a JSON object' using errcode = '22000';
    end if;

    -- Check uniqueness of command ID in existing commands
    perform 1 from public.video_editor_commands where id = (v_cmd->>'id')::uuid;
    if found then
      raise exception 'Command ID already exists' using errcode = '22000';
    end if;
  end loop;

  -- 7. Insert Project at revision 1 (initial revision is 1 as commands are present)
  insert into public.video_editor_projects (
    creation_request_id,
    account_id,
    guide_id,
    source_asset_id,
    schema_version,
    revision,
    status,
    sequence_json,
    legacy_video_edits_json,
    created_by
  )
  values (
    p_creation_request_id,
    v_account_id,
    p_guide_id,
    p_source_asset_id,
    2,
    1,
    'ready',
    p_sequence_json,
    p_legacy_video_edits_json,
    auth.uid()
  )
  returning * into v_project;

  -- 8. Insert Commands at project_revision = 1
  for v_cmd in select * from jsonb_array_elements(p_commands) loop
    insert into public.video_editor_commands (
      id,
      project_id,
      project_revision,
      command_type,
      payload_json,
      inverse_payload_json,
      group_id,
      actor_id
    )
    values (
      (v_cmd->>'id')::uuid,
      v_project.id,
      1,
      v_cmd->>'type',
      v_cmd->'payload',
      v_cmd->'inversePayload',
      (v_cmd->>'groupId')::uuid,
      auth.uid()
    );
  end loop;

  o_project := v_project;
  o_is_replay := false;

exception
  when unique_violation then
    raise exception 'PROJECT_CREATION_CONFLICT' using errcode = 'PVE02';
end;
$$ language plpgsql security definer set search_path = '';

-- 10. Secure function permissions
revoke execute on function public.create_video_editor_project_with_initial_commands(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_video_editor_project_with_initial_commands(uuid, uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
