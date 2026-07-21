export class TranscriptInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptInvalidError";
  }
}

export class TranscriptSourceMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptSourceMismatchError";
  }
}

export class TranscriptDurationMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptDurationMismatchError";
  }
}

export class TranscriptNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptNotFoundError";
  }
}

export class TranscriptPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptPermissionError";
  }
}

export class TranscriptDisposedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptDisposedError";
  }
}

export class TranscriptImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptImportConflictError";
  }
}

export class TranscriptPersistenceInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptPersistenceInvalidError";
  }
}
