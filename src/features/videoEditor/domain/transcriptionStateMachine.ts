import { TranscriptionJobStatus } from "./transcriptionTypes";

const ALLOWED_TRANSITIONS: Record<TranscriptionJobStatus, Set<TranscriptionJobStatus>> = {
  queued: new Set(["extracting_audio", "cancelled", "failed"]),
  extracting_audio: new Set(["transcribing", "cancelled", "failed"]),
  transcribing: new Set(["validating", "cancelled", "failed"]),
  validating: new Set(["awaiting_approval", "failed"]),
  awaiting_approval: new Set(["completed", "rejected"]),
  completed: new Set(),
  rejected: new Set(),
  failed: new Set(["queued"]), // retry allows failed to queued
  cancelled: new Set()
};

export function isValidTransition(current: TranscriptionJobStatus, next: TranscriptionJobStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[current];
  return allowed ? allowed.has(next) : false;
}

export function validateTransition(current: TranscriptionJobStatus, next: TranscriptionJobStatus): void {
  if (current === next) {
    return; // No-op idempotent transitions are allowed
  }
  if (!isValidTransition(current, next)) {
    throw new Error(`Invalid transcription job transition from '${current}' to '${next}'`);
  }
}
