import { describe, it, expect, vi, beforeEach } from "vitest";
import { TimelineEditorController, MIN_REMOVAL_DURATION } from "../../controllers/TimelineEditorController";
import { VideoSequence, LegacyVideoEdits, SequenceClip } from "../../domain/editorTypes";
import { AutosaveController } from "../../controllers/AutosaveController";
import { PlaybackCoordinator } from "../../controllers/PlaybackCoordinator";
import {
  TimelineSelectionInvalidError,
  TimelineSequenceInvalidError,
  TimelineDisposedError,
  TimelineRestoreUnavailableError,
  TimelineConflictError
} from "../../controllers/timelineErrors";
import { IMediaElement } from "../../controllers/playbackTypes";

class MockMediaElement implements IMediaElement {
  public currentTime = 0;
  public duration = 120;
  public playbackRate = 1;
  public volume = 1;
  public muted = false;
  public paused = true;
  private listeners: Record<string, Function[]> = {};

  public addEventListener(type: string, listener: any) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  public removeEventListener(type: string, listener: any) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(l => l !== listener);
  }

  public play() { this.paused = false; }
  public pause() { this.paused = true; }
}

describe("TimelineEditorController Unit Tests", () => {
  let media: MockMediaElement;
  let sequence: VideoSequence;
  let sourceDuration: number;
  let autosave: AutosaveController;
  let coordinator: PlaybackCoordinator;

  beforeEach(() => {
    media = new MockMediaElement();
    sourceDuration = 100;
    sequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 0, sourceEnd: 100, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    autosave = new AutosaveController({
      projectId: "proj-123",
      initialRevision: 1,
      initialSequence: sequence,
      saveFn: async () => ({ projectId: "proj-123", revision: 2, savedAt: new Date().toISOString() })
    });

    coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => ({ trimStart: 0, trimEnd: null, cuts: [] }),
      getSequence: () => sequence,
      getSourceDuration: () => sourceDuration
    });
  });

  it("1. Valid removal inside one clip splits the clip correctly", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1,
      autosaveController: autosave
    });

    // Remove visible range 20 to 30 (which maps to source 20 to 30)
    controller.removeVisibleRange(20, 30);
    const result = controller.getCommittedSequence();

    expect(result.clips.length).toBe(2);
    expect(result.clips[0].sourceStart).toBe(0);
    expect(result.clips[0].sourceEnd).toBe(20);
    expect(result.clips[1].sourceStart).toBe(30);
    expect(result.clips[1].sourceEnd).toBe(100);
    expect(controller.getRevision()).toBe(2);
  });

  it("2. Range removal across several clips handles gaps correctly", () => {
    // Initial sequence: c1 (0 to 10), c2 (20 to 30). Total visible = 20
    const sequenceWithGap: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null },
        { id: "c-2", sourceAssetId: "asset-123", sourceStart: 20, sourceEnd: 30, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequenceWithGap,
      initialRevision: 1
    });

    // Remove visible range 5 to 15.
    // 5 maps to c-1 source 5.
    // 15 is 5s into c-2 (so c-2 source start is 20, plus 5s = 25).
    controller.removeVisibleRange(5, 15);
    const result = controller.getCommittedSequence();

    expect(result.clips.length).toBe(2);
    expect(result.clips[0].sourceStart).toBe(0);
    expect(result.clips[0].sourceEnd).toBe(5);
    expect(result.clips[1].sourceStart).toBe(25);
    expect(result.clips[1].sourceEnd).toBe(30);
  });

  it("3. Removal crossing existing gaps merges them into one removal", () => {
    const sequenceWithGap: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 0, sourceEnd: 40, origin: "source", createdByCommandId: null },
        { id: "c-2", sourceAssetId: "asset-123", sourceStart: 60, sourceEnd: 100, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequenceWithGap,
      initialRevision: 1
    });

    // Remove visible range 35 to 45 (maps across the 40-60 gap)
    controller.removeVisibleRange(35, 45);
    const result = controller.getCommittedSequence();

    expect(result.clips.length).toBe(2);
    expect(result.clips[0].sourceStart).toBe(0);
    expect(result.clips[0].sourceEnd).toBe(35);
    expect(result.clips[1].sourceStart).toBe(65);
    expect(result.clips[1].sourceEnd).toBe(100);
  });

  it("4. Removal at timeline start trims start", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    controller.setStartTrim(15);
    const result = controller.getCommittedSequence();

    expect(result.clips.length).toBe(1);
    expect(result.clips[0].sourceStart).toBe(15);
    expect(result.clips[0].sourceEnd).toBe(100);
  });

  it("5. Removal at timeline end trims end", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    controller.setEndTrim(85);
    const result = controller.getCommittedSequence();

    expect(result.clips.length).toBe(1);
    expect(result.clips[0].sourceStart).toBe(0);
    expect(result.clips[0].sourceEnd).toBe(85);
  });

  it("6. Rejects zero length selection", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    expect(() => controller.removeVisibleRange(10, 10)).toThrow(TimelineSelectionInvalidError);
  });

  it("7. Rejects non-finite selection values", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    expect(() => controller.removeVisibleRange(10, NaN)).toThrow(TimelineSelectionInvalidError);
  });

  it("8. Minimum duration enforcement protects cuts from being too short", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    expect(() => controller.removeVisibleRange(10, 10.01)).toThrow(TimelineSelectionInvalidError);
  });

  it("9. Exact boundary behaviour prefers snap rules", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    const res = controller.calculateSnap(24.9); // close to 25.0 (second snap)
    expect(res.snappedTime).toBe(25);
    expect(res.targetType).toBe("second");
  });

  it("10. Restore one gap restores source interval", () => {
    const sequenceWithGap: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 0, sourceEnd: 40, origin: "source", createdByCommandId: null },
        { id: "c-2", sourceAssetId: "asset-123", sourceStart: 60, sourceEnd: 100, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequenceWithGap,
      initialRevision: 1
    });

    controller.restoreRemovedRange(40, 60);
    const result = controller.getCommittedSequence();

    expect(result.clips.length).toBe(1);
    expect(result.clips[0].sourceStart).toBe(0);
    expect(result.clips[0].sourceEnd).toBe(100);
  });

  it("11. Restore adjacent gaps works correctly", () => {
    const sequenceWithGaps: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 0, sourceEnd: 30, origin: "source", createdByCommandId: null },
        { id: "c-2", sourceAssetId: "asset-123", sourceStart: 40, sourceEnd: 70, origin: "source", createdByCommandId: null },
        { id: "c-3", sourceAssetId: "asset-123", sourceStart: 80, sourceEnd: 100, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequenceWithGaps,
      initialRevision: 1
    });

    controller.restoreRemovedRange(30, 40);
    const result = controller.getCommittedSequence();

    expect(result.clips.length).toBe(2);
    expect(result.clips[0].sourceStart).toBe(0);
    expect(result.clips[0].sourceEnd).toBe(70);
  });

  it("12. Unavailable restore throws RestoreUnavailable error", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    expect(() => controller.restoreRemovedRange(40, 60)).toThrow(TimelineRestoreUnavailableError);
  });

  it("13. Move removal restores previous and cuts target correctly", () => {
    // Sequence with gap: 30 to 50
    const sequenceWithGap: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 0, sourceEnd: 30, origin: "source", createdByCommandId: null },
        { id: "c-2", sourceAssetId: "asset-123", sourceStart: 50, sourceEnd: 100, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequenceWithGap,
      initialRevision: 1
    });

    // Move the gap 30-50 to visible 10-30
    controller.moveRemovedRange(30, 50, 10, 30);
    const result = controller.getCommittedSequence();

    // The old gap is restored, and 10 to 30 in the restored sequence is removed.
    // 10 to 30 maps to source 10 to 30.
    expect(result.clips.length).toBe(2);
    expect(result.clips[0].sourceStart).toBe(0);
    expect(result.clips[0].sourceEnd).toBe(10);
    expect(result.clips[1].sourceStart).toBe(30);
    expect(result.clips[1].sourceEnd).toBe(100);
  });

  it("14. Resize removal start adjusts start edge", () => {
    // Gap 40 to 60
    const sequenceWithGap: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 0, sourceEnd: 40, origin: "source", createdByCommandId: null },
        { id: "c-2", sourceAssetId: "asset-123", sourceStart: 60, sourceEnd: 100, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequenceWithGap,
      initialRevision: 1
    });

    // Resize removal start: move edge to visible 30 (making gap wider: 30 to 60)
    controller.resizeRemovedRange(40, 60, 30, 60);
    const result = controller.getCommittedSequence();

    expect(result.clips.length).toBe(2);
    expect(result.clips[0].sourceStart).toBe(0);
    expect(result.clips[0].sourceEnd).toBe(30);
    expect(result.clips[1].sourceStart).toBe(60);
    expect(result.clips[1].sourceEnd).toBe(100);
  });

  it("15. Resize removal end adjusts end edge", () => {
    // Gap 40 to 60
    const sequenceWithGap: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 0, sourceEnd: 40, origin: "source", createdByCommandId: null },
        { id: "c-2", sourceAssetId: "asset-123", sourceStart: 60, sourceEnd: 100, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequenceWithGap,
      initialRevision: 1
    });

    // Resize removal end: move edge to visible 50 (making gap narrower: 40 to 50)
    controller.resizeRemovedRange(40, 60, 40, 50);
    const result = controller.getCommittedSequence();

    expect(result.clips.length).toBe(2);
    expect(result.clips[0].sourceStart).toBe(0);
    expect(result.clips[0].sourceEnd).toBe(40);
    expect(result.clips[1].sourceStart).toBe(50);
    expect(result.clips[1].sourceEnd).toBe(100);
  });

  it("16. Preview does not mutate committed state", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1,
      playbackCoordinator: coordinator
    });

    const preview: VideoSequence = {
      ...sequence,
      clips: [{ id: "c-p", sourceAssetId: "asset-123", sourceStart: 10, sourceEnd: 90, origin: "source", createdByCommandId: null }]
    };

    controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 90 }, preview);

    // Committed remains unchanged
    expect(controller.getCommittedSequence().clips.length).toBe(1);
    expect(controller.getCommittedSequence().clips[0].id).toBe("c-1");

    // Cancel drag preview restores committed
    controller.cancelDragPreview();
    expect(controller.getCommittedSequence().clips[0].id).toBe("c-1");
  });

  it("17. Cancelled drag creates no command", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 90 }, null);
    controller.cancelDragPreview();

    expect(controller.getUndoStack().length).toBe(0);
  });

  it("18. Completed pointer release creates one command", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    controller.removeVisibleRange(10, 30);
    expect(controller.getUndoStack().length).toBe(1);
    expect(controller.getUndoStack()[0].command.type).toBe("RemoveVisibleRange");
  });

  it("19. Undo restores previous sequence and pushes to redo", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1,
      autosaveController: autosave
    });

    controller.removeVisibleRange(10, 30);
    expect(controller.getCommittedSequence().clips.length).toBe(2);

    controller.undo();
    expect(controller.getCommittedSequence().clips.length).toBe(1);
    expect(controller.getRedoStack().length).toBe(1);
  });

  it("20. Redo reapplies the undone command", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1,
      autosaveController: autosave
    });

    controller.removeVisibleRange(10, 30);
    controller.undo();
    expect(controller.getCommittedSequence().clips.length).toBe(1);

    controller.redo();
    expect(controller.getCommittedSequence().clips.length).toBe(2);
  });

  it("21. New edit after undo clears redo stack", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1,
      autosaveController: autosave
    });

    controller.removeVisibleRange(10, 30);
    controller.undo();
    expect(controller.getRedoStack().length).toBe(1);

    controller.removeVisibleRange(40, 60);
    expect(controller.getRedoStack().length).toBe(0);
  });

  it("22. Rejects operations after disposal", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    controller.dispose();
    expect(() => controller.removeVisibleRange(10, 30)).toThrow(TimelineDisposedError);
  });

  it("23. One thousand clip sequence editing stress test", () => {
    const manyClips: SequenceClip[] = [];
    for (let i = 0; i < 1000; i++) {
      manyClips.push({
        id: `c-${i}`,
        sourceAssetId: "asset-123",
        sourceStart: i * 2,
        sourceEnd: i * 2 + 1,
        origin: "source",
        createdByCommandId: null
      });
    }

    const largeSequence: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: manyClips,
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration: 3000,
      initialSequence: largeSequence,
      initialRevision: 1
    });

    // Remove visible range 100 to 120
    controller.removeVisibleRange(100, 120);
    expect(controller.getCommittedSequence().clips.length).toBeLessThan(1000);
  });

  it("24. Input sequence is not mutated", () => {
    const originalSeqStr = JSON.stringify(sequence);

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    controller.removeVisibleRange(10, 30);
    expect(JSON.stringify(sequence)).toBe(originalSeqStr);
  });

  it("25. Multiple removals are committed as one undoable edit", () => {
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    controller.removeVisibleRanges([
      { visibleStart: 10, visibleEnd: 20 },
      { visibleStart: 40, visibleEnd: 50 }
    ]);

    expect(controller.getCommittedSequence().clips.map(
      clip => [clip.sourceStart, clip.sourceEnd]
    )).toEqual([
      [0, 10],
      [20, 40],
      [50, 100]
    ]);
    expect(controller.getUndoStack()).toHaveLength(1);
    expect(controller.getUndoStack()[0].command.type).toBe("RemoveVisibleRanges");

    controller.undo();
    expect(controller.getCommittedSequence().clips.map(
      clip => [clip.sourceStart, clip.sourceEnd]
    )).toEqual([[0, 100]]);

    controller.redo();
    expect(controller.getCommittedSequence().clips.map(
      clip => [clip.sourceStart, clip.sourceEnd]
    )).toEqual([
      [0, 10],
      [20, 40],
      [50, 100]
    ]);
  });
});
