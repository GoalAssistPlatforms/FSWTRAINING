import { VideoSequence, LegacyVideoEdits } from "../domain/editorTypes";

export type VideoEditorProjectStatus =
  | "preparing"
  | "ready"
  | "editing"
  | "rendering"
  | "completed"
  | "failed";

export interface PersistedVideoEditorProject {
  id: string;
  accountId: string;
  organisationId: string | null;
  guideId: string;
  sourceAssetId: string;
  schemaVersion: 2;
  revision: number;
  status: VideoEditorProjectStatus;
  sequence: VideoSequence;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastSavedAt: string | null;
  persistenceState?: ProjectPersistenceState;
}

export interface CreateVideoEditorProjectInput {
  guideId: string;
  sourceAssetId: string;
  sequence: VideoSequence;
  legacyVideoEdits?: LegacyVideoEdits | null;
}

export interface CreateVideoEditorProjectWithInitialCommandsInput {
  creationRequestId: string;
  guideId: string;
  sourceAssetId: string;
  sequence: VideoSequence;
  legacyVideoEdits?: LegacyVideoEdits | null;
  commands: EditorCommand[];
}

export type ProjectPersistenceState = "not_created" | "created";

export interface SaveVideoEditorProjectInput {
  projectId: string;
  expectedRevision: number;
  sequence: VideoSequence;
  status?: VideoEditorProjectStatus;
  commands: EditorCommand[];
}

export interface SaveVideoEditorProjectResult {
  projectId: string;
  revision: number;
  savedAt: string;
}

export interface EditorCommand {
  id?: string;
  type: string;
  payload: Record<string, any>;
  inversePayload: Record<string, any>;
  groupId?: string | null;
}

export interface PersistedVideoSourceAsset {
  id: string;
  accountId: string;
  organisationId: string | null;
  guideId: string;
  originalStoragePath: string;
  proxyStoragePath: string | null;
  audioStoragePath: string | null;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  fileSizeBytes: number;
  preparationStatus: "uploaded" | "preparing" | "ready" | "failed";
  preparationError: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRevisionConflict {
  code: "PROJECT_REVISION_CONFLICT";
  projectId: string;
  expectedRevision: number;
  actualRevision: number;
}

export interface CreateVideoSourceAssetInput {
  accountId: string;
  guideId: string;
  originalStoragePath: string;
  durationSeconds: number;
  fileSizeBytes: number;
  preparationStatus?: "uploaded" | "preparing" | "ready" | "failed";
}

export interface UpdateSourceAssetPreparationInput {
  sourceAssetId: string;
  proxyStoragePath?: string | null;
  audioStoragePath?: string | null;
  width?: number | null;
  height?: number | null;
  frameRate?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  preparationStatus: "uploaded" | "preparing" | "ready" | "failed";
  preparationError?: string | null;
}
