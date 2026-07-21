import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TranscriptionService } from "../../services/transcriptionService";
import { TranscriptionRepository } from "../../persistence/transcriptionRepository";
import { TranscriptionApprovalConflictError } from "../../domain/transcriptionErrors";

const mockRepoInstance = {
  getCurrentTranscriptRevision: vi.fn(),
  createTranscriptionJob: vi.fn(),
  getTranscriptionJob: vi.fn(),
  listTranscriptionJobsForSource: vi.fn(),
  cancelTranscriptionJob: vi.fn(),
  retryTranscriptionJob: vi.fn(),
  approveTranscriptionJob: vi.fn(),
  rejectTranscriptionJob: vi.fn(),
  createManualImportJob: vi.fn()
};

vi.mock("../../persistence/transcriptionRepository", () => {
  return {
    TranscriptionRepository: class {
      getCurrentTranscriptRevision = (...args: any[]) => mockRepoInstance.getCurrentTranscriptRevision(...args);
      createTranscriptionJob = (...args: any[]) => mockRepoInstance.createTranscriptionJob(...args);
      getTranscriptionJob = (...args: any[]) => mockRepoInstance.getTranscriptionJob(...args);
      listTranscriptionJobsForSource = (...args: any[]) => mockRepoInstance.listTranscriptionJobsForSource(...args);
      cancelTranscriptionJob = (...args: any[]) => mockRepoInstance.cancelTranscriptionJob(...args);
      retryTranscriptionJob = (...args: any[]) => mockRepoInstance.retryTranscriptionJob(...args);
      approveTranscriptionJob = (...args: any[]) => mockRepoInstance.approveTranscriptionJob(...args);
      rejectTranscriptionJob = (...args: any[]) => mockRepoInstance.rejectTranscriptionJob(...args);
      createManualImportJob = (...args: any[]) => mockRepoInstance.createManualImportJob(...args);
    }
  };
});

describe("TranscriptionService Unit Tests", () => {
  let service: TranscriptionService;
  let mockClient: any;
  let repoInstance: any;

  beforeEach(() => {
    mockClient = {};
    service = new TranscriptionService(mockClient);
    repoInstance = mockRepoInstance;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("1. returns automatic worker capability false", () => {
    expect(service.isAutomaticTranscriptionWorkerAvailable()).toBe(false);
  });

  it("2. manual import remains available", async () => {
    const mockJob = { id: "job-1", status: "awaiting_approval" };
    repoInstance.createManualImportJob.mockResolvedValueOnce(mockJob);

    const result = await service.createManualImportJob("guide-id", "asset-id", "req-id", {});
    expect(result).toEqual(mockJob);
    expect(repoInstance.createManualImportJob).toHaveBeenCalledWith(mockClient, "guide-id", "asset-id", "req-id", {});
  });

  it("3. load job successfully", async () => {
    const mockJob = { id: "job-1", status: "queued" };
    repoInstance.getTranscriptionJob.mockResolvedValueOnce(mockJob);

    const result = await service.getJob("job-1");
    expect(result).toEqual(mockJob);
    expect(repoInstance.getTranscriptionJob).toHaveBeenCalledWith(mockClient, "job-1");
  });

  it("4. list jobs successfully", async () => {
    const mockJobs = [{ id: "job-1" }, { id: "job-2" }];
    repoInstance.listTranscriptionJobsForSource.mockResolvedValueOnce(mockJobs);

    const result = await service.listJobs("asset-id");
    expect(result).toEqual(mockJobs);
    expect(repoInstance.listTranscriptionJobsForSource).toHaveBeenCalledWith(mockClient, "asset-id");
  });

  it("5. cancel job successfully", async () => {
    const mockJob = { id: "job-1", status: "cancelled" };
    repoInstance.cancelTranscriptionJob.mockResolvedValueOnce(mockJob);

    const result = await service.cancelJob("job-1");
    expect(result).toEqual(mockJob);
    expect(repoInstance.cancelTranscriptionJob).toHaveBeenCalledWith(mockClient, "job-1");
  });

  it("6. retry job successfully", async () => {
    const mockJob = { id: "job-1", status: "queued" };
    repoInstance.retryTranscriptionJob.mockResolvedValueOnce(mockJob);

    const result = await service.retryJob("job-1");
    expect(result).toEqual(mockJob);
    expect(repoInstance.retryTranscriptionJob).toHaveBeenCalledWith(mockClient, "job-1");
  });

  it("7. approve job successfully", async () => {
    const mockJob = { id: "job-1", status: "completed" };
    repoInstance.approveTranscriptionJob.mockResolvedValueOnce(mockJob);

    const result = await service.approveJob("job-1", 2);
    expect(result).toEqual(mockJob);
    expect(repoInstance.approveTranscriptionJob).toHaveBeenCalledWith(mockClient, "job-1", 2);
  });

  it("8. reject job successfully", async () => {
    const mockJob = { id: "job-1", status: "rejected" };
    repoInstance.rejectTranscriptionJob.mockResolvedValueOnce(mockJob);

    const result = await service.rejectJob("job-1");
    expect(result).toEqual(mockJob);
    expect(repoInstance.rejectTranscriptionJob).toHaveBeenCalledWith(mockClient, "job-1");
  });

  it("9. propagates approval conflict errors correctly", async () => {
    repoInstance.approveTranscriptionJob.mockRejectedValueOnce(
      new TranscriptionApprovalConflictError("Conflict detected")
    );

    await expect(service.approveJob("job-1", 2)).rejects.toThrow(TranscriptionApprovalConflictError);
  });

  it("10. propagates general repository errors", async () => {
    repoInstance.getTranscriptionJob.mockRejectedValueOnce(new Error("Database offline"));

    await expect(service.getJob("job-1")).rejects.toThrow("Database offline");
  });

  it("11. returns safe mapped errors under handlePersistenceError mapping", async () => {
    repoInstance.cancelTranscriptionJob.mockRejectedValueOnce(new Error("TRANSCRIPTION_ILLEGAL_STATE: Cannot cancel"));

    await expect(service.cancelJob("job-1")).rejects.toThrow("TRANSCRIPTION_ILLEGAL_STATE");
  });

  it("12. returns null active transcript revision", async () => {
    repoInstance.getCurrentTranscriptRevision.mockResolvedValueOnce(null);

    const rev = await service.getCurrentTranscriptRevision("guide-id", "asset-id");
    expect(rev).toBeNull();
  });

  it("13. returns existing active transcript revision", async () => {
    repoInstance.getCurrentTranscriptRevision.mockResolvedValueOnce(5);

    const rev = await service.getCurrentTranscriptRevision("guide-id", "asset-id");
    expect(rev).toBe(5);
  });

  it("14. unsubscribes from job polling on disposal", async () => {
    const mockJob = { id: "job-1", status: "queued" };
    repoInstance.getTranscriptionJob.mockResolvedValue(mockJob);

    const callback = vi.fn();
    const unsubscribe = service.subscribeToJob("job-1", callback);

    await vi.runOnlyPendingTimersAsync();
    expect(callback).toHaveBeenCalledWith(mockJob);

    unsubscribe();
    callback.mockClear();

    // Advance time and check that callback is not called anymore
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("15. operations are safe after subscription disposal", async () => {
    const mockJobCompleted = { id: "job-1", status: "completed" };
    repoInstance.getTranscriptionJob.mockResolvedValueOnce(mockJobCompleted);

    const callback = vi.fn();
    const unsubscribe = service.subscribeToJob("job-1", callback);

    await vi.runOnlyPendingTimersAsync();
    expect(callback).toHaveBeenCalledWith(mockJobCompleted);

    // Completed status stops polling automatically
    callback.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(callback).not.toHaveBeenCalled();

    unsubscribe(); // Safe to call unsubscribe multiple times / after stop
  });
});
