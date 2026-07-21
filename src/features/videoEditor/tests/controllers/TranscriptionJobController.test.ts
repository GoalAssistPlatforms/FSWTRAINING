import { describe, it, expect, vi, beforeEach } from "vitest";
import { TranscriptionJobController } from "../../controllers/TranscriptionJobController";
import { TranscriptionService } from "../../services/transcriptionService";
import { TranscriptionRepository } from "../../persistence/transcriptionRepository";
import { TranscriptionDisposedError } from "../../domain/transcriptionErrors";
import { TranscriptionJob } from "../../domain/transcriptionTypes";

describe("TranscriptionJobController State Flow", () => {
  const guideId = "test-guide";
  const sourceAssetId = "test-asset";

  let mockService: any;
  let stateChanges: any[];
  let onStateChange: any;

  const createMockJob = (status: any, progressStage: any = "preparing_source"): TranscriptionJob => ({
    id: "job-1",
    accountId: "acc-1",
    guideId,
    sourceAssetId,
    requestId: "req-1",
    requestFingerprint: "fingerprint-1",
    provider: "openai",
    providerModel: "whisper-1",
    status,
    progressStage,
    baseTranscriptRevision: 1,
    resultTranscriptJson: null,
    resultTranscriptRevision: null,
    errorCode: null,
    errorMessageSafe: null,
    attemptCount: 1,
    leaseOwner: null,
    leaseGeneration: null,
    leaseAcquiredAt: null,
    leaseExpiresAt: null,
    lastHeartbeatAt: null,
    nextAttemptAt: null,
    createdBy: "user-1",
    approvedBy: null,
    rejectedBy: null,
    cancelledBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    completedAt: null
  });

  beforeEach(() => {
    stateChanges = [];
    onStateChange = vi.fn((state) => stateChanges.push(state));

    mockService = {
      listJobs: vi.fn(async () => []),
      createJob: vi.fn(async () => createMockJob("queued")),
      createManualImportJob: vi.fn(async () => createMockJob("awaiting_approval")),
      cancelJob: vi.fn(async () => createMockJob("cancelled")),
      retryJob: vi.fn(async () => createMockJob("queued")),
      approveJob: vi.fn(async () => createMockJob("completed")),
      rejectJob: vi.fn(async () => createMockJob("rejected")),
      subscribeToJob: vi.fn((id, callback) => {
        // immediately push queued state
        callback(createMockJob("queued"));
        return () => {};
      }),
      getCurrentTranscriptRevision: vi.fn(async () => 1)
    };
  });

  it("sets up initial ready state when no active jobs exist", async () => {
    const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);
    await controller.init();

    expect(stateChanges[0].status).toBe("loading");
    const lastState = stateChanges[stateChanges.length - 1];
    expect(lastState.status).toBe("ready");
    expect(lastState.job).toBeNull();
    expect(lastState.canCancel).toBe(false);
    expect(lastState.canApprove).toBe(false);
  });

  it("exposes the current state required by the publish guard", async () => {
    const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);

    expect(controller.getState().status).toBe("idle");
    await controller.init();

    const state = controller.getState();
    expect(state.status).toBe("ready");
    expect(state.job).toBeNull();

    state.status = "failed";
    expect(controller.getState().status).toBe("ready");
  });

  it("subscribes and maps to processing state when active job exists", async () => {
    const activeJob = createMockJob("queued");
    mockService.listJobs.mockResolvedValueOnce([activeJob]);

    const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);
    await controller.init();

    expect(mockService.subscribeToJob).toHaveBeenCalledWith(activeJob.id, expect.any(Function));
    const lastState = stateChanges[stateChanges.length - 1];
    expect(lastState.status).toBe("processing");
    expect(lastState.canCancel).toBe(true);
    expect(lastState.canApprove).toBe(false);
  });

  it("sets permissions appropriately for awaiting approval state", async () => {
    const reviewJob = createMockJob("awaiting_approval");
    mockService.listJobs.mockResolvedValueOnce([reviewJob]);
    mockService.subscribeToJob.mockImplementationOnce((id: string, cb: (job: any) => void) => {
      cb(reviewJob);
      return () => {};
    });

    const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);
    await controller.init();

    const lastState = stateChanges[stateChanges.length - 1];
    expect(lastState.status).toBe("awaiting_approval");
    expect(lastState.canApprove).toBe(true);
    expect(lastState.canReject).toBe(true);
    expect(lastState.canCancel).toBe(false);
  });

  it("blocks approval (canApprove = false) if base revision conflicts with active revision", async () => {
    const reviewJob = createMockJob("awaiting_approval");
    reviewJob.baseTranscriptRevision = 5; // job expects revision 5
    mockService.listJobs.mockResolvedValueOnce([reviewJob]);
    // mock active revision as 6 (conflict)
    mockService.getCurrentTranscriptRevision.mockResolvedValueOnce(6);
    mockService.subscribeToJob.mockImplementationOnce((id: string, cb: (job: any) => void) => {
      cb(reviewJob);
      return () => {};
    });

    const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);
    await controller.init();

    const lastState = stateChanges[stateChanges.length - 1];
    expect(lastState.status).toBe("awaiting_approval");
    expect(lastState.canApprove).toBe(false); // approval blocked due to conflict!
  });

  it("throws TranscriptionDisposedError on operations after dispose", async () => {
    const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);
    controller.dispose();

    await expect(controller.init()).rejects.toThrow(TranscriptionDisposedError);
    await expect(controller.startTranscription("new-req")).rejects.toThrow(TranscriptionDisposedError);
  });

  describe("Manual Import & Approval Flow", () => {
    it("startManualImport sets error status and throws on validation failure", async () => {
      const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);
      await controller.init();

      const validationError = new Error("TRANSCRIPTION_INVALID: schemaVersion is missing");
      mockService.createManualImportJob.mockRejectedValueOnce(validationError);

      await expect(controller.startManualImport("req-val", {})).rejects.toThrow(validationError);

      const lastState = stateChanges[stateChanges.length - 1];
      expect(lastState.status).toBe("error");
      expect(lastState.error).toBe(validationError);
    });

    it("startManualImport sets error status and throws on network/RPC failure", async () => {
      const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);
      await controller.init();

      const networkError = new Error("Network request failed");
      mockService.createManualImportJob.mockRejectedValueOnce(networkError);

      await expect(controller.startManualImport("req-net", {})).rejects.toThrow(networkError);

      const lastState = stateChanges[stateChanges.length - 1];
      expect(lastState.status).toBe("error");
      expect(lastState.error).toBe(networkError);
    });

    it("startManualImport puts job in awaiting_approval without starting redundant polling", async () => {
      const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);
      await controller.init();

      const expectedJob = createMockJob("awaiting_approval");
      mockService.createManualImportJob.mockResolvedValueOnce(expectedJob);
      mockService.subscribeToJob.mockImplementationOnce((id: string, cb: (job: any) => void) => {
        cb(expectedJob);
        return () => {};
      });

      const returnedJob = await controller.startManualImport("req-success", {});
      expect(returnedJob).toEqual(expectedJob);
      expect(mockService.subscribeToJob).not.toHaveBeenCalled();

      const lastState = stateChanges[stateChanges.length - 1];
      expect(lastState.job).toEqual(expectedJob);
      expect(lastState.status).toBe("awaiting_approval");
    });

    it("approve sets error status and throws on validation/RPC failure", async () => {
      const reviewJob = createMockJob("awaiting_approval");
      mockService.listJobs.mockResolvedValueOnce([reviewJob]);
      mockService.subscribeToJob.mockImplementationOnce((id: string, cb: (job: any) => void) => {
        cb(reviewJob);
        return () => {};
      });

      const controller = new TranscriptionJobController(mockService as any, guideId, sourceAssetId, onStateChange);
      await controller.init();

      const approvalError = new Error("TRANSCRIPTION_APPROVAL_CONFLICT");
      mockService.approveJob.mockRejectedValueOnce(approvalError);

      await expect(controller.approve()).rejects.toThrow(approvalError);

      const lastState = stateChanges[stateChanges.length - 1];
      expect(lastState.status).toBe("error");
      expect(lastState.error).toBe(approvalError);
    });
  });

  describe("Repository Boundary & Dependency Isolation Checks", () => {
    it("ensures TranscriptionJobController imports no Supabase module", async () => {
      const fs = require("fs");
      const path = require("path");
      const controllerPath = path.resolve(__dirname, "../../controllers/TranscriptionJobController.ts");
      const content = fs.readFileSync(controllerPath, "utf8");
      expect(content).not.toContain("@supabase");
    });

    it("ensures TranscriptionService exports no Supabase client", async () => {
      const serviceInstance = new TranscriptionService({});
      expect((serviceInstance as any).getSupabaseClient).toBeUndefined();
    });

    it("ensures TranscriptionService imports no browser database singleton", async () => {
      const fs = require("fs");
      const path = require("path");
      const servicePath = path.resolve(__dirname, "../../services/transcriptionService.ts");
      const content = fs.readFileSync(servicePath, "utf8");
      expect(content).not.toContain("supabase.ts");
      expect(content).not.toContain("src/lib/supabase");
    });

    it("routes transcript revision loading through repository", async () => {
      const repo = new TranscriptionRepository();
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { revision: 10 }, error: null }))
            }))
          }))
        }))
      };
      const revision = await repo.getCurrentTranscriptRevision(mockClient, "guide-1", "asset-1");
      expect(revision).toBe(10);
      expect(mockClient.from).toHaveBeenCalledWith("video_source_transcripts");
    });

    it("maps permission errors from database to typed persistence errors", async () => {
      const repo = new TranscriptionRepository();
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: { code: "42501", message: "permission denied" } }))
            }))
          }))
        }))
      };
      await expect(repo.getCurrentTranscriptRevision(mockClient, "guide-1", "asset-1")).rejects.toThrow();
    });

    it("returns null revision when transcript is missing", async () => {
      const repo = new TranscriptionRepository();
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null }))
            }))
          }))
        }))
      };
      const revision = await repo.getCurrentTranscriptRevision(mockClient, "guide-1", "asset-1");
      expect(revision).toBeNull();
    });

    it("proves automatic transcription worker is unavailable during Package 06A", () => {
      const service = new TranscriptionService({});
      expect(service.isAutomaticTranscriptionWorkerAvailable()).toBe(false);
    });
  });
});
