export abstract class TranscriptionError extends Error {
  abstract readonly isRetryable: boolean;
  abstract readonly isUserSafe: boolean;
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
}

export class TranscriptionJobNotFoundError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "Transcription job not found") {
    super(message, "TRANSCRIPTION_JOB_NOT_FOUND");
  }
}

export class TranscriptionPermissionError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "Permission denied for transcription operation") {
    super(message, "TRANSCRIPTION_PERMISSION_DENIED");
  }
}

export class TranscriptionActiveJobConflictError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "An active transcription job already exists for this source asset") {
    super(message, "TRANSCRIPTION_ACTIVE_JOB_CONFLICT");
  }
}

export class TranscriptionRequestMismatchError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "Request ID exists with different parameters") {
    super(message, "TRANSCRIPTION_REQUEST_MISMATCH");
  }
}

export class TranscriptionSourceUnavailableError extends TranscriptionError {
  readonly isRetryable = true;
  readonly isUserSafe = true;
  constructor(message = "Source video file is not available") {
    super(message, "TRANSCRIPTION_SOURCE_UNAVAILABLE");
  }
}

export class TranscriptionSourceDurationError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "Authoritative source asset duration is missing or invalid") {
    super(message, "TRANSCRIPTION_SOURCE_DURATION_ERROR");
  }
}

export class TranscriptionAudioExtractionError extends TranscriptionError {
  readonly isRetryable = true;
  readonly isUserSafe = false;
  constructor(message = "Failed to extract audio from video source") {
    super(message, "TRANSCRIPTION_AUDIO_EXTRACTION_ERROR");
  }
}

export class TranscriptionProviderUnavailableError extends TranscriptionError {
  readonly isRetryable = true;
  readonly isUserSafe = true;
  constructor(message = "Transcription provider is temporary unavailable") {
    super(message, "TRANSCRIPTION_PROVIDER_UNAVAILABLE");
  }
}

export class TranscriptionProviderAuthenticationError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = false;
  constructor(message = "Authentication with transcription provider failed") {
    super(message, "TRANSCRIPTION_PROVIDER_AUTHENTICATION_ERROR");
  }
}

export class TranscriptionProviderRateLimitError extends TranscriptionError {
  readonly isRetryable = true;
  readonly isUserSafe = true;
  constructor(message = "Rate limit hit with transcription provider") {
    super(message, "TRANSCRIPTION_PROVIDER_RATE_LIMIT");
  }
}

export class TranscriptionProviderTimeoutError extends TranscriptionError {
  readonly isRetryable = true;
  readonly isUserSafe = true;
  constructor(message = "Provider request timed out") {
    super(message, "TRANSCRIPTION_PROVIDER_TIMEOUT");
  }
}

export class TranscriptionProviderInvalidResponseError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = false;
  constructor(message = "Provider returned an invalid or malformed response") {
    super(message, "TRANSCRIPTION_PROVIDER_INVALID_RESPONSE");
  }
}

export class TranscriptionValidationError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "Normalized transcript failed Package 05 validation") {
    super(message, "TRANSCRIPTION_VALIDATION_ERROR");
  }
}

export class TranscriptionApprovalConflictError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "Active transcript revision changed after job started") {
    super(message, "TRANSCRIPTION_APPROVAL_CONFLICT");
  }
}

export class TranscriptionCancelledError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "Transcription job was cancelled by user") {
    super(message, "TRANSCRIPTION_CANCELLED");
  }
}

export class TranscriptionDisposedError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "Transcription operation requested after object disposal") {
    super(message, "TRANSCRIPTION_DISPOSED");
  }
}

export class TranscriptionSourceSizeError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "Extracted audio exceeds provider file size limit") {
    super(message, "TRANSCRIPTION_SOURCE_SIZE_ERROR");
  }
}

export class TranscriptionGenericError extends TranscriptionError {
  readonly isRetryable = false;
  readonly isUserSafe = true;
  constructor(message = "The transcription operation could not be completed.") {
    super(message, "TRANSCRIPTION_GENERIC_ERROR");
  }
}

export function getSafeTranscriptionUserMessage(error: unknown): string {
  let code = "";
  if (error && typeof error === "object") {
    if (typeof (error as any).message === "string") {
      const msg = (error as any).message;
      if (msg.includes("TRANSCRIPTION_APPROVAL_CONFLICT")) code = "TRANSCRIPTION_APPROVAL_CONFLICT";
      else if (msg.includes("TRANSCRIPTION_REQUEST_MISMATCH")) code = "TRANSCRIPTION_REQUEST_MISMATCH";
      else if (msg.includes("TRANSCRIPTION_PERMISSION_DENIED")) code = "TRANSCRIPTION_PERMISSION_DENIED";
      else if (msg.includes("TRANSCRIPTION_ACTIVE_JOB_CONFLICT")) code = "TRANSCRIPTION_ACTIVE_JOB_CONFLICT";
      else if (msg.includes("TRANSCRIPTION_VALIDATION_ERROR") || msg.includes("TRANSCRIPTION_INVALID")) code = "TRANSCRIPTION_VALIDATION_ERROR";
      else if (msg.includes("TRANSCRIPTION_JOB_NOT_FOUND")) code = "TRANSCRIPTION_JOB_NOT_FOUND";
    }
    if (!code) {
      code = (error as any).code || "";
    }
  }

  switch (code) {
    case "TRANSCRIPTION_APPROVAL_CONFLICT":
      return "The active transcript changed after this review began. Refresh the transcript and review the result again.";
    case "TRANSCRIPTION_REQUEST_MISMATCH":
      return "This request could not be replayed because its contents have changed.";
    case "TRANSCRIPTION_PERMISSION_DENIED":
      return "You do not have permission to perform this transcription action.";
    case "TRANSCRIPTION_ACTIVE_JOB_CONFLICT":
      return "Another transcription is already awaiting completion or review for this video.";
    case "TRANSCRIPTION_VALIDATION_ERROR":
      return "The transcript is not in the expected format.";
    case "TRANSCRIPTION_JOB_NOT_FOUND":
      return "The transcription job could not be found.";
    default:
      return "The transcription operation could not be completed.";
  }
}
