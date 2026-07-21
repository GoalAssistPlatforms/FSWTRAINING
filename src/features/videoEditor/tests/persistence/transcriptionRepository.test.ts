import { describe, it, expect, vi, beforeEach } from "vitest";
import { TranscriptionRepository } from "../../persistence/transcriptionRepository";
import { mapDbJobToDomain, mapDbAttemptToDomain } from "../../persistence/transcriptionPersistenceTypes";
import { handlePersistenceError } from "../../persistence/transcriptionPersistenceErrors";
import {
  TranscriptionJobNotFoundError,
  TranscriptionPermissionError,
  TranscriptionActiveJobConflictError,
  TranscriptionRequestMismatchError,
  TranscriptionApprovalConflictError,
  TranscriptionValidationError
} from "../../domain/transcriptionErrors";

describe("TranscriptionRepository Unit Tests", () => {
  let repository: TranscriptionRepository;
  let mockClient: any;

  beforeEach(() => {
    repository = new TranscriptionRepository();
    mockClient = {
      rpc: vi.fn(),
      from: vi.fn(() => mockClient),
      select: vi.fn(() => mockClient),
      eq: vi.fn(() => mockClient),
      order: vi.fn(() => mockClient),
      maybeSingle: vi.fn()
    };
  });

  const createMockDbJob = (overrides = {}): any => ({
    id: "job-id",
    account_id: "account-id",
    guide_id: "guide-id",
    source_asset_id: "asset-id",
    request_id: "req-id",
    request_fingerprint: "fingerprint",
    provider: "openai",
    provider_model: "whisper-1",
    status: "queued",
    progress_stage: "preparing_source",
    base_transcript_revision: null,
    result_transcript_json: null,
    result_transcript_revision: null,
    error_code: null,
    error_message_safe: null,
    attempt_count: 0,
    lease_owner: null,
    lease_generation: null,
    lease_acquired_at: null,
    lease_expires_at: null,
    last_heartbeat_at: null,
    next_attempt_at: null,
    created_by: "user-id",
    approved_by: null,
    rejected_by: null,
    cancelled_by: null,
    created_at: "2026-07-13T10:00:00Z",
    updated_at: "2026-07-13T10:00:00Z",
    approved_at: null,
    rejected_at: null,
    cancelled_at: null,
    completed_at: null,
    ...overrides
  });

  const createMockDbAttempt = (overrides = {}): any => ({
    id: "attempt-id",
    job_id: "job-id",
    attempt_number: 1,
    provider: "openai",
    provider_request_id: "req-id",
    status: "completed",
    started_at: "2026-07-13T10:00:00Z",
    finished_at: "2026-07-13T10:01:00Z",
    error_code: null,
    error_message_safe: null,
    provider_metadata_json: null,
    ...overrides
  });

  it("1. maps a DB job row to domain model correctly", () => {
    const dbJob = createMockDbJob({
      status: "awaiting_approval",
      progress_stage: "ready_for_review"
    });
    const domainJob = mapDbJobToDomain(dbJob);

    expect(domainJob.id).toBe(dbJob.id);
    expect(domainJob.accountId).toBe(dbJob.account_id);
    expect(domainJob.guideId).toBe(dbJob.guide_id);
    expect(domainJob.status).toBe("awaiting_approval");
    expect(domainJob.progressStage).toBe("ready_for_review");
  });

  it("2. maps a DB attempt row to domain model correctly", () => {
    const dbAttempt = createMockDbAttempt();
    const domainAttempt = mapDbAttemptToDomain(dbAttempt);

    expect(domainAttempt.id).toBe(dbAttempt.id);
    expect(domainAttempt.jobId).toBe(dbAttempt.job_id);
    expect(domainAttempt.attemptNumber).toBe(dbAttempt.attempt_number);
    expect(domainAttempt.status).toBe(dbAttempt.status);
  });

  it("3. validates job mapping is safe under invalid job status", () => {
    const dbJob = createMockDbJob({ status: "invalid_status" });
    const domainJob = mapDbJobToDomain(dbJob);
    // TypeScript/runtime check passes casting without crash, preserves the raw status
    expect(domainJob.status).toBe("invalid_status");
  });

  it("4. validates job mapping is safe under invalid progress stage", () => {
    const dbJob = createMockDbJob({ progress_stage: "invalid_stage" });
    const domainJob = mapDbJobToDomain(dbJob);
    expect(domainJob.progressStage).toBe("invalid_stage");
  });

  it("5. validates job mapping is safe under invalid persisted result transcript", () => {
    const dbJob = createMockDbJob({ result_transcript_json: "invalid_json_string" });
    const domainJob = mapDbJobToDomain(dbJob);
    expect(domainJob.resultTranscriptJson).toBe("invalid_json_string");
  });

  it("6. throws TranscriptionJobNotFoundError when job is missing", async () => {
    mockClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      repository.getTranscriptionJob(mockClient, "non-existent-id")
    ).rejects.toThrow(TranscriptionJobNotFoundError);
  });

  it("7. maps database permission error to TranscriptionPermissionError", () => {
    expect(() =>
      handlePersistenceError({ message: "TRANSCRIPTION_PERMISSION_DENIED", code: "42501" })
    ).toThrow(TranscriptionPermissionError);
  });

  it("8. maps database request mismatch error to TranscriptionRequestMismatchError", () => {
    expect(() =>
      handlePersistenceError({ message: "TRANSCRIPTION_REQUEST_MISMATCH", code: "22000" })
    ).toThrow(TranscriptionRequestMismatchError);
  });

  it("9. maps database active job conflict error to TranscriptionActiveJobConflictError", () => {
    expect(() =>
      handlePersistenceError({ message: "TRANSCRIPTION_ACTIVE_JOB_CONFLICT", code: "22000" })
    ).toThrow(TranscriptionActiveJobConflictError);
  });

  it("10. maps database approval conflict error to TranscriptionApprovalConflictError", () => {
    expect(() =>
      handlePersistenceError({ message: "TRANSCRIPTION_APPROVAL_CONFLICT", code: "22000" })
    ).toThrow(TranscriptionApprovalConflictError);
  });

  it("11. returns null transcript revision when not present", async () => {
    mockClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const rev = await repository.getCurrentTranscriptRevision(mockClient, "guide-id", "asset-id");
    expect(rev).toBeNull();
  });

  it("12. returns active transcript revision when present", async () => {
    mockClient.maybeSingle.mockResolvedValueOnce({ data: { revision: 3 }, error: null });

    const rev = await repository.getCurrentTranscriptRevision(mockClient, "guide-id", "asset-id");
    expect(rev).toBe(3);
  });

  it("13. forwards guide and source parameters correctly during job creation", async () => {
    const dbJob = createMockDbJob();
    mockClient.rpc.mockResolvedValueOnce({ data: dbJob, error: null });

    const guideId = "test-guide-id";
    const assetId = "test-asset-id";
    const reqId = "test-req-id";
    const settings = { model: "whisper-1" };

    await repository.createTranscriptionJob(mockClient, guideId, assetId, reqId, "openai", settings);

    expect(mockClient.rpc).toHaveBeenCalledWith("create_video_transcription_job", {
      p_guide_id: guideId,
      p_source_asset_id: assetId,
      p_request_id: reqId,
      p_provider: "openai",
      p_settings_json: settings
    });
  });

  it("14. forwards manual import payload correctly", async () => {
    const dbJob = createMockDbJob({ provider: "manual_import" });
    mockClient.rpc.mockResolvedValueOnce({ data: dbJob, error: null });

    const guideId = "test-guide-id";
    const assetId = "test-asset-id";
    const reqId = "test-req-id";
    const transcriptJson = { schemaVersion: 1, duration: 60, words: [] };

    await repository.createManualImportJob(mockClient, guideId, assetId, reqId, transcriptJson);

    expect(mockClient.rpc).toHaveBeenCalledWith("create_manual_transcription_import_job", {
      p_guide_id: guideId,
      p_source_asset_id: assetId,
      p_request_id: reqId,
      p_transcript_json: transcriptJson
    });
  });

  it("15. does not expose worker claim/heartbeat/recover functions as public methods", () => {
    const keys = Object.getOwnPropertyNames(TranscriptionRepository.prototype);
    expect(keys).not.toContain("claimNextVideoTranscriptionJob");
    expect(keys).not.toContain("heartbeatVideoTranscriptionJob");
    expect(keys).not.toContain("recoverStaleVideoTranscriptionJob");
    expect(keys).not.toContain("recordVideoTranscriptionStage");
    expect(keys).not.toContain("recordVideoTranscriptionResult");
    expect(keys).not.toContain("recordVideoTranscriptionFailure");
  });

  it("16. does not return the internal Supabase client from any repository method", async () => {
    const dbJob = createMockDbJob();
    mockClient.rpc.mockResolvedValue({ data: dbJob, error: null });
    mockClient.maybeSingle.mockResolvedValue({ data: dbJob, error: null });

    const res1 = await repository.createTranscriptionJob(mockClient, "g", "a", "r", "p", {});
    const res2 = await repository.getTranscriptionJob(mockClient, "job-id");
    const res3 = await repository.cancelTranscriptionJob(mockClient, "job-id");

    // All return domain TranscriptionJob structures, not the mockClient
    expect(res1).not.toBe(mockClient);
    expect(res2).not.toBe(mockClient);
    expect(res3).not.toBe(mockClient);
  });
});
