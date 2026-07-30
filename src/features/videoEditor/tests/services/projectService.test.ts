import { vi, describe, it, expect, beforeEach } from "vitest";
import { LegacyVideoEdits, VideoSequence } from "../../domain/editorTypes";
import * as repo from "../../persistence/projectRepository";
import {
  createNewEditorProject,
  loadEditorProject,
  loadOrCreateEditorProject,
  saveEditorProject,
  createNewSourceAsset,
  updateSourceAssetPreparationMetadata,
  persistEditorProjectUpdate
} from "../../services/projectService";
import {
  ProjectValidationError,
  ProjectCreationConflictError
} from "../../persistence/projectPersistenceErrors";

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

describe("Project Service Tests", () => {
  const assetMock = {
    id: "asset_uuid",
    guideId: "guide_uuid",
    durationSeconds: 120.0,
    originalStoragePath: "/orig.mp4",
    fileSizeBytes: 1000
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createNewEditorProject", () => {
    it("successfully creates project and validates sequence", async () => {
      vi.mocked(repo.loadSourceAsset).mockResolvedValueOnce(assetMock as any);
      vi.mocked(repo.createProject).mockResolvedValueOnce({ id: "p_1" } as any);

      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "asset_uuid",
        clips: [
          { id: "1", sourceAssetId: "asset_uuid", sourceStart: 0, sourceEnd: 120, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };

      const res = await createNewEditorProject({
        guideId: "guide_uuid",
        sourceAssetId: "asset_uuid",
        sequence: seq
      });

      expect(res.id).toBe("p_1");
      expect(repo.loadSourceAsset).toHaveBeenCalledWith("asset_uuid");
      expect(repo.createProject).toHaveBeenCalled();
    });

    it("throws ProjectValidationError on invalid sequence schema version", async () => {
      const seq = {
        schemaVersion: 1 as any, // invalid
        sourceAssetId: "asset_uuid",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };

      await expect(createNewEditorProject({
        guideId: "guide_uuid",
        sourceAssetId: "asset_uuid",
        sequence: seq
      })).rejects.toThrow(ProjectValidationError);
    });
  });

  describe("loadOrCreateEditorProject", () => {
    it("loads existing project if found", async () => {
      vi.mocked(repo.loadProjectForGuide).mockResolvedValueOnce({ id: "p_existing" } as any);

      const res = await loadOrCreateEditorProject("guide_uuid", "asset_uuid");
      expect(res.id).toBe("p_existing");
      expect(repo.createProject).not.toHaveBeenCalled();
    });

    it("creates initial sequence and creates new project when missing", async () => {
      vi.mocked(repo.loadProjectForGuide).mockResolvedValueOnce(null);
      vi.mocked(repo.loadSourceAsset).mockResolvedValueOnce(assetMock as any);
      vi.mocked(repo.createProject).mockResolvedValueOnce({ id: "p_new" } as any);

      const res = await loadOrCreateEditorProject("guide_uuid", "asset_uuid");
      expect(res.id).toBe("p_new");
      expect(repo.createProject).toHaveBeenCalledWith(expect.objectContaining({
        sequence: expect.objectContaining({
          schemaVersion: 2,
          clips: [
            expect.objectContaining({
              sourceStart: 0,
              sourceEnd: 120
            })
          ]
        })
      }));
    });

    it("migrates legacy edits and preserves legacy edits copying", async () => {
      vi.mocked(repo.loadProjectForGuide).mockResolvedValueOnce(null);
      vi.mocked(repo.loadSourceAsset).mockResolvedValueOnce(assetMock as any);
      vi.mocked(repo.createProject).mockResolvedValueOnce({ id: "p_migrated" } as any);

      const legacy = {
        trimStart: 10,
        trimEnd: 90,
        cuts: [{ start: 30, end: 45 }]
      };
      const copy = JSON.parse(JSON.stringify(legacy));

      const res = await loadOrCreateEditorProject("guide_uuid", "asset_uuid", legacy);
      expect(res.id).toBe("p_migrated");
      expect(legacy).toEqual(copy); // asserts legacy edits object remains unchanged
    });

    it("handles creation race by loading racing creation project", async () => {
      vi.mocked(repo.loadProjectForGuide)
        .mockResolvedValueOnce(null) // first check
        .mockResolvedValueOnce({ id: "p_raced_winner" } as any); // raced load check

      vi.mocked(repo.loadSourceAsset).mockResolvedValueOnce(assetMock as any);
      vi.mocked(repo.createProject).mockRejectedValueOnce(new ProjectCreationConflictError("Creation conflict"));

      const res = await loadOrCreateEditorProject("guide_uuid", "asset_uuid");
      expect(res.id).toBe("p_raced_winner");
    });
  });

  describe("saveEditorProject", () => {
    it("successfully validates sequence and commands during save", async () => {
      vi.mocked(repo.loadProject).mockResolvedValueOnce({ sourceAssetId: "asset_uuid" } as any);
      vi.mocked(repo.loadSourceAsset).mockResolvedValueOnce(assetMock as any);
      vi.mocked(repo.saveProject).mockResolvedValueOnce({ projectId: "p_1", revision: 2 } as any);

      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "asset_uuid",
        clips: [{ id: "1", sourceAssetId: "asset_uuid", sourceStart: 0, sourceEnd: 120, origin: "source", createdByCommandId: null }],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };

      const commands = [
        { type: "cut", payload: { a: 1 }, inversePayload: { a: 2 } }
      ];

      const res = await saveEditorProject({
        projectId: "p_1",
        expectedRevision: 1,
        sequence: seq,
        commands
      });

      expect(res.revision).toBe(2);
      expect(repo.saveProject).toHaveBeenCalledWith(expect.objectContaining({
        expectedRevision: 1,
        commands
      }));
    });

    it("rejects invalid command payloads", async () => {
      vi.mocked(repo.loadProject).mockResolvedValueOnce({ sourceAssetId: "asset_uuid" } as any);
      vi.mocked(repo.loadSourceAsset).mockResolvedValueOnce(assetMock as any);

      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "asset_uuid",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };

      await expect(saveEditorProject({
        projectId: "p_1",
        expectedRevision: 1,
        sequence: seq,
        commands: [{ type: "cut" } as any] // missing payloads
      })).rejects.toThrow(ProjectValidationError);
    });
  });

  describe("source asset lifecycle operations", () => {
    it("successfully creates new source asset after validating parameters", async () => {
      const mockAsset = { id: "asset_123" };
      vi.mocked(repo.createSourceAsset).mockResolvedValueOnce(mockAsset as any);

      const res = await createNewSourceAsset({
        accountId: "acc_1",
        guideId: "guide_1",
        originalStoragePath: "/raw.mp4",
        durationSeconds: 120,
        fileSizeBytes: 2048
      });

      expect(res.id).toBe("asset_123");
      expect(repo.createSourceAsset).toHaveBeenCalledWith(expect.objectContaining({
        accountId: "acc_1",
        guideId: "guide_1",
        originalStoragePath: "/raw.mp4"
      }));
    });

    it("throws ProjectValidationError on invalid parameters for creation", async () => {
      await expect(createNewSourceAsset({
        accountId: "acc_1",
        guideId: "guide_1",
        originalStoragePath: "   ", // invalid empty path
        durationSeconds: 120,
        fileSizeBytes: 2048
      })).rejects.toThrow(ProjectValidationError);

      await expect(createNewSourceAsset({
        accountId: "acc_1",
        guideId: "guide_1",
        originalStoragePath: "/raw.mp4",
        durationSeconds: -5, // invalid duration
        fileSizeBytes: 2048
      })).rejects.toThrow(ProjectValidationError);
    });

    it("successfully updates source asset preparation metadata", async () => {
      const mockAsset = { id: "asset_123", preparationStatus: "ready" };
      vi.mocked(repo.updateSourceAssetPreparation).mockResolvedValueOnce(mockAsset as any);

      const res = await updateSourceAssetPreparationMetadata({
        sourceAssetId: "asset_123",
        preparationStatus: "ready",
        width: 1920,
        height: 1080
      });

      expect(res.preparationStatus).toBe("ready");
      expect(repo.updateSourceAssetPreparation).toHaveBeenCalledWith(expect.objectContaining({
        sourceAssetId: "asset_123",
        preparationStatus: "ready",
        width: 1920
      }));
    });

    it("throws ProjectValidationError on invalid update metadata", async () => {
      await expect(updateSourceAssetPreparationMetadata({
        sourceAssetId: "asset_123",
        preparationStatus: "ready",
        width: -100 // invalid width
      })).rejects.toThrow(ProjectValidationError);
    });
  });

  describe("persistEditorProjectUpdate", () => {
    it("routes to createProjectWithInitialCommands when persistenceState is 'not_created'", async () => {
      vi.mocked(repo.createProjectWithInitialCommands).mockResolvedValueOnce({
        project: { id: "p_new", revision: 1, updatedAt: "2026-07-13T10:00:00Z" } as any,
        isReplay: false
      });

      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "asset_uuid",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };

      const commands = [
        { type: "cut", payload: {}, inversePayload: {} }
      ];

      const res = await persistEditorProjectUpdate(
        null,
        0,
        seq,
        commands,
        "guide_uuid",
        "asset_uuid",
        "not_created",
        "request_uuid"
      );

      expect(res.projectId).toBe("p_new");
      expect(res.revision).toBe(1);
      expect(repo.createProjectWithInitialCommands).toHaveBeenCalledWith({
        creationRequestId: "request_uuid",
        guideId: "guide_uuid",
        sourceAssetId: "asset_uuid",
        sequence: seq,
        legacyVideoEdits: null,
        commands
      });
    });

    it("routes to saveEditorProject when persistenceState is 'created'", async () => {
      vi.mocked(repo.loadProject).mockResolvedValueOnce({ sourceAssetId: "asset_uuid" } as any);
      vi.mocked(repo.loadSourceAsset).mockResolvedValueOnce(assetMock as any);
      vi.mocked(repo.saveProject).mockResolvedValueOnce({ projectId: "p_existing", revision: 2 } as any);

      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "asset_uuid",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };

      const commands = [
        { type: "cut", payload: {}, inversePayload: {} }
      ];

      const res = await persistEditorProjectUpdate(
        "p_existing",
        1,
        seq,
        commands,
        "guide_uuid",
        "asset_uuid",
        "created"
      );

      expect(res.projectId).toBe("p_existing");
      expect(res.revision).toBe(2);
      expect(repo.saveProject).toHaveBeenCalled();
    });

    it("throws ProjectValidationError if missing projects are saved with empty commands", async () => {
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "asset_uuid",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };

      await expect(persistEditorProjectUpdate(
        null,
        0,
        seq,
        [],
        "guide_uuid",
        "asset_uuid",
        "not_created",
        "request_uuid"
      )).rejects.toThrow(ProjectValidationError);
    });
  });
});
