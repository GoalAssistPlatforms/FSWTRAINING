import { VideoSequence, LegacyVideoEdits, SequenceClip } from "../domain/editorTypes";
import { AutosaveController } from "./AutosaveController";
import { PlaybackCoordinator } from "./PlaybackCoordinator";
import { EditorCommand } from "../persistence/projectPersistenceTypes";
import {
  TimelinePersistentState,
  TimelineTransientState,
  TimelineSelection,
  TimelineDragMode
} from "./timelineTypes";
import {
  TimelineSelectionInvalidError,
  TimelineCommandInvalidError,
  TimelineSequenceInvalidError,
  TimelineConflictError,
  TimelineDisposedError,
  TimelineRestoreUnavailableError
} from "./timelineErrors";
import {
  TimelineCommand,
  TimelineCommandType,
  TimelineCommandPayload
} from "./timelineCommands";
import {
  getVisibleDuration,
  removeVisibleRange,
  removeVisibleRanges as removeMultipleVisibleRanges,
  restoreSourceRange
} from "../domain/sequenceEngine";
import {
  visibleTimeToSourceTime,
  sourceTimeToVisibleTime
} from "../domain/timeMapping";
import { validateSequence } from "../domain/sequenceValidation";
import { roundTo6 } from "../domain/timePrecision";
import { generateSecureId } from "../domain/idGenerator";

export const MIN_REMOVAL_DURATION = 0.05;
export const SNAP_TOLERANCE = 0.25; // 250ms

export interface TimelineEditorControllerOptions {
  projectId: string;
  sourceAssetId: string;
  sourceDuration: number;
  initialSequence: VideoSequence;
  initialRevision: number;
  autosaveController?: AutosaveController;
  playbackCoordinator?: PlaybackCoordinator;
  legacyEdits?: LegacyVideoEdits | null;
  onStateChange?: (state: TimelinePersistentState, transientState: TimelineTransientState) => void;
  onConflict?: () => void;
}

export class TimelineEditorController {
  private projectId: string;
  private sourceAssetId: string;
  private sourceDuration: number;
  private committedSequence: VideoSequence;
  private projectRevision: number;

  private autosaveController?: AutosaveController;
  private playbackCoordinator?: PlaybackCoordinator;
  private legacyEdits: LegacyVideoEdits | null = null;
  private onStateChange?: (state: TimelinePersistentState, transientState: TimelineTransientState) => void;
  private onConflict?: () => void;

  private isDisposed = false;
  private isFirstEdit = true;
  private hasConflict = false;

  // Undo/Redo Stacks
  private undoStack: Array<{ sequence: VideoSequence; command: TimelineCommand }> = [];
  private redoStack: Array<{ sequence: VideoSequence; command: TimelineCommand }> = [];

  // Transient State
  private selection: TimelineSelection | null = null;
  private previewSequence: VideoSequence | null = null;
  private dragMode: TimelineDragMode = null;
  private focusedHandle: "start" | "end" | null = null;
  private hoveredJoinId: string | null = null;

  constructor(options: TimelineEditorControllerOptions) {
    this.projectId = options.projectId;
    this.sourceAssetId = options.sourceAssetId;
    this.sourceDuration = options.sourceDuration;
    this.committedSequence = JSON.parse(JSON.stringify(options.initialSequence));
    this.projectRevision = options.initialRevision;

    this.autosaveController = options.autosaveController;
    this.playbackCoordinator = options.playbackCoordinator;
    this.legacyEdits = options.legacyEdits || null;
    this.onStateChange = options.onStateChange;
    this.onConflict = options.onConflict;

    // Check if project has already been edited (revision > 0)
    if (this.projectRevision > 0) {
      this.isFirstEdit = false;
    }
  }

  private checkDisposed() {
    if (this.isDisposed) {
      throw new TimelineDisposedError("TimelineEditorController has been disposed");
    }
  }

  public getCommittedSequence(): VideoSequence {
    this.checkDisposed();
    return this.committedSequence;
  }

  public getPreviewSequence(): VideoSequence | null {
    this.checkDisposed();
    return this.previewSequence;
  }

  public getVisibleDuration(): number {
    this.checkDisposed();
    return getVisibleDuration(this.previewSequence || this.committedSequence);
  }

  public getRevision(): number {
    this.checkDisposed();
    return this.projectRevision;
  }

  public getUndoStack() {
    this.checkDisposed();
    return this.undoStack;
  }

  public getRedoStack() {
    this.checkDisposed();
    return this.redoStack;
  }

  public setFocusedHandle(handle: "start" | "end" | null) {
    this.checkDisposed();
    this.focusedHandle = handle;
    this.emitState();
  }

  public setHoveredJoinId(joinId: string | null) {
    this.checkDisposed();
    this.hoveredJoinId = joinId;
    this.emitState();
  }

  // Preview Operations (Transient)
  public updateDragPreview(dragMode: TimelineDragMode, selection: TimelineSelection | null, previewSequence: VideoSequence | null) {
    this.checkDisposed();
    if (this.hasConflict) return;
    this.dragMode = dragMode;
    this.selection = selection;
    this.previewSequence = previewSequence;
    this.emitState();

    if (this.playbackCoordinator && previewSequence) {
      this.playbackCoordinator.refreshSequence();
    }
  }

  public cancelDragPreview() {
    this.checkDisposed();
    this.dragMode = null;
    this.selection = null;
    this.previewSequence = null;
    this.emitState();

    if (this.playbackCoordinator) {
      this.playbackCoordinator.refreshSequence();
    }
  }

  // Persistent Edit Lifecycle
  private commitSequence(nextSeq: VideoSequence, cmdType: TimelineCommandType, payload: TimelineCommandPayload) {
    this.checkDisposed();
    if (this.hasConflict) {
      throw new TimelineConflictError("Cannot commit edits while in revision conflict");
    }

    const beforeSequence = JSON.parse(JSON.stringify(this.committedSequence));
    const validation = validateSequence(nextSeq, this.sourceDuration);
    if (!validation.valid) {
      throw new TimelineSequenceInvalidError(`Committed sequence is invalid: ${validation.issues[0]?.message}`);
    }

    const commandId = generateSecureId();

    // Add legacy migration payload on first edit
    if (this.isFirstEdit && this.legacyEdits) {
      payload.legacyMigration = this.legacyEdits;
      this.isFirstEdit = false;
    }

    const timelineCommand: TimelineCommand = {
      id: commandId,
      projectId: this.projectId,
      sourceAssetId: this.sourceAssetId,
      type: cmdType,
      beforeSequence,
      afterSequence: JSON.parse(JSON.stringify(nextSeq)),
      revisionBefore: this.projectRevision,
      revisionAfter: this.projectRevision + 1,
      createdAt: new Date().toISOString(),
      payload
    };

    // Push to undo stack, clear redo
    this.undoStack.push({
      sequence: beforeSequence,
      command: timelineCommand
    });
    this.redoStack = [];

    // Apply
    this.committedSequence = JSON.parse(JSON.stringify(nextSeq));
    this.projectRevision++;

    // Clear previews
    this.dragMode = null;
    this.selection = null;
    this.previewSequence = null;

    this.emitState();

    // Refresh Playback Coordinator
    if (this.playbackCoordinator) {
      this.playbackCoordinator.refreshSequence();
    }

    // Submit to Autosave Controller
    if (this.autosaveController) {
      const dbCommand: EditorCommand = {
        id: timelineCommand.id,
        type: timelineCommand.type,
        payload: {
          projectId: timelineCommand.projectId,
          sourceAssetId: timelineCommand.sourceAssetId,
          revisionBefore: timelineCommand.revisionBefore,
          revisionAfter: timelineCommand.revisionAfter,
          createdAt: timelineCommand.createdAt,
          ...timelineCommand.payload
        },
        inversePayload: {
          beforeSequence: timelineCommand.beforeSequence
        }
      };
      this.autosaveController.updateState(this.committedSequence, dbCommand);
    }
  }

  // Remove visible range
  public removeVisibleRange(visibleStart: number, visibleEnd: number) {
    this.checkDisposed();
    this.validateSelectionRange(visibleStart, visibleEnd);

    const sequence = JSON.parse(JSON.stringify(this.committedSequence));
    const startSource = visibleTimeToSourceTime(sequence, visibleStart).sourceTime;
    const endSource = visibleTimeToSourceTime(sequence, visibleEnd).sourceTime;

    const nextSeq = removeVisibleRange(sequence, visibleStart, visibleEnd, this.sourceDuration);

    this.commitSequence(nextSeq, "RemoveVisibleRange", {
      visibleStart: roundTo6(visibleStart),
      visibleEnd: roundTo6(visibleEnd),
      sourceStart: roundTo6(startSource),
      sourceEnd: roundTo6(endSource)
    });
  }

  // Remove several ranges from the same visible timeline as one undoable edit.
  public removeVisibleRanges(ranges: Array<{ visibleStart: number; visibleEnd: number }>) {
    this.checkDisposed();
    if (!Array.isArray(ranges) || ranges.length === 0) {
      throw new TimelineSelectionInvalidError("At least one removal range is required");
    }

    const orderedRanges = ranges
      .map((range) => ({
        visibleStart: range.visibleStart,
        visibleEnd: range.visibleEnd
      }))
      .sort((left, right) => left.visibleStart - right.visibleStart);

    orderedRanges.forEach((range) => {
      this.validateSelectionRange(range.visibleStart, range.visibleEnd);
    });

    for (let index = 1; index < orderedRanges.length; index++) {
      if (orderedRanges[index].visibleStart < orderedRanges[index - 1].visibleEnd) {
        throw new TimelineSelectionInvalidError("Removal ranges cannot overlap");
      }
    }

    const sequence = JSON.parse(JSON.stringify(this.committedSequence));
    const payloadRanges = orderedRanges.map((range) => ({
      visibleStart: roundTo6(range.visibleStart),
      visibleEnd: roundTo6(range.visibleEnd),
      sourceStart: roundTo6(
        visibleTimeToSourceTime(sequence, range.visibleStart).sourceTime
      ),
      sourceEnd: roundTo6(
        visibleTimeToSourceTime(sequence, range.visibleEnd).sourceTime
      )
    }));

    const nextSeq = removeMultipleVisibleRanges(
      sequence,
      orderedRanges,
      this.sourceDuration
    );

    this.commitSequence(nextSeq, "RemoveVisibleRanges", {
      ranges: payloadRanges
    });
  }

  // Restore removed range
  public restoreRemovedRange(sourceStart: number, sourceEnd: number) {
    this.checkDisposed();
    if (sourceStart < 0 || sourceEnd > this.sourceDuration || sourceStart >= sourceEnd) {
      throw new TimelineRestoreUnavailableError("Restore range lies outside source boundaries");
    }

    // Verify it is indeed a gap (not occupied by clips)
    const sequence = this.committedSequence;
    const isGap = !sequence.clips.some(c => c.sourceStart < sourceEnd && c.sourceEnd > sourceStart);
    if (!isGap) {
      throw new TimelineRestoreUnavailableError("Selected range is not a restorable gap");
    }

    const nextSeq = restoreSourceRange(JSON.parse(JSON.stringify(sequence)), sourceStart, sourceEnd, this.sourceDuration);

    this.commitSequence(nextSeq, "RestoreRemovedRange", {
      sourceStart: roundTo6(sourceStart),
      sourceEnd: roundTo6(sourceEnd)
    });
  }

  // Move a removal range
  public moveRemovedRange(originalSourceStart: number, originalSourceEnd: number, targetVisibleStart: number, targetVisibleEnd: number) {
    this.checkDisposed();
    this.validateSelectionRange(targetVisibleStart, targetVisibleEnd);

    const restoredSeq = restoreSourceRange(JSON.parse(JSON.stringify(this.committedSequence)), originalSourceStart, originalSourceEnd, this.sourceDuration);
    const finalSeq = removeVisibleRange(restoredSeq, targetVisibleStart, targetVisibleEnd, this.sourceDuration);

    this.commitSequence(finalSeq, "MoveRemovedRange", {
      originalSourceStart: roundTo6(originalSourceStart),
      originalSourceEnd: roundTo6(originalSourceEnd),
      visibleStart: roundTo6(targetVisibleStart),
      visibleEnd: roundTo6(targetVisibleEnd)
    });
  }

  // Resize a removal range
  public resizeRemovedRange(originalSourceStart: number, originalSourceEnd: number, targetVisibleStart: number, targetVisibleEnd: number) {
    this.checkDisposed();
    this.validateSelectionRange(targetVisibleStart, targetVisibleEnd);

    const restoredSeq = restoreSourceRange(JSON.parse(JSON.stringify(this.committedSequence)), originalSourceStart, originalSourceEnd, this.sourceDuration);
    const finalSeq = removeVisibleRange(restoredSeq, targetVisibleStart, targetVisibleEnd, this.sourceDuration);

    this.commitSequence(finalSeq, "ResizeRemovedRange", {
      originalSourceStart: roundTo6(originalSourceStart),
      originalSourceEnd: roundTo6(originalSourceEnd),
      visibleStart: roundTo6(targetVisibleStart),
      visibleEnd: roundTo6(targetVisibleEnd)
    });
  }

  // Set start trim
  public setStartTrim(visibleTime: number) {
    this.checkDisposed();
    if (visibleTime <= 0) return;
    this.validateSelectionRange(0, visibleTime);

    const sequence = JSON.parse(JSON.stringify(this.committedSequence));
    const startSource = visibleTimeToSourceTime(sequence, 0).sourceTime;
    const endSource = visibleTimeToSourceTime(sequence, visibleTime).sourceTime;

    const nextSeq = removeVisibleRange(sequence, 0, visibleTime, this.sourceDuration);

    this.commitSequence(nextSeq, "SetStartTrim", {
      visibleStart: 0,
      visibleEnd: roundTo6(visibleTime),
      sourceStart: roundTo6(startSource),
      sourceEnd: roundTo6(endSource)
    });
  }

  // Set end trim
  public setEndTrim(visibleTime: number) {
    this.checkDisposed();
    const dur = this.getVisibleDuration();
    if (visibleTime >= dur) return;
    this.validateSelectionRange(visibleTime, dur);

    const sequence = JSON.parse(JSON.stringify(this.committedSequence));
    const startSource = visibleTimeToSourceTime(sequence, visibleTime).sourceTime;
    const endSource = visibleTimeToSourceTime(sequence, dur).sourceTime;

    const nextSeq = removeVisibleRange(sequence, visibleTime, dur, this.sourceDuration);

    this.commitSequence(nextSeq, "SetEndTrim", {
      visibleStart: roundTo6(visibleTime),
      visibleEnd: roundTo6(dur),
      sourceStart: roundTo6(startSource),
      sourceEnd: roundTo6(endSource)
    });
  }

  // Undo / Redo
  public canUndo(): boolean {
    this.checkDisposed();
    return !this.hasConflict && this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    this.checkDisposed();
    return !this.hasConflict && this.redoStack.length > 0;
  }

  public undo() {
    this.checkDisposed();
    if (this.hasConflict) throw new TimelineConflictError("Cannot undo during conflict");
    if (this.undoStack.length === 0) return;

    const undoItem = this.undoStack.pop()!;
    const beforeSequence = JSON.parse(JSON.stringify(this.committedSequence));

    const commandId = generateSecureId();
    const undoCommand: TimelineCommand = {
      id: commandId,
      projectId: this.projectId,
      sourceAssetId: this.sourceAssetId,
      type: "UndoTimelineEdit",
      beforeSequence,
      afterSequence: JSON.parse(JSON.stringify(undoItem.sequence)),
      revisionBefore: this.projectRevision,
      revisionAfter: this.projectRevision + 1,
      createdAt: new Date().toISOString(),
      payload: {
        undoneCommandId: undoItem.command.id
      }
    };

    // Push current to redo stack
    this.redoStack.push({
      sequence: beforeSequence,
      command: undoItem.command
    });

    this.committedSequence = JSON.parse(JSON.stringify(undoItem.sequence));
    this.projectRevision++;

    this.emitState();

    if (this.playbackCoordinator) {
      this.playbackCoordinator.refreshSequence();
    }

    if (this.autosaveController) {
      const dbCommand: EditorCommand = {
        id: undoCommand.id,
        type: undoCommand.type,
        payload: {
          projectId: undoCommand.projectId,
          sourceAssetId: undoCommand.sourceAssetId,
          revisionBefore: undoCommand.revisionBefore,
          revisionAfter: undoCommand.revisionAfter,
          createdAt: undoCommand.createdAt,
          ...undoCommand.payload
        },
        inversePayload: {
          beforeSequence: undoCommand.beforeSequence
        }
      };
      this.autosaveController.updateState(this.committedSequence, dbCommand);
    }
  }

  public redo() {
    this.checkDisposed();
    if (this.hasConflict) throw new TimelineConflictError("Cannot redo during conflict");
    if (this.redoStack.length === 0) return;

    const redoItem = this.redoStack.pop()!;
    const beforeSequence = JSON.parse(JSON.stringify(this.committedSequence));

    // Reapply original edit (re-evaluate original command behavior or apply target sequence directly)
    const nextSeq = redoItem.command.afterSequence;
    const commandId = generateSecureId();
    const redoCommand: TimelineCommand = {
      id: commandId,
      projectId: this.projectId,
      sourceAssetId: this.sourceAssetId,
      type: "RedoTimelineEdit",
      beforeSequence,
      afterSequence: JSON.parse(JSON.stringify(nextSeq)),
      revisionBefore: this.projectRevision,
      revisionAfter: this.projectRevision + 1,
      createdAt: new Date().toISOString(),
      payload: {
        redoneCommandId: redoItem.command.id
      }
    };

    this.undoStack.push({
      sequence: beforeSequence,
      command: redoItem.command
    });

    this.committedSequence = JSON.parse(JSON.stringify(nextSeq));
    this.projectRevision++;

    this.emitState();

    if (this.playbackCoordinator) {
      this.playbackCoordinator.refreshSequence();
    }

    if (this.autosaveController) {
      const dbCommand: EditorCommand = {
        id: redoCommand.id,
        type: redoCommand.type,
        payload: {
          projectId: redoCommand.projectId,
          sourceAssetId: redoCommand.sourceAssetId,
          revisionBefore: redoCommand.revisionBefore,
          revisionAfter: redoCommand.revisionAfter,
          createdAt: redoCommand.createdAt,
          ...redoCommand.payload
        },
        inversePayload: {
          beforeSequence: redoCommand.beforeSequence
        }
      };
      this.autosaveController.updateState(this.committedSequence, dbCommand);
    }
  }

  // Snapping Calculator
  public calculateSnap(visibleTime: number, guideStepVisibleTimes?: number[], excludeTime?: number): { snappedTime: number; targetType: string | null } {
    this.checkDisposed();
    const dur = this.getVisibleDuration();
    const sequence = this.previewSequence || this.committedSequence;

    let closestTime = visibleTime;
    let closestDist = SNAP_TOLERANCE;
    let targetType: string | null = null;

    const checkTarget = (targetVal: number, type: string) => {
      if (excludeTime !== undefined && Math.abs(targetVal - excludeTime) < 1e-4) {
        return;
      }
      const dist = Math.abs(targetVal - visibleTime);
      if (dist < closestDist) {
        closestDist = dist;
        closestTime = targetVal;
        targetType = type;
      }
    };

    // 1. Snapping to timeline start and end
    checkTarget(0, "boundary");
    checkTarget(dur, "boundary");

    // 2. Snapping to whole second boundaries
    const wholeSecond = Math.round(visibleTime);
    checkTarget(wholeSecond, "second");

    // 3. Snapping to existing removal boundaries (sequence gaps)
    let cur = 0;
    for (const clip of sequence.clips) {
      const len = clip.sourceEnd - clip.sourceStart;
      checkTarget(cur, "cut");
      checkTarget(cur + len, "cut");
      cur += len;
    }

    // 4. Snapping to guide step markers
    if (guideStepVisibleTimes) {
      for (const gst of guideStepVisibleTimes) {
        checkTarget(gst, "step");
      }
    }

    return {
      snappedTime: closestTime,
      targetType
    };
  }

  // Helper validation
  private validateSelectionRange(start: number, end: number) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new TimelineSelectionInvalidError("Selection coordinates must be finite numbers");
    }
    if (start >= end) {
      throw new TimelineSelectionInvalidError("Start coordinate must be less than end coordinate");
    }
    const dur = this.getVisibleDuration();
    if (start < 0 || end > dur) {
      throw new TimelineSelectionInvalidError("Selection boundaries exceed visible duration");
    }
    if (end - start < MIN_REMOVAL_DURATION) {
      throw new TimelineSelectionInvalidError(`Removal duration must be at least ${MIN_REMOVAL_DURATION} seconds`);
    }
  }

  // Emit state changes to subscriber
  private emitState() {
    if (this.onStateChange) {
      const persistent: TimelinePersistentState = {
        sequence: this.committedSequence,
        projectRevision: this.projectRevision
      };
      const transient: TimelineTransientState = {
        selection: this.selection,
        previewSequence: this.previewSequence,
        dragMode: this.dragMode,
        focusedHandle: this.focusedHandle,
        hoveredJoinId: this.hoveredJoinId
      };
      this.onStateChange(persistent, transient);
    }
  }

  // Conflict state management
  public handleRevisionConflict() {
    this.checkDisposed();
    this.hasConflict = true;
    if (this.onConflict) {
      this.onConflict();
    }
  }

  public dispose() {
    this.isDisposed = true;
    this.autosaveController = undefined;
    this.playbackCoordinator = undefined;
    this.onStateChange = undefined;
    this.onConflict = undefined;
  }
}
