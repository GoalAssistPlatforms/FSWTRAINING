import { TranscriptionJob, TranscriptionAttempt } from "../domain/transcriptionTypes";

export interface DbTranscriptionJob {
  id: string;
  account_id: string;
  guide_id: string;
  source_asset_id: string;
  request_id: string;
  request_fingerprint: string;
  provider: string;
  provider_model: string;
  status: string;
  progress_stage: string;
  base_transcript_revision: number | null;
  result_transcript_json: any | null;
  result_transcript_revision: number | null;
  error_code: string | null;
  error_message_safe: string | null;
  attempt_count: number;
  lease_owner: string | null;
  lease_generation: number | null;
  lease_acquired_at: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  next_attempt_at: string | null;
  created_by: string | null;
  approved_by: string | null;
  rejected_by: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
}

export interface DbTranscriptionAttempt {
  id: string;
  job_id: string;
  attempt_number: number;
  provider: string;
  provider_request_id: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  error_code: string | null;
  error_message_safe: string | null;
  provider_metadata_json: any | null;
}

export function mapDbJobToDomain(db: DbTranscriptionJob): TranscriptionJob {
  return {
    id: db.id,
    accountId: db.account_id,
    guideId: db.guide_id,
    sourceAssetId: db.source_asset_id,
    requestId: db.request_id,
    requestFingerprint: db.request_fingerprint,
    provider: db.provider,
    providerModel: db.provider_model,
    status: db.status as any,
    progressStage: db.progress_stage as any,
    baseTranscriptRevision: db.base_transcript_revision,
    resultTranscriptJson: db.result_transcript_json,
    resultTranscriptRevision: db.result_transcript_revision,
    errorCode: db.error_code,
    errorMessageSafe: db.error_message_safe,
    attemptCount: db.attempt_count,
    leaseOwner: db.lease_owner,
    leaseGeneration: db.lease_generation,
    leaseAcquiredAt: db.lease_acquired_at,
    leaseExpiresAt: db.lease_expires_at,
    lastHeartbeatAt: db.last_heartbeat_at,
    nextAttemptAt: db.next_attempt_at,
    createdBy: db.created_by,
    approvedBy: db.approved_by,
    rejectedBy: db.rejected_by,
    cancelledBy: db.cancelled_by,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    approvedAt: db.approved_at,
    rejectedAt: db.rejected_at,
    cancelledAt: db.cancelled_at,
    completedAt: db.completed_at
  };
}

export function mapDbAttemptToDomain(db: DbTranscriptionAttempt): TranscriptionAttempt {
  return {
    id: db.id,
    jobId: db.job_id,
    attemptNumber: db.attempt_number,
    provider: db.provider,
    providerRequestId: db.provider_request_id,
    status: db.status,
    startedAt: db.started_at,
    finishedAt: db.finished_at,
    errorCode: db.error_code,
    errorMessageSafe: db.error_message_safe,
    providerMetadataJson: db.provider_metadata_json
  };
}
