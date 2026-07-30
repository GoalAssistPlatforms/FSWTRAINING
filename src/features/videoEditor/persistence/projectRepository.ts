import { supabase } from "../../../api/supabase";
import {
  PersistedVideoEditorProject,
  CreateVideoEditorProjectInput,
  CreateVideoEditorProjectWithInitialCommandsInput,
  SaveVideoEditorProjectInput,
  SaveVideoEditorProjectResult,
  PersistedVideoSourceAsset,
  CreateVideoSourceAssetInput,
  UpdateSourceAssetPreparationInput
} from "./projectPersistenceTypes";
import {
  ProjectNotFoundError,
  ProjectAccessError,
  ProjectRevisionConflictError,
  ProjectValidationError,
  ProjectCreationConflictError,
  ProjectPersistenceError,
  SourceAssetNotFoundError,
  ProjectIdempotencyMismatchError
} from "./projectPersistenceErrors";

function mapProjectRow(row: any): PersistedVideoEditorProject {
  if (!row) {
    throw new ProjectPersistenceError("Database returned an empty row");
  }

  const seq = typeof row.sequence_json === "string" ? JSON.parse(row.sequence_json) : row.sequence_json;
  if (!seq || seq.schemaVersion !== 2) {
    throw new ProjectValidationError("Invalid sequence schema version in database row");
  }

  return {
    id: row.id,
    accountId: row.account_id,
    organisationId: row.organisation_id || null,
    guideId: row.guide_id,
    sourceAssetId: row.source_asset_id,
    schemaVersion: 2,
    revision: row.revision,
    status: row.status,
    sequence: seq,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSavedAt: row.last_saved_at || null
  };
}

function handleDbError(err: any, contextMsg: string, projectIdContext = ""): never {
  const code = err?.code || "";
  const message = err?.message || "";

  if (code === "42501" || message.includes("Access Denied") || message.includes("permission denied")) {
    throw new ProjectAccessError(`${contextMsg}: Access denied`, err);
  }
  if (code === "PVE01" || message.includes("PROJECT_REVISION_CONFLICT")) {
    let expected = -1;
    let actual = -1;
    const match = message.match(/Expected revision (\d+), but stored revision is (\d+)/);
    if (match) {
      expected = parseInt(match[1], 10);
      actual = parseInt(match[2], 10);
    }
    throw new ProjectRevisionConflictError(
      `${contextMsg}: Revision conflict`,
      projectIdContext,
      expected,
      actual,
      err
    );
  }
  if (code === "PVE02" || message.includes("unique_violation") || message.includes("Project already exists") || message.includes("PROJECT_CREATION_CONFLICT")) {
    throw new ProjectCreationConflictError(`${contextMsg}: Creation conflict`, err);
  }
  if (code === "PVE03" || message.includes("IDEMPOTENCY_REQUEST_MISMATCH")) {
    throw new ProjectIdempotencyMismatchError(`${contextMsg}: Idempotency mismatch`, err);
  }
  if (code === "P0002" || message.includes("Project not found")) {
    throw new ProjectNotFoundError(`${contextMsg}: Project not found`, err);
  }
  throw new ProjectPersistenceError(`${contextMsg}: ${message}`, err);
}

export const createProjectWithInitialCommands = async (
  input: CreateVideoEditorProjectWithInitialCommandsInput
): Promise<{ project: PersistedVideoEditorProject; isReplay: boolean }> => {
  const { data, error } = await supabase.rpc("create_video_editor_project_with_initial_commands", {
    p_creation_request_id: input.creationRequestId,
    p_guide_id: input.guideId,
    p_source_asset_id: input.sourceAssetId,
    p_sequence_json: input.sequence,
    p_legacy_video_edits_json: input.legacyVideoEdits || null,
    p_commands: input.commands
  });

  if (error) {
    handleDbError(error, "Failed to create project with initial commands");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.o_project) {
    throw new ProjectPersistenceError("No project row returned from atomic creation RPC");
  }

  return {
    project: mapProjectRow(row.o_project),
    isReplay: !!row.o_is_replay
  };
};

export const createProject = async (
  input: CreateVideoEditorProjectInput
): Promise<PersistedVideoEditorProject> => {
  const { data, error } = await supabase.rpc("create_video_editor_project", {
    p_guide_id: input.guideId,
    p_source_asset_id: input.sourceAssetId,
    p_sequence_json: input.sequence,
    p_legacy_video_edits_json: input.legacyVideoEdits || null
  });

  if (error) {
    handleDbError(error, "Failed to create project");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new ProjectPersistenceError("No project row returned from creation RPC");
  }

  return mapProjectRow(row);
};

export const loadProject = async (
  projectId: string
): Promise<PersistedVideoEditorProject> => {
  const { data, error } = await supabase
    .from("video_editor_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    handleDbError(error, `Failed to load project ${projectId}`, projectId);
  }
  if (!data) {
    throw new ProjectNotFoundError(`Project not found: ${projectId}`);
  }

  return mapProjectRow(data);
};

export const loadProjectForGuide = async (
  guideId: string,
  sourceAssetId: string
): Promise<PersistedVideoEditorProject | null> => {
  const { data, error } = await supabase
    .from("video_editor_projects")
    .select("*")
    .eq("guide_id", guideId)
    .eq("source_asset_id", sourceAssetId)
    .maybeSingle();

  if (error) {
    handleDbError(error, "Failed to load project for guide");
  }
  if (!data) {
    return null;
  }

  return mapProjectRow(data);
};

export const saveProject = async (
  input: SaveVideoEditorProjectInput
): Promise<SaveVideoEditorProjectResult> => {
  const { data, error } = await supabase.rpc("save_video_editor_project", {
    p_project_id: input.projectId,
    p_expected_revision: input.expectedRevision,
    p_sequence_json: input.sequence,
    p_status: input.status || null,
    p_commands: input.commands
  });

  if (error) {
    const code = error?.code || "";
    const message = error?.message || "";
    if (code === "PVE01" || message.includes("PROJECT_REVISION_CONFLICT")) {
      let expected = input.expectedRevision;
      let actual = -1;
      const match = message.match(/Expected revision (\d+), but stored revision is (\d+)/);
      if (match) {
        expected = parseInt(match[1], 10);
        actual = parseInt(match[2], 10);
      }
      throw new ProjectRevisionConflictError(
        `Save conflict: Expected revision ${expected}, but actual is ${actual}`,
        input.projectId,
        expected,
        actual,
        error
      );
    }
    handleDbError(error, "Failed to save project", input.projectId);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new ProjectPersistenceError("No project row returned from save RPC");
  }

  return {
    projectId: row.id,
    revision: row.revision,
    savedAt: row.last_saved_at || new Date().toISOString()
  };
};

export const loadSourceAsset = async (
  sourceAssetId: string
): Promise<PersistedVideoSourceAsset> => {
  const { data, error } = await supabase
    .from("video_source_assets")
    .select("*")
    .eq("id", sourceAssetId)
    .maybeSingle();

  if (error) {
    handleDbError(error, `Failed to load source asset ${sourceAssetId}`);
  }
  if (!data) {
    throw new SourceAssetNotFoundError(`Source asset not found: ${sourceAssetId}`);
  }

  return mapSourceAssetRow(data);
};

function mapSourceAssetRow(row: any): PersistedVideoSourceAsset {
  if (!row) {
    throw new SourceAssetNotFoundError("Database returned empty source asset row");
  }
  return {
    id: row.id,
    accountId: row.account_id,
    organisationId: row.organisation_id || null,
    guideId: row.guide_id,
    originalStoragePath: row.original_storage_path,
    proxyStoragePath: row.proxy_storage_path || null,
    audioStoragePath: row.audio_storage_path || null,
    durationSeconds: parseFloat(row.duration_seconds),
    width: row.width || null,
    height: row.height || null,
    frameRate: row.frame_rate ? parseFloat(row.frame_rate) : null,
    videoCodec: row.video_codec || null,
    audioCodec: row.audio_codec || null,
    fileSizeBytes: parseInt(row.file_size_bytes, 10),
    preparationStatus: row.preparation_status,
    preparationError: row.preparation_error || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const createSourceAsset = async (
  input: CreateVideoSourceAssetInput
): Promise<PersistedVideoSourceAsset> => {
  const { data, error } = await supabase.rpc("create_video_source_asset", {
    p_guide_id: input.guideId,
    p_original_storage_path: input.originalStoragePath,
    p_duration_seconds: input.durationSeconds,
    p_file_size_bytes: input.fileSizeBytes
  });

  if (error) {
    handleDbError(error, "Failed to create source asset");
  }
  return mapSourceAssetRow(data);
};

export const updateSourceAssetPreparation = async (
  input: UpdateSourceAssetPreparationInput
): Promise<PersistedVideoSourceAsset> => {
  const updates: Record<string, any> = {
    preparation_status: input.preparationStatus,
    updated_at: new Date().toISOString()
  };

  if (input.proxyStoragePath !== undefined) updates.proxy_storage_path = input.proxyStoragePath;
  if (input.audioStoragePath !== undefined) updates.audio_storage_path = input.audioStoragePath;
  if (input.width !== undefined) updates.width = input.width;
  if (input.height !== undefined) updates.height = input.height;
  if (input.frameRate !== undefined) updates.frame_rate = input.frameRate;
  if (input.videoCodec !== undefined) updates.video_codec = input.videoCodec;
  if (input.audioCodec !== undefined) updates.audio_codec = input.audioCodec;
  if (input.preparationError !== undefined) updates.preparation_error = input.preparationError;

  const { data, error } = await supabase
    .from("video_source_assets")
    .update(updates)
    .eq("id", input.sourceAssetId)
    .select()
    .maybeSingle();

  if (error) {
    handleDbError(error, `Failed to update source asset ${input.sourceAssetId}`);
  }
  if (!data) {
    throw new SourceAssetNotFoundError(`Source asset not found: ${input.sourceAssetId}`);
  }

  return mapSourceAssetRow(data);
};
