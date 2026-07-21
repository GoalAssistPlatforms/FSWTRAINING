export interface VideoTranscriptionJob {
  id: string;
  sourceAssetId: string;
  provider: string;
  status: 'queued' | 'extracting_audio' | 'transcribing' | 'validating' | 'awaiting_approval' | 'failed';
  progressStage: 'queued' | 'extracting_audio' | 'submitting' | 'provider_processing' | 'normalising' | 'validating' | 'ready_for_review';
  attemptCount: number;
  leaseOwner: string | null;
  leaseGeneration: number | null;
}

export type TickResult =
  | { type: 'NO_JOBS'; recoveredCount?: number }
  | { type: 'SUCCESS'; jobId: string; recoveredCount: number }
  | { type: 'TERMINAL_FAILURE'; jobId: string; error: Error; recoveredCount: number }
  | { type: 'RETRYABLE_FAILURE'; jobId: string; error: Error; recoveredCount: number }
  | { type: 'CANCELLED'; jobId: string; recoveredCount: number }
  | { type: 'LEASE_LOST'; jobId: string; recoveredCount: number };

export interface WorkerRepository {
  claimJob(leaseOwner: string, leaseDurationSeconds: number): Promise<VideoTranscriptionJob | null>;
  heartbeatJob(jobId: string, leaseOwner: string, leaseGeneration: number, leaseDurationSeconds: number): Promise<boolean>;
  recordStage(jobId: string, leaseOwner: string, leaseGeneration: number, stage: string, status: string): Promise<boolean>;
  recordResult(jobId: string, leaseOwner: string, leaseGeneration: number, transcriptJson: any, providerRequestId: string, providerMetadata: any): Promise<boolean>;
  recordFailure(jobId: string, leaseOwner: string, leaseGeneration: number, errorCode: string): Promise<boolean>;
  recoverStaleJobs(limit: number): Promise<{ jobId: string; newStatus: string }[]>;
  isJobCancelled(jobId: string): Promise<boolean>;
}

export interface SourceAssetLoader {
  downloadAsset(assetId: string, abortSignal: AbortSignal): Promise<{ localPath: string }>;
  dispose(localPath: string): Promise<void>;
}

export interface AudioExtractor {
  extractAudio(videoPath: string, abortSignal: AbortSignal): Promise<{ audioPath: string; duration: number }>;
  dispose(audioPath: string): Promise<void>;
}

export interface TranscriptionProvider {
  transcribe(audioPath: string, idempotencyKey: string, abortSignal: AbortSignal): Promise<{ result: any; requestId: string; metadata: any }>;
}

export interface TranscriptNormaliser {
  normalise(providerResult: any, sourceAssetId: string, authDuration: number): Promise<any>;
}

export interface WorkerClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): any;
  clearTimeout(id: any): void;
}

export interface WorkerLogger {
  info(msg: string, ctx?: any): void;
  error(msg: string, ctx?: any): void;
  warn(msg: string, ctx?: any): void;
}
