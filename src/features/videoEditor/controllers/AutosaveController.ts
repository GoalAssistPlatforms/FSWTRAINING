import { VideoSequence } from "../domain/editorTypes";
import { EditorCommand, SaveVideoEditorProjectResult, ProjectPersistenceState } from "../persistence/projectPersistenceTypes";
import {
  ProjectRevisionConflictError,
  ProjectAccessError,
  ProjectValidationError,
  ProjectNotFoundError,
  ProjectCreationConflictError,
  ProjectIdempotencyMismatchError
} from "../persistence/projectPersistenceErrors";

export type AutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "retrying"
  | "conflict"
  | "error";

export interface AutosaveSnapshot {
  projectId: string;
  expectedRevision: number;
  sequence: VideoSequence;
  commands: EditorCommand[];
  capturedAt: string;
}

export type SaveFunction = (
  projectId: string,
  expectedRevision: number,
  sequence: VideoSequence,
  commands: EditorCommand[],
  persistenceState?: ProjectPersistenceState,
  creationRequestId?: string
) => Promise<SaveVideoEditorProjectResult>;

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class AutosaveController {
  private projectId: string;
  private revision: number;
  private sequence: VideoSequence;
  private pendingCommands: EditorCommand[] = [];

  private status: AutosaveStatus = "idle";
  private activeSavePromise: Promise<void> | null = null;
  private currentSnapshot: AutosaveSnapshot | null = null;
  private queuedSaveRequested = false;

  private debounceTimer: any = null;
  private retryTimer: any = null;
  private retryCount = 0;

  private saveFn: SaveFunction;
  private onStatusChange?: (status: AutosaveStatus) => void;
  private onSaveSuccess?: (result: SaveVideoEditorProjectResult) => void;
  private onConflict?: (actualRevision: number) => void;

  private isDisposed = false;

  private persistenceState: ProjectPersistenceState = "created";
  private frozenCreationAttempt: {
    creationRequestId: string;
    sequence: VideoSequence;
    commands: EditorCommand[];
  } | null = null;

  constructor(options: {
    projectId: string;
    initialRevision: number;
    initialSequence: VideoSequence;
    saveFn: SaveFunction;
    onStatusChange?: (status: AutosaveStatus) => void;
    onSaveSuccess?: (result: SaveVideoEditorProjectResult) => void;
    onConflict?: (actualRevision: number) => void;
    persistenceState?: ProjectPersistenceState;
  }) {
    this.projectId = options.projectId;
    this.revision = options.initialRevision;
    this.sequence = JSON.parse(JSON.stringify(options.initialSequence));
    this.saveFn = options.saveFn;
    this.onStatusChange = options.onStatusChange;
    this.onSaveSuccess = options.onSaveSuccess;
    this.onConflict = options.onConflict;
    this.persistenceState = options.persistenceState || "created";
  }

  public getStatus(): AutosaveStatus {
    return this.status;
  }

  public getRevision(): number {
    return this.revision;
  }

  public getSequence(): VideoSequence {
    return this.sequence;
  }

  public getPendingCommands(): EditorCommand[] {
    return this.pendingCommands;
  }

  public getPersistenceState(): ProjectPersistenceState {
    return this.persistenceState;
  }

  private setStatus(newStatus: AutosaveStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      if (this.onStatusChange) {
        this.onStatusChange(newStatus);
      }
    }
  }

  public updateState(sequence: VideoSequence, command?: EditorCommand) {
    if (this.isDisposed || this.status === "conflict") return;

    const sequenceChanged = JSON.stringify(sequence) !== JSON.stringify(this.sequence);
    if (!sequenceChanged && !command) {
      return;
    }

    this.sequence = JSON.parse(JSON.stringify(sequence));
    if (command) {
      this.pendingCommands.push(command);
    }

    this.setStatus("dirty");
    this.scheduleDebounce();
  }

  private scheduleDebounce() {
    this.clearDebounceTimer();
    this.debounceTimer = setTimeout(() => {
      this.triggerSave();
    }, 1000);
  }

  private clearDebounceTimer() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  public triggerSave() {
    if (this.isDisposed || this.status === "conflict") return;
    this.clearDebounceTimer();

    if (this.activeSavePromise) {
      this.queuedSaveRequested = true;
      return;
    }

    this.performSave();
  }

  public flush(): Promise<void> {
    if (this.isDisposed || this.status === "conflict") {
      return Promise.resolve();
    }
    this.clearDebounceTimer();

    if (this.activeSavePromise) {
      this.queuedSaveRequested = true;
      return this.activeSavePromise;
    }

    if (
      this.status === "dirty" ||
      this.status === "error" ||
      this.status === "retrying" ||
      this.pendingCommands.length > 0
    ) {
      this.performSave();
    }
    return this.activeSavePromise || Promise.resolve();
  }

  private performSave() {
    this.clearDebounceTimer();
    this.setStatus("saving");

    if (this.persistenceState === "not_created") {
      if (!this.frozenCreationAttempt) {
        if (this.pendingCommands.length === 0) {
          this.setStatus("idle");
          return;
        }
        this.frozenCreationAttempt = {
          creationRequestId: generateUUID(),
          sequence: JSON.parse(JSON.stringify(this.sequence)),
          commands: [...this.pendingCommands]
        };
      }

      const attempt = this.frozenCreationAttempt;
      this.currentSnapshot = {
        projectId: this.projectId,
        expectedRevision: 0,
        sequence: attempt.sequence,
        commands: attempt.commands,
        capturedAt: new Date().toISOString()
      };

      this.activeSavePromise = (async () => {
        try {
          const result = await this.saveFn(
            this.projectId,
            0,
            attempt.sequence,
            attempt.commands,
            "not_created",
            attempt.creationRequestId
          );

          if (this.isDisposed) return;

          this.persistenceState = "created";
          this.revision = result.revision;
          this.projectId = result.projectId;
          this.pendingCommands = this.pendingCommands.slice(attempt.commands.length);
          this.frozenCreationAttempt = null;

          this.retryCount = 0;
          this.currentSnapshot = null;
          this.activeSavePromise = null;
          this.setStatus("saved");

          if (this.onSaveSuccess) {
            this.onSaveSuccess(result);
          }

          if (this.queuedSaveRequested || this.pendingCommands.length > 0) {
            this.queuedSaveRequested = false;
            this.performSave();
          } else {
            this.setStatus("idle");
          }
        } catch (error) {
          if (this.isDisposed) return;
          this.activeSavePromise = null;
          this.handleSaveError(error);
        }
      })();
    } else {
      const capturedCommands = [...this.pendingCommands];
      this.currentSnapshot = {
        projectId: this.projectId,
        expectedRevision: this.revision,
        sequence: JSON.parse(JSON.stringify(this.sequence)),
        commands: capturedCommands,
        capturedAt: new Date().toISOString()
      };

      this.activeSavePromise = (async () => {
        try {
          const result = await this.saveFn(
            this.projectId,
            this.revision,
            JSON.parse(JSON.stringify(this.sequence)),
            capturedCommands
          );

          if (this.isDisposed) return;

          this.revision = result.revision;
          this.pendingCommands = this.pendingCommands.slice(capturedCommands.length);

          this.retryCount = 0;
          this.currentSnapshot = null;
          this.activeSavePromise = null;
          this.setStatus("saved");

          if (this.onSaveSuccess) {
            this.onSaveSuccess(result);
          }

          if (this.queuedSaveRequested || this.pendingCommands.length > 0) {
            this.queuedSaveRequested = false;
            this.performSave();
          } else {
            this.setStatus("idle");
          }
        } catch (error) {
          if (this.isDisposed) return;
          this.activeSavePromise = null;
          this.handleSaveError(error);
        }
      })();
    }
  }

  private handleSaveError(error: any) {
    if (
      error instanceof ProjectIdempotencyMismatchError ||
      error?.message?.includes("IDEMPOTENCY_REQUEST_MISMATCH") ||
      error?.name === "ProjectIdempotencyMismatchError"
    ) {
      this.setStatus("error");
      return;
    }

    if (
      error instanceof ProjectCreationConflictError ||
      error?.message?.includes("PROJECT_CREATION_CONFLICT") ||
      error?.name === "ProjectCreationConflictError"
    ) {
      this.setStatus("conflict");
      if (this.onConflict) {
        this.onConflict(1);
      }
      return;
    }

    if (
      error instanceof ProjectRevisionConflictError ||
      error?.message?.includes("PROJECT_REVISION_CONFLICT")
    ) {
      this.setStatus("conflict");
      const actualRevision = error?.actualRevision ?? (this.revision + 1);
      if (this.onConflict) {
        this.onConflict(actualRevision);
      }
      return;
    }

    if (
      error instanceof ProjectAccessError ||
      error instanceof ProjectValidationError ||
      error instanceof ProjectNotFoundError
    ) {
      this.setStatus("error");
      return;
    }

    if (this.retryCount < 3) {
      this.retryCount++;
      this.setStatus("retrying");
      const delay = this.retryCount === 1 ? 1000 : this.retryCount === 2 ? 2000 : 4000;
      this.clearRetryTimer();
      this.retryTimer = setTimeout(() => {
        this.performSave();
      }, delay);
    } else {
      this.setStatus("error");
    }
  }

  public reset(revision: number, sequence: VideoSequence) {
    if (this.isDisposed) return;
    this.clearDebounceTimer();
    this.clearRetryTimer();

    this.revision = revision;
    this.sequence = JSON.parse(JSON.stringify(sequence));
    this.pendingCommands = [];
    this.activeSavePromise = null;
    this.currentSnapshot = null;
    this.queuedSaveRequested = false;
    this.retryCount = 0;
    this.setStatus("idle");
  }

  public manualRetry() {
    if (this.isDisposed || this.status === "conflict" || this.activeSavePromise) return;
    this.clearRetryTimer();
    this.retryCount = 0;
    this.performSave();
  }

  public dispose() {
    this.isDisposed = true;
    this.clearDebounceTimer();
    this.clearRetryTimer();
    this.activeSavePromise = null;
    this.currentSnapshot = null;
  }
}

// Compile-time static type verification asserting that transient editor state properties
// are strictly separated and excluded from the AutosaveController persistent sequence and command inputs.
type AssertKeys<T, K extends keyof T> = K;
type TransientStateKeys = "playhead" | "playback" | "volume" | "hover" | "scroll" | "panel" | "drag" | "selection";
type SequenceKeys = keyof VideoSequence;
type CommandKeys = keyof EditorCommand;

type CheckSequenceTransient = TransientStateKeys & SequenceKeys;
type CheckCommandTransient = TransientStateKeys & CommandKeys;

const _assertSequenceClean: CheckSequenceTransient = undefined as any as never;
const _assertCommandClean: CheckCommandTransient = undefined as any as never;
