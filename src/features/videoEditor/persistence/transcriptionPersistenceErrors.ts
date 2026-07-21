import {
  TranscriptionError,
  TranscriptionJobNotFoundError,
  TranscriptionPermissionError,
  TranscriptionActiveJobConflictError,
  TranscriptionRequestMismatchError,
  TranscriptionSourceDurationError,
  TranscriptionApprovalConflictError,
  TranscriptionValidationError,
  TranscriptionCancelledError,
  TranscriptionGenericError
} from "../domain/transcriptionErrors";

export function handlePersistenceError(error: any): never {
  if (!error) {
    throw new TranscriptionGenericError("Unknown database error occurred");
  }

  const message = error.message || "";
  const code = error.code || "";

  let mappedError: Error | null = null;

  if (message.includes("TRANSCRIPTION_PERMISSION_DENIED") || code === "42501") {
    mappedError = new TranscriptionPermissionError();
  } else if (message.includes("TRANSCRIPTION_JOB_NOT_FOUND")) {
    mappedError = new TranscriptionJobNotFoundError();
  } else if (message.includes("TRANSCRIPTION_ACTIVE_JOB_CONFLICT")) {
    mappedError = new TranscriptionActiveJobConflictError();
  } else if (message.includes("TRANSCRIPTION_REQUEST_MISMATCH")) {
    mappedError = new TranscriptionRequestMismatchError();
  } else if (message.includes("TRANSCRIPTION_SOURCE_DURATION_ERROR")) {
    mappedError = new TranscriptionSourceDurationError();
  } else if (message.includes("TRANSCRIPTION_APPROVAL_CONFLICT")) {
    mappedError = new TranscriptionApprovalConflictError();
  } else if (message.includes("TRANSCRIPTION_INVALID") || message.includes("TRANSCRIPTION_VALIDATION_ERROR")) {
    mappedError = new TranscriptionValidationError();
  } else if (message.includes("JOB_CANCELLED_BY_USER") || message.includes("cancelled")) {
    mappedError = new TranscriptionCancelledError();
  }

  if (mappedError) {
    // Preserve the original database error as an internal cause
    (mappedError as any).cause = error;
    throw mappedError;
  }

  const genericErr = new TranscriptionGenericError("The transcription operation could not be completed.");
  (genericErr as any).cause = error;
  throw genericErr;
}
