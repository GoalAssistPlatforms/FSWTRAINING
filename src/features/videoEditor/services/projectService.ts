import {
  createProject,
  createProjectWithInitialCommands,
  loadProject,
  loadProjectForGuide,
  saveProject,
  loadSourceAsset,
  createSourceAsset,
  updateSourceAssetPreparation
} from "../persistence/projectRepository";
import {
  PersistedVideoEditorProject,
  CreateVideoEditorProjectInput,
  SaveVideoEditorProjectInput,
  SaveVideoEditorProjectResult,
  EditorCommand,
  PersistedVideoSourceAsset,
  CreateVideoSourceAssetInput,
  UpdateSourceAssetPreparationInput,
  ProjectPersistenceState
} from "../persistence/projectPersistenceTypes";
import {
  ProjectValidationError,
  ProjectCreationConflictError
} from "../persistence/projectPersistenceErrors";
import { validateSequence } from "../domain/sequenceValidation";
import { createInitialSequence } from "../domain/sequenceEngine";
import { migrateVideoEditsV1ToV2 } from "../migrations/migrateVideoEditsV1ToV2";
import { LegacyVideoEdits, VideoSequence } from "../domain/editorTypes";

export const createNewEditorProject = async (
  input: CreateVideoEditorProjectInput
): Promise<PersistedVideoEditorProject> => {
  if (input.sequence.schemaVersion !== 2) {
    throw new ProjectValidationError("Sequence schema version must be 2");
  }

  // Load original asset to validate sequence bounds
  const asset = await loadSourceAsset(input.sourceAssetId);
  const validationResult = validateSequence(input.sequence, asset.durationSeconds);
  if (!validationResult.valid) {
    const messages = validationResult.issues.map(i => i.message).join(", ");
    throw new ProjectValidationError(`Invalid initial sequence: ${messages}`);
  }

  return await createProject(input);
};

export const loadEditorProject = async (
  projectId: string
): Promise<PersistedVideoEditorProject> => {
  return await loadProject(projectId);
};

export const loadOrCreateEditorProject = async (
  guideId: string,
  sourceAssetId: string,
  legacyEdits?: LegacyVideoEdits | null
): Promise<PersistedVideoEditorProject> => {
  // 1. Look for an existing version 2 project
  const existing = await loadProjectForGuide(guideId, sourceAssetId);
  if (existing) {
    return existing;
  }

  // 2. Load the source asset to get its duration
  const asset = await loadSourceAsset(sourceAssetId);

  // 3. Create or migrate sequence
  let sequence;
  if (legacyEdits) {
    // Clone legacy edits to prevent mutating the caller-supplied object
    const legacyCopy = JSON.parse(JSON.stringify(legacyEdits));
    sequence = migrateVideoEditsV1ToV2(sourceAssetId, asset.durationSeconds, legacyCopy);
  } else {
    sequence = createInitialSequence(sourceAssetId, asset.durationSeconds);
  }

  try {
    return await createProject({
      guideId,
      sourceAssetId,
      sequence,
      legacyVideoEdits: legacyEdits || null
    });
  } catch (error) {
    // 4. Handle creation races by loading the project created by the competing request
    if (error instanceof ProjectCreationConflictError) {
      const racedProject = await loadProjectForGuide(guideId, sourceAssetId);
      if (racedProject) {
        return racedProject;
      }
    }
    throw error;
  }
};

export const saveEditorProject = async (
  input: SaveVideoEditorProjectInput
): Promise<SaveVideoEditorProjectResult> => {
  if (input.sequence.schemaVersion !== 2) {
    throw new ProjectValidationError("Sequence schema version must be 2");
  }

  // Load the current project to find the source asset details
  const project = await loadProject(input.projectId);
  const asset = await loadSourceAsset(project.sourceAssetId);

  // Validate sequence bounds
  const validationResult = validateSequence(input.sequence, asset.durationSeconds);
  if (!validationResult.valid) {
    const messages = validationResult.issues.map(i => i.message).join(", ");
    throw new ProjectValidationError(`Invalid save sequence: ${messages}`);
  }

  // Reject invalid command payloads
  for (const cmd of input.commands) {
    if (!cmd.type || typeof cmd.type !== "string") {
      throw new ProjectValidationError("Command payload is missing type");
    }
    if (!cmd.payload || typeof cmd.payload !== "object") {
      throw new ProjectValidationError(`Command ${cmd.type} is missing payload object`);
    }
    if (!cmd.inversePayload || typeof cmd.inversePayload !== "object") {
      throw new ProjectValidationError(`Command ${cmd.type} is missing inversePayload object`);
    }
  }

  return await saveProject(input);
};

export const loadProjectState = async (
  guideId: string,
  sourceAssetId: string,
  legacyEdits?: LegacyVideoEdits | null
): Promise<PersistedVideoEditorProject> => {
  const existing = await loadProjectForGuide(guideId, sourceAssetId);
  if (existing) {
    existing.persistenceState = "created";
    return existing;
  }

  const asset = await loadSourceAsset(sourceAssetId);
  let sequence;
  if (legacyEdits) {
    const legacyCopy = JSON.parse(JSON.stringify(legacyEdits));
    sequence = migrateVideoEditsV1ToV2(sourceAssetId, asset.durationSeconds, legacyCopy);
  } else {
    sequence = createInitialSequence(sourceAssetId, asset.durationSeconds);
  }

  // Return a transient project object without saving to database yet
  return {
    id: guideId, // Use guide ID as project ID temporarily or permanently
    accountId: asset.accountId,
    organisationId: asset.organisationId,
    guideId,
    sourceAssetId,
    schemaVersion: 2,
    revision: 0,
    status: "ready",
    sequence,
    createdBy: asset.createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSavedAt: null,
    persistenceState: "not_created"
  };
};

export const persistEditorProjectUpdate = async (
  projectId: string | null,
  expectedRevision: number,
  sequence: VideoSequence,
  commands: EditorCommand[],
  guideId: string,
  sourceAssetId: string,
  persistenceState: ProjectPersistenceState = "created",
  creationRequestId?: string
): Promise<SaveVideoEditorProjectResult> => {
  if (persistenceState === "not_created") {
    if (commands.length === 0) {
      throw new ProjectValidationError("Missing projects require at least one initial command");
    }
    if (!creationRequestId) {
      throw new ProjectValidationError("Creation request identifier is required for new projects");
    }
    const res = await createProjectWithInitialCommands({
      creationRequestId,
      guideId,
      sourceAssetId,
      sequence,
      legacyVideoEdits: null,
      commands
    });
    return {
      projectId: res.project.id,
      revision: 1,
      savedAt: res.project.updatedAt
    };
  }

  if (!projectId) {
    throw new ProjectValidationError("Project ID is required for existing projects");
  }

  return await saveEditorProject({
    projectId,
    expectedRevision,
    sequence,
    commands
  });
};

export const createNewSourceAsset = async (
  input: CreateVideoSourceAssetInput
): Promise<PersistedVideoSourceAsset> => {
  if (!input.originalStoragePath || input.originalStoragePath.trim() === "") {
    throw new ProjectValidationError("Original storage path is required");
  }
  if (input.durationSeconds < 0) {
    throw new ProjectValidationError("Duration seconds must be non-negative");
  }
  if (input.fileSizeBytes < 0) {
    throw new ProjectValidationError("File size bytes must be non-negative");
  }
  return await createSourceAsset(input);
};

export const updateSourceAssetPreparationMetadata = async (
  input: UpdateSourceAssetPreparationInput
): Promise<PersistedVideoSourceAsset> => {
  if (input.width !== undefined && input.width !== null && input.width < 0) {
    throw new ProjectValidationError("Width must be non-negative");
  }
  if (input.height !== undefined && input.height !== null && input.height < 0) {
    throw new ProjectValidationError("Height must be non-negative");
  }
  return await updateSourceAssetPreparation(input);
};
