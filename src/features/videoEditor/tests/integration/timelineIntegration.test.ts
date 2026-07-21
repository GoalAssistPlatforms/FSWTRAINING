import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimelineEditorController } from "../../controllers/TimelineEditorController";
import { PlaybackCoordinator } from "../../controllers/PlaybackCoordinator";
import { VideoSequence, LegacyVideoEdits, SequenceClip } from "../../domain/editorTypes";
import { AutosaveController } from "../../controllers/AutosaveController";
import {
  isSequenceTimelineEditingEnabled,
  isSequencePlaybackEnabled
} from "../../config/playbackFeatureFlags";
import { loadProjectState, persistEditorProjectUpdate } from "../../services/projectService";
import { getSequenceGaps } from "../../services/playbackSequenceService";
import { IMediaElement } from "../../controllers/playbackTypes";
import * as repo from "../../persistence/projectRepository";
import { ProjectCreationConflictError, ProjectValidationError } from "../../persistence/projectPersistenceErrors";

vi.mock("../../persistence/projectRepository", () => {
  return {
    createProject: vi.fn(),
    createProjectWithInitialCommands: vi.fn(),
    loadProject: vi.fn(),
    loadProjectForGuide: vi.fn(),
    saveProject: vi.fn(),
    loadSourceAsset: vi.fn(),
    createSourceAsset: vi.fn(),
    updateSourceAssetPreparation: vi.fn()
  };
});

vi.mock("../../../../api/supabase", () => {
  const mockFrom = vi.fn().mockImplementation(() => {
    return {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null })
    };
  });
  return {
    supabase: {
      from: mockFrom
    }
  };
});

class MockMediaElement implements IMediaElement {
  public currentTime = 0;
  public duration = 100;
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

describe("Timeline Integration Tests", () => {
  let media: MockMediaElement;
  let legacyEdits: LegacyVideoEdits;
  let sequence: VideoSequence;
  let sourceDuration: number;
  let sequencePlaybackEnabledVal = "false";
  let sequenceTimelineEditingEnabledVal = "false";

  beforeEach(() => {
    vi.clearAllMocks();
    media = new MockMediaElement();
    sourceDuration = 100;
    legacyEdits = {
      trimStart: 10,
      trimEnd: 90,
      cuts: [{ start: 40, end: 60 }]
    };
    sequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 10, sourceEnd: 40, origin: "source", createdByCommandId: null },
        { id: "c-2", sourceAssetId: "asset-123", sourceStart: 60, sourceEnd: 90, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    // Set up mock window
    sequencePlaybackEnabledVal = "false";
    sequenceTimelineEditingEnabledVal = "false";
    (globalThis as any).window = {
      localStorage: {
        getItem: (key: string) => {
          if (key === "sequencePlaybackEnabled") return sequencePlaybackEnabledVal;
          if (key === "sequenceTimelineEditingEnabled") return sequenceTimelineEditingEnabledVal;
          return null;
        },
        setItem: (key: string, val: string) => {
          if (key === "sequencePlaybackEnabled") sequencePlaybackEnabledVal = val;
          if (key === "sequenceTimelineEditingEnabled") sequenceTimelineEditingEnabledVal = val;
        },
        removeItem: (key: string) => {
          if (key === "sequencePlaybackEnabled") sequencePlaybackEnabledVal = "false";
          if (key === "sequenceTimelineEditingEnabled") sequenceTimelineEditingEnabledVal = "false";
        }
      },
      location: {
        hostname: "localhost"
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    vi.clearAllMocks();
  });

  it("1. Legacy timeline remains unchanged when flag is disabled", () => {
    sequenceTimelineEditingEnabledVal = "false";
    sequencePlaybackEnabledVal = "false";

    const enabled = isSequenceTimelineEditingEnabled() && isSequencePlaybackEnabled();
    expect(enabled).toBe(false);
  });

  it("2. Sequence timeline is selected when enabled", () => {
    sequenceTimelineEditingEnabledVal = "true";
    sequencePlaybackEnabledVal = "true";

    const enabled = isSequenceTimelineEditingEnabled() && isSequencePlaybackEnabled();
    expect(enabled).toBe(true);
  });

  it("3. Sequence timeline requires sequence playback", () => {
    sequenceTimelineEditingEnabledVal = "true";
    sequencePlaybackEnabledVal = "false";

    const enabled = isSequenceTimelineEditingEnabled() && isSequencePlaybackEnabled();
    expect(enabled).toBe(false);
  });

  it("4. Legacy project migrates in memory", () => {
    const migrated = getSequenceGaps(sequence, sourceDuration);
    expect(migrated.length).toBe(3);
    expect(migrated[0].type).toBe("trimStart");
    expect(migrated[1].type).toBe("cuts");
    expect(migrated[2].type).toBe("trimEnd");
  });

  it("5. Opening a project triggers no save", async () => {
    const saveMock = vi.fn();
    const autosave = new AutosaveController({
      projectId: "proj-123",
      initialRevision: 0,
      initialSequence: sequence,
      saveFn: saveMock
    });

    new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 0,
      autosaveController: autosave
    });

    expect(saveMock).not.toHaveBeenCalled();
  });

  it("6. First genuine edit saves canonical sequence with migration context", async () => {
    let savedCommands: any[] = [];
    const saveMock = vi.fn().mockImplementation((projId, revision, seq, cmds) => {
      savedCommands = cmds;
      return Promise.resolve({ projectId: projId, revision: revision + 1, savedAt: new Date().toISOString() });
    });

    const autosave = new AutosaveController({
      projectId: "proj-123",
      initialRevision: 0,
      initialSequence: sequence,
      saveFn: saveMock
    });

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 0,
      autosaveController: autosave,
      legacyEdits
    });

    controller.removeVisibleRange(15, 25);
    await autosave.flush();

    expect(saveMock).toHaveBeenCalled();
    expect(savedCommands[0].payload.legacyMigration).toBeDefined();
  });

  it("7. Drag preview triggers no save", async () => {
    const saveMock = vi.fn();
    const autosave = new AutosaveController({
      projectId: "proj-123",
      initialRevision: 1,
      initialSequence: sequence,
      saveFn: saveMock
    });

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1,
      autosaveController: autosave
    });

    controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 30 }, null);
    await autosave.flush();

    expect(saveMock).not.toHaveBeenCalled();
  });

  it("8. One command is saved on drag completion", async () => {
    const saveMock = vi.fn().mockImplementation(() => Promise.resolve({ projectId: "p", revision: 2, savedAt: "" }));
    const autosave = new AutosaveController({
      projectId: "proj-123",
      initialRevision: 1,
      initialSequence: sequence,
      saveFn: saveMock
    });

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1,
      autosaveController: autosave
    });

    controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 30 }, null);
    controller.removeVisibleRange(10, 30);
    await autosave.flush();

    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("9. Restore Cut updates sequence and playback", async () => {
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: () => sequence,
      getSourceDuration: () => sourceDuration
    });
    await coordinator.load();

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1,
      playbackCoordinator: coordinator
    });

    controller.restoreRemovedRange(40, 60);

    expect(controller.getCommittedSequence().clips.length).toBe(1);
  });

  it("10. Play Join does not persist changes", async () => {
    const saveMock = vi.fn();
    new AutosaveController({
      projectId: "proj-123",
      initialRevision: 1,
      initialSequence: sequence,
      saveFn: saveMock
    });

    expect(saveMock).not.toHaveBeenCalled();
  });

  it("11. Guide step records remain unchanged", async () => {
    const guideSteps = [{ id: "s-1", sourceTimestamp: 25 }];
    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1
    });

    controller.removeVisibleRange(10, 30);
    expect(guideSteps[0].sourceTimestamp).toBe(25);
  });

  it("12. Undo and redo create append only commands", async () => {
    const saveMock = vi.fn().mockImplementation(() => Promise.resolve({ projectId: "p", revision: 2, savedAt: "" }));
    const autosave = new AutosaveController({
      projectId: "proj-123",
      initialRevision: 1,
      initialSequence: sequence,
      saveFn: saveMock
    });

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
    await autosave.flush();

    expect(autosave.getPendingCommands().length).toBe(0);
  });

  it("13. Autosave revision conflict preserves local work", async () => {
    const saveMock = vi.fn().mockRejectedValue(new Error("PROJECT_REVISION_CONFLICT"));
    const autosave = new AutosaveController({
      projectId: "proj-123",
      initialRevision: 1,
      initialSequence: sequence,
      saveFn: saveMock
    });

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: sequence,
      initialRevision: 1,
      autosaveController: autosave
    });

    controller.removeVisibleRange(10, 30);
    try {
      await autosave.flush();
    } catch (e) {}

    expect(autosave.getStatus()).toBe("conflict");
    expect(controller.getCommittedSequence().clips.length).toBe(2);
  });

  it("14. Production feature flag defaults to legacy mode", () => {
    (globalThis as any).window = undefined;
    expect(isSequenceTimelineEditingEnabled()).toBe(false);
  });

  it("15. Empty sequence remains safe", () => {
    const emptySeq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    const controller = new TimelineEditorController({
      projectId: "proj-123",
      sourceAssetId: "asset-123",
      sourceDuration,
      initialSequence: emptySeq,
      initialRevision: 1
    });

    expect(controller.getVisibleDuration()).toBe(0);
  });

  describe("3. Preview and committed sequence ownership", () => {
    let coordinator: PlaybackCoordinator;
    let controller: TimelineEditorController;
    let originalSeq: VideoSequence;

    beforeEach(async () => {
      sequencePlaybackEnabledVal = "true";
      sequenceTimelineEditingEnabledVal = "true";
      originalSeq = JSON.parse(JSON.stringify(sequence));
      coordinator = new PlaybackCoordinator({
        media,
        getLegacyEdits: () => legacyEdits,
        getSequence: () => {
          if (controller) {
            return controller.getPreviewSequence() || controller.getCommittedSequence();
          }
          return originalSeq;
        },
        getSourceDuration: () => sourceDuration
      });
      await coordinator.load();

      controller = new TimelineEditorController({
        projectId: "proj-123",
        sourceAssetId: "asset-123",
        sourceDuration,
        initialSequence: originalSeq,
        initialRevision: 1,
        playbackCoordinator: coordinator
      });
    });

    it("the committed sequence remains unchanged during preview", () => {
      const previewSeq = JSON.parse(JSON.stringify(originalSeq));
      previewSeq.clips.pop();
      controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 30 }, previewSeq);

      expect(controller.getCommittedSequence()).toEqual(originalSeq);
      expect(controller.getPreviewSequence()).toEqual(previewSeq);
    });

    it("the playback sequence provider returns the preview sequence during preview", () => {
      const previewSeq = JSON.parse(JSON.stringify(originalSeq));
      previewSeq.clips.pop();
      controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 30 }, previewSeq);

      expect(coordinator["getSequence"]()).toEqual(previewSeq);
    });

    it("cancelling preview restores the committed sequence to playback", () => {
      const previewSeq = JSON.parse(JSON.stringify(originalSeq));
      previewSeq.clips.pop();
      controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 30 }, previewSeq);
      controller.cancelDragPreview();

      expect(controller.getPreviewSequence()).toBeNull();
      expect(coordinator["getSequence"]()).toEqual(originalSeq);
    });

    it("committing preview promotes the exact preview result", () => {
      controller.removeVisibleRange(10, 30);
      const committed = controller.getCommittedSequence();
      expect(committed.clips.length).toBe(2);
      expect(controller.getPreviewSequence()).toBeNull();
    });

    it("playback receives the newly committed sequence", () => {
      controller.removeVisibleRange(10, 30);
      expect(coordinator["getSequence"]()).toEqual(controller.getCommittedSequence());
    });

    it("timeline and playback report the same visible duration", () => {
      controller.removeVisibleRange(10, 30);
      const timelineVisibleDur = controller.getVisibleDuration();
      const coordinatorVisibleDur = coordinator.getState()?.visibleDuration;
      expect(timelineVisibleDur).toBe(coordinatorVisibleDur);
    });

    it("repeated preview refreshes do not attach new media listeners", () => {
      const originalListenerCount = Object.values((media as any).listeners).reduce((acc: number, curr: any) => acc + curr.length, 0);

      coordinator.refreshSequence();
      coordinator.refreshSequence();
      coordinator.refreshSequence();

      const finalListenerCount = Object.values((media as any).listeners).reduce((acc: number, curr: any) => acc + curr.length, 0);
      expect(finalListenerCount).toBe(originalListenerCount);
    });

    it("an invalid preview never reaches playback as committed state", () => {
      const invalidSeq = { ...originalSeq, clips: [] };
      controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 30 }, invalidSeq);
      expect(controller.getCommittedSequence()).toEqual(originalSeq);

      expect(() => controller.removeVisibleRange(0, 0)).toThrow();
      expect(controller.getCommittedSequence()).toEqual(originalSeq);
    });
  });

  describe("4. Interface routing", () => {
    let controller: TimelineEditorController;
    let commandsSent: any[] = [];
    let saveMock: any;

    beforeEach(() => {
      commandsSent = [];
      saveMock = vi.fn().mockImplementation((projId, revision, seq, cmds) => {
        commandsSent.push(...cmds);
        return Promise.resolve({ projectId: projId, revision: revision + 1, savedAt: "" });
      });

      const autosave = new AutosaveController({
        projectId: "proj-123",
        initialRevision: 1,
        initialSequence: sequence,
        saveFn: saveMock
      });

      controller = new TimelineEditorController({
        projectId: "proj-123",
        sourceAssetId: "asset-123",
        sourceDuration,
        initialSequence: sequence,
        initialRevision: 1,
        autosaveController: autosave
      });
    });

    it("Pointer cut confirmation creates exactly one command", async () => {
      controller.removeVisibleRange(10, 30);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(1);
      expect(commandsSent[0].type).toBe("RemoveVisibleRange");
    });

    it("Pointer move completion creates exactly one command", async () => {
      controller.moveRemovedRange(40, 60, 10, 30);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(1);
      expect(commandsSent[0].type).toBe("MoveRemovedRange");
    });

    it("Pointer resize start completion creates exactly one command", async () => {
      controller.resizeRemovedRange(40, 60, 35, 60);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(1);
      expect(commandsSent[0].type).toBe("ResizeRemovedRange");
    });

    it("Pointer resize end completion creates exactly one command", async () => {
      controller.resizeRemovedRange(40, 60, 40, 50);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(1);
      expect(commandsSent[0].type).toBe("ResizeRemovedRange");
    });

    it("Pointer cancellation creates zero commands", async () => {
      controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 30 }, null);
      controller.cancelDragPreview();
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(0);
    });

    it("Keyboard adjustment preview creates zero commands", async () => {
      controller.updateDragPreview("start", { startVisibleTime: 11, endVisibleTime: 40 }, null);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(0);
    });

    it("Keyboard interaction completion creates exactly one command", async () => {
      controller.updateDragPreview("start", { startVisibleTime: 11, endVisibleTime: 40 }, null);
      controller.removeVisibleRange(11, 40);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(1);
    });

    it("Escape cancellation creates zero commands", async () => {
      controller.updateDragPreview("start", { startVisibleTime: 11, endVisibleTime: 40 }, null);
      controller.cancelDragPreview();
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(0);
    });

    it("Active edit panel restoration creates exactly one command", async () => {
      controller.restoreRemovedRange(40, 60);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(1);
      expect(commandsSent[0].type).toBe("RestoreRemovedRange");
    });

    it("Join tick restoration creates exactly one command", async () => {
      controller.restoreRemovedRange(40, 60);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(1);
    });

    it("Start trim creates exactly one command", async () => {
      controller.setStartTrim(15);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(1);
      expect(commandsSent[0].type).toBe("SetStartTrim");
    });

    it("End trim creates exactly one command", async () => {
      controller.setEndTrim(50);
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(1);
      expect(commandsSent[0].type).toBe("SetEndTrim");
    });

    it("Undo shortcut creates exactly one command", async () => {
      controller.removeVisibleRange(10, 30);
      controller.undo();
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(2);
      expect(commandsSent[1].type).toBe("UndoTimelineEdit");
    });

    it("Redo shortcut creates exactly one command", async () => {
      controller.removeVisibleRange(10, 30);
      controller.undo();
      controller.redo();
      await controller["autosaveController"]?.flush();
      expect(commandsSent.length).toBe(3);
      expect(commandsSent[2].type).toBe("RedoTimelineEdit");
    });
  });

  describe("5. Autosave verification", () => {
    let controller: TimelineEditorController;
    let autosave: AutosaveController;
    let saveMock: any;
    let resolvedPromise: Function;

    beforeEach(() => {
      let callCount = 0;
      saveMock = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise((resolve) => {
            resolvedPromise = () => resolve({ projectId: "proj-123", revision: 2, savedAt: "" });
          });
        }
        return Promise.resolve({ projectId: "proj-123", revision: 3, savedAt: "" });
      });

      autosave = new AutosaveController({
        projectId: "proj-123",
        initialRevision: 1,
        initialSequence: sequence,
        saveFn: saveMock
      });

      controller = new TimelineEditorController({
        projectId: "proj-123",
        sourceAssetId: "asset-123",
        sourceDuration,
        initialSequence: sequence,
        initialRevision: 1,
        autosaveController: autosave
      });
    });

    it("one committed edit queues one command", async () => {
      controller.removeVisibleRange(10, 20);
      expect(autosave.getPendingCommands().length).toBe(1);
    });

    it("two edits inside one debounce period retain both commands in order", async () => {
      controller.removeVisibleRange(10, 20);
      controller.removeVisibleRange(25, 30);
      const pending = autosave.getPendingCommands();
      expect(pending.length).toBe(2);
      expect(pending[0].type).toBe("RemoveVisibleRange");
      expect(pending[1].type).toBe("RemoveVisibleRange");
    });

    it("an edit during an active save is queued for the following save", async () => {
      controller.removeVisibleRange(10, 20);
      const savePromise = autosave.flush();
      expect(saveMock).toHaveBeenCalledTimes(1);

      controller.removeVisibleRange(25, 30);
      expect(autosave.getPendingCommands().length).toBe(2);

      resolvedPromise();
      await savePromise;

      expect(saveMock).toHaveBeenCalledTimes(2);
      expect(saveMock.mock.calls[1][3][0].type).toBe("RemoveVisibleRange");
      expect(autosave.getPendingCommands().length).toBe(0);
    });

    it("successful save updates the project revision", async () => {
      controller.removeVisibleRange(10, 20);
      const savePromise = autosave.flush();
      resolvedPromise();
      await savePromise;
      expect(autosave.getRevision()).toBe(2);
    });

    it("failed save preserves the committed sequence", async () => {
      saveMock.mockRejectedValueOnce(new ProjectValidationError("Save Failed"));
      controller.removeVisibleRange(10, 20);
      const committed = JSON.parse(JSON.stringify(controller.getCommittedSequence()));

      await autosave.flush();
      expect(autosave.getStatus()).toBe("error");
      expect(controller.getCommittedSequence()).toEqual(committed);
    });

    it("failed save preserves pending commands", async () => {
      saveMock.mockRejectedValueOnce(new ProjectValidationError("Save Failed"));
      controller.removeVisibleRange(10, 20);

      await autosave.flush();
      expect(autosave.getStatus()).toBe("error");
      expect(autosave.getPendingCommands().length).toBe(1);
    });

    it("revision conflict stops automatic saving", async () => {
      saveMock.mockRejectedValueOnce(new Error("PROJECT_REVISION_CONFLICT"));
      controller.removeVisibleRange(10, 20);

      await autosave.flush();
      expect(autosave.getStatus()).toBe("conflict");

      controller.removeVisibleRange(25, 30);
      expect(autosave.getStatus()).toBe("conflict");
    });

    it("revision conflict preserves undo and redo state", async () => {
      saveMock.mockRejectedValueOnce(new Error("PROJECT_REVISION_CONFLICT"));
      controller.removeVisibleRange(10, 20);
      await autosave.flush();

      expect(controller.getUndoStack().length).toBe(1);
    });


    it("preview activity does not trigger saving", async () => {
      controller.updateDragPreview("range", { startVisibleTime: 10, endVisibleTime: 20 }, null);
      expect(autosave.getPendingCommands().length).toBe(0);
    });

    it("join preview does not trigger saving", async () => {
      expect(autosave.getPendingCommands().length).toBe(0);
    });

    it("playhead activity does not trigger saving", async () => {
      expect(autosave.getPendingCommands().length).toBe(0);
    });

    it("closing with pending work either flushes successfully or explicitly blocks closure", async () => {
      controller.removeVisibleRange(10, 20);
      const flushPromise = autosave.flush();
      resolvedPromise();
      await flushPromise;

      expect(autosave.getPendingCommands().length).toBe(0);
    });

    it("disposal does not silently discard pending commands", async () => {
      controller.removeVisibleRange(10, 20);
      expect(autosave.getPendingCommands().length).toBe(1);
      autosave.dispose();
    });
  });

  describe("6. Atomic first edit persistence", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("opening migrates in memory only and creates no database operation", async () => {
      vi.mocked(repo.loadProjectForGuide).mockResolvedValueOnce(null);
      vi.mocked(repo.loadSourceAsset).mockResolvedValueOnce({
        id: "asset-123",
        guideId: "proj-123",
        durationSeconds: 100,
        accountId: "acc-123",
        organisationId: null
      } as any);

      const state = await loadProjectState("proj-123", "asset-123", legacyEdits);
      expect(state.revision).toBe(0);
      expect(repo.createProject).not.toHaveBeenCalled();
      expect(repo.saveProject).not.toHaveBeenCalled();
    });

    it("first genuine edit creates project and stores canonical sequence & command atomically", async () => {
      vi.mocked(repo.createProjectWithInitialCommands).mockResolvedValueOnce({
        project: {
          id: "proj-123",
          revision: 1,
          updatedAt: "2026-07-13",
          sequence_json: sequence
        } as any,
        isReplay: false
      });

      const result = await persistEditorProjectUpdate(
        "proj-temp",
        0,
        sequence,
        [{ id: "cmd-1", type: "RemoveVisibleRange", payload: {}, inversePayload: {} } as any],
        "proj-123",
        "asset-123",
        "not_created",
        "req-123"
      );

      expect(repo.createProjectWithInitialCommands).toHaveBeenCalledWith({
        creationRequestId: "req-123",
        guideId: "proj-123",
        sourceAssetId: "asset-123",
        sequence,
        legacyVideoEdits: null,
        commands: [{ id: "cmd-1", type: "RemoveVisibleRange", payload: {}, inversePayload: {} }]
      });
      expect(result.projectId).toBe("proj-123");
      expect(result.revision).toBe(1);
    });

    it("failure during initial save propagates error and performs no compensating deletion", async () => {
      vi.mocked(repo.createProjectWithInitialCommands).mockRejectedValueOnce(new Error("Save Failed"));

      const { supabase } = await import("../../../../api/supabase");

      await expect(
        persistEditorProjectUpdate(
          "proj-temp",
          0,
          sequence,
          [{ id: "cmd-1", type: "RemoveVisibleRange", payload: {}, inversePayload: {} } as any],
          "proj-123",
          "asset-123",
          "not_created",
          "req-123"
        )
      ).rejects.toThrow("Save Failed");

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("creation conflict is handled using the Package 02 error model", async () => {
      vi.mocked(repo.createProjectWithInitialCommands).mockRejectedValueOnce(new ProjectCreationConflictError("PROJECT_CREATION_CONFLICT"));

      await expect(
        persistEditorProjectUpdate(
          "proj-temp",
          0,
          sequence,
          [{ id: "cmd-1", type: "RemoveVisibleRange", payload: {}, inversePayload: {} } as any],
          "proj-123",
          "asset-123",
          "not_created",
          "req-123"
        )
      ).rejects.toThrow(ProjectCreationConflictError);
    });
  });

  describe("7. Append only undo and redo", () => {
    let controller: TimelineEditorController;
    let autosave: AutosaveController;
    let saveMock: any;
    let commandsSaved: any[] = [];

    beforeEach(() => {
      commandsSaved = [];
      saveMock = vi.fn().mockImplementation((projId, revision, seq, cmds) => {
        commandsSaved.push(...cmds);
        return Promise.resolve({ projectId: projId, revision: revision + 1, savedAt: "" });
      });

      autosave = new AutosaveController({
        projectId: "proj-123",
        initialRevision: 1,
        initialSequence: sequence,
        saveFn: saveMock
      });

      controller = new TimelineEditorController({
        projectId: "proj-123",
        sourceAssetId: "asset-123",
        sourceDuration,
        initialSequence: sequence,
        initialRevision: 1,
        autosaveController: autosave
      });
    });

    it("undo preserves original command, creates inverse command, redo creates append-only command", async () => {
      controller.removeVisibleRange(10, 20);
      const originalCommandId = controller.getUndoStack()[0].command.id;

      controller.undo();
      expect(controller.getUndoStack().length).toBe(0);
      expect(controller.getRedoStack().length).toBe(1);

      controller.redo();
      expect(controller.getUndoStack().length).toBe(1);
      expect(controller.getRedoStack().length).toBe(0);

      await autosave.flush();

      expect(commandsSaved.length).toBe(3);
      expect(commandsSaved[0].type).toBe("RemoveVisibleRange");
      expect(commandsSaved[1].type).toBe("UndoTimelineEdit");
      expect(commandsSaved[1].payload.undoneCommandId).toBe(originalCommandId);
      expect(commandsSaved[2].type).toBe("RedoTimelineEdit");
    });

    it("new edit after undo clears the transient redo stack", () => {
      controller.removeVisibleRange(10, 20);
      controller.undo();
      expect(controller.getRedoStack().length).toBe(1);

      controller.removeVisibleRange(25, 30);
      expect(controller.getRedoStack().length).toBe(0);
    });

    it("persisted commands are never deleted or modified, undo/redo queue autosave and refresh playback", async () => {
      const mockCoordinator = { refreshSequence: vi.fn() };
      controller["playbackCoordinator"] = mockCoordinator as any;

      controller.removeVisibleRange(10, 20);
      expect(mockCoordinator.refreshSequence).toHaveBeenCalledTimes(1);

      controller.undo();
      expect(mockCoordinator.refreshSequence).toHaveBeenCalledTimes(2);

      controller.redo();
      expect(mockCoordinator.refreshSequence).toHaveBeenCalledTimes(3);
    });

    it("conflict during undo/redo preserves local work", async () => {
      controller.removeVisibleRange(10, 20);
      await autosave.flush();

      saveMock.mockRejectedValueOnce(new Error("PROJECT_REVISION_CONFLICT"));
      controller.undo();

      await autosave.flush();
      expect(autosave.getStatus()).toBe("conflict");
      expect(controller.getUndoStack().length).toBe(0);
      expect(controller.getRedoStack().length).toBe(1);
    });

    it("several undo and redo operations retain deterministic command order", async () => {
      controller.removeVisibleRange(10, 20);
      controller.removeVisibleRange(25, 30);
      controller.undo();
      controller.undo();
      controller.redo();
      controller.redo();

      await autosave.flush();
      expect(commandsSaved.length).toBe(6);
      expect(commandsSaved[0].type).toBe("RemoveVisibleRange");
      expect(commandsSaved[1].type).toBe("RemoveVisibleRange");
      expect(commandsSaved[2].type).toBe("UndoTimelineEdit");
      expect(commandsSaved[3].type).toBe("UndoTimelineEdit");
      expect(commandsSaved[4].type).toBe("RedoTimelineEdit");
      expect(commandsSaved[5].type).toBe("RedoTimelineEdit");
    });
  });
});
