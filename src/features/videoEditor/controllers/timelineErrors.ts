export class TimelineSelectionInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineSelectionInvalidError";
  }
}

export class TimelineCommandInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineCommandInvalidError";
  }
}

export class TimelineSequenceInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineSequenceInvalidError";
  }
}

export class TimelineConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineConflictError";
  }
}

export class TimelineDisposedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineDisposedError";
  }
}

export class TimelineRestoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineRestoreUnavailableError";
  }
}

export class TimelineOperationCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineOperationCancelledError";
  }
}
