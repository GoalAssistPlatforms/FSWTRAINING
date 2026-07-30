import { SourceTranscript } from "./transcriptTypes";

export type TranscriptionJobStatus =
  | "queued"
  | "extracting_audio"
  | "transcribing"
  | "validating"
  | "awaiting_approval"
  | "completed"
  | "rejected"
  | "failed"
  | "cancelled";

export type TranscriptionProgressStage =
  | "preparing_source"
  | "extracting_audio"
  | "submitting"
  | "provider_processing"
  | "normalising"
  | "validating"
  | "ready_for_review";

export interface TranscriptionJob {
  id: string;
  accountId: string;
  guideId: string;
  sourceAssetId: string;
  requestId: string;
  requestFingerprint: string;
  provider: string;
  providerModel: string;
  status: TranscriptionJobStatus;
  progressStage: TranscriptionProgressStage;
  baseTranscriptRevision: number | null;
  resultTranscriptJson: SourceTranscript | null;
  resultTranscriptRevision: number | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
  attemptCount: number;
  leaseOwner: string | null;
  leaseGeneration: number | null;
  leaseAcquiredAt: string | null;
  leaseExpiresAt: string | null;
  lastHeartbeatAt: string | null;
  nextAttemptAt: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  rejectedBy: string | null;
  cancelledBy: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
}

export interface TranscriptionAttempt {
  id: string;
  jobId: string;
  attemptNumber: number;
  provider: string;
  providerRequestId: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
  providerMetadataJson: any | null;
}
