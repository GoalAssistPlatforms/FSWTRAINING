import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createProject,
  createProjectWithInitialCommands,
  loadProject,
  loadProjectForGuide,
  saveProject,
  loadSourceAsset
} from "../../persistence/projectRepository";
import { supabase } from "../../../../api/supabase";
import {
  ProjectNotFoundError,
  ProjectAccessError,
  ProjectRevisionConflictError,
  ProjectValidationError,
  ProjectCreationConflictError,
  ProjectPersistenceError,
  SourceAssetNotFoundError,
  ProjectIdempotencyMismatchError
} from "../../persistence/projectPersistenceErrors";

vi.mock("../../../../api/supabase", () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn()
    }
  };
});

describe("Project Repository Mocked Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createProject", () => {
    it("successfully creates and maps project row", async () => {
      const mockProjectRow = {
        id: "project_uuid",
        account_id: "account_uuid",
        organisation_id: "org_uuid",
        guide_id: "guide_uuid",
        source_asset_id: "asset_uuid",
        schema_version: 2,
        revision: 0,
        status: "ready",
        sequence_json: {
          schemaVersion: 2,
          sourceAssetId: "asset_uuid",
          clips: [],
          protectedRanges: [],
          appliedSuggestionBatchIds: []
        },
        created_by: "user_uuid",
        created_at: "2026-07-10T12:00:00Z",
        updated_at: "2026-07-10T12:00:00Z",
        last_saved_at: null
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: mockProjectRow,
        error: null
      } as any);

      const res = await createProject({
        guideId: "guide_uuid",
        sourceAssetId: "asset_uuid",
        sequence: {
          schemaVersion: 2,
          sourceAssetId: "asset_uuid",
          clips: [],
          protectedRanges: [],
          appliedSuggestionBatchIds: []
        }
      });

      expect(res.id).toBe("project_uuid");
      expect(res.schemaVersion).toBe(2);
      expect(res.revision).toBe(0);
      expect(res.sequence.sourceAssetId).toBe("asset_uuid");
    });

    it("throws ProjectCreationConflictError on unique violation (code PVE02)", async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { code: "PVE02", message: "PROJECT_CREATION_CONFLICT" }
      } as any);

      await expect(createProject({
        guideId: "guide_uuid",
        sourceAssetId: "asset_uuid",
        sequence: {
          schemaVersion: 2,
          sourceAssetId: "asset_uuid",
          clips: [],
          protectedRanges: [],
          appliedSuggestionBatchIds: []
        }
      })).rejects.toThrow(ProjectCreationConflictError);
    });
  });

  describe("createProjectWithInitialCommands", () => {
    it("successfully creates project and returns project + isReplay = false", async () => {
      const mockProjectRow = {
        id: "project_uuid",
        account_id: "account_uuid",
        organisation_id: "org_uuid",
        guide_id: "guide_uuid",
        source_asset_id: "asset_uuid",
        schema_version: 2,
        revision: 1,
        status: "ready",
        sequence_json: {
          schemaVersion: 2,
          sourceAssetId: "asset_uuid",
          clips: [],
          protectedRanges: [],
          appliedSuggestionBatchIds: []
        },
        created_by: "user_uuid",
        created_at: "2026-07-10T12:00:00Z",
        updated_at: "2026-07-10T12:00:00Z",
        last_saved_at: null
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          o_project: mockProjectRow,
          o_is_replay: false
        },
        error: null
      } as any);

      const res = await createProjectWithInitialCommands({
        creationRequestId: "req-uuid",
        guideId: "guide_uuid",
        sourceAssetId: "asset_uuid",
        sequence: {
          schemaVersion: 2,
          sourceAssetId: "asset_uuid",
          clips: [],
          protectedRanges: [],
          appliedSuggestionBatchIds: []
        },
        commands: [
          { type: "cut", payload: {}, inversePayload: {} }
        ]
      });

      expect(res.project.id).toBe("project_uuid");
      expect(res.project.revision).toBe(1);
      expect(res.isReplay).toBe(false);
      expect(supabase.rpc).toHaveBeenCalledWith("create_video_editor_project_with_initial_commands", expect.any(Object));
    });

    it("throws ProjectIdempotencyMismatchError on PVE03 error", async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { code: "PVE03", message: "IDEMPOTENCY_REQUEST_MISMATCH" }
      } as any);

      await expect(createProjectWithInitialCommands({
        creationRequestId: "req-uuid",
        guideId: "guide_uuid",
        sourceAssetId: "asset_uuid",
        sequence: {
          schemaVersion: 2,
          sourceAssetId: "asset_uuid",
          clips: [],
          protectedRanges: [],
          appliedSuggestionBatchIds: []
        },
        commands: []
      })).rejects.toThrow(ProjectIdempotencyMismatchError);
    });
  });

  describe("loadProject", () => {
    it("successfully loads and maps project", async () => {
      const mockRow = {
        id: "p_1",
        guide_id: "g_1",
        source_asset_id: "a_1",
        schema_version: 2,
        revision: 3,
        status: "editing",
        sequence_json: {
          schemaVersion: 2,
          sourceAssetId: "a_1",
          clips: [],
          protectedRanges: [],
          appliedSuggestionBatchIds: []
        },
        created_at: "2026-07-10T10:00:00Z",
        updated_at: "2026-07-10T11:00:00Z"
      };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: mockRow, error: null })
      };
      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as any);

      const res = await loadProject("p_1");
      expect(res.revision).toBe(3);
      expect(res.status).toBe("editing");
    });

    it("throws ProjectNotFoundError when no project is found", async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null })
      };
      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as any);

      await expect(loadProject("non_existent")).rejects.toThrow(ProjectNotFoundError);
    });

    it("throws ProjectAccessError on permission failure (code 42501)", async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } })
      };
      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as any);

      await expect(loadProject("p_1")).rejects.toThrow(ProjectAccessError);
    });
  });

  describe("loadProjectForGuide", () => {
    it("returns null when project is not found for guide", async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null })
      };
      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as any);

      const res = await loadProjectForGuide("g_1", "a_1");
      expect(res).toBeNull();
    });
  });

  describe("saveProject", () => {
    it("successfully increments revision and inserts commands", async () => {
      const mockSaveResult = {
        id: "p_1",
        revision: 4,
        last_saved_at: "2026-07-10T12:30:00Z"
      };

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: mockSaveResult,
        error: null
      } as any);

      const res = await saveProject({
        projectId: "p_1",
        expectedRevision: 3,
        sequence: {
          schemaVersion: 2,
          sourceAssetId: "a_1",
          clips: [],
          protectedRanges: [],
          appliedSuggestionBatchIds: []
        },
        commands: [
          { type: "cut", payload: {}, inversePayload: {} }
        ]
      });

      expect(res.revision).toBe(4);
      expect(res.projectId).toBe("p_1");
    });

    it("throws ProjectRevisionConflictError on serialized conflict (code PVE01)", async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: {
          code: "PVE01",
          message: "PROJECT_REVISION_CONFLICT: Expected revision 3, but stored revision is 4"
        }
      } as any);

      try {
        await saveProject({
          projectId: "p_1",
          expectedRevision: 3,
          sequence: {
            schemaVersion: 2,
            sourceAssetId: "a_1",
            clips: [],
            protectedRanges: [],
            appliedSuggestionBatchIds: []
          },
          commands: []
        });
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProjectRevisionConflictError);
        expect(err.expectedRevision).toBe(3);
        expect(err.actualRevision).toBe(4);
      }
    });
  });

  describe("loadSourceAsset", () => {
    it("successfully loads and maps source asset", async () => {
      const mockAssetRow = {
        id: "asset_1",
        account_id: "account_uuid",
        organisation_id: "org_1",
        guide_id: "guide_1",
        original_storage_path: "/org/original.mp4",
        proxy_storage_path: "/org/proxy.mp4",
        audio_storage_path: "/org/audio.wav",
        duration_seconds: "123.456",
        width: 1920,
        height: 1080,
        frame_rate: "30.0",
        video_codec: "h264",
        audio_codec: "aac",
        file_size_bytes: "5423851",
        preparation_status: "ready",
        preparation_error: null,
        created_by: "user_1",
        created_at: "2026-07-10T10:00:00Z",
        updated_at: "2026-07-10T10:00:00Z"
      };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: mockAssetRow, error: null })
      };
      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as any);

      const res = await loadSourceAsset("asset_1");
      expect(res.durationSeconds).toBe(123.456);
      expect(res.fileSizeBytes).toBe(5423851);
      expect(res.originalStoragePath).toBe("/org/original.mp4");
      expect(res.preparationStatus).toBe("ready");
    });

    it("throws SourceAssetNotFoundError when asset is missing", async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValueOnce({ data: null, error: null })
      };
      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as any);

      await expect(loadSourceAsset("missing")).rejects.toThrow(SourceAssetNotFoundError);
    });
  });
});
