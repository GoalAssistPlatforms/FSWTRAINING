export class ProjectNotFoundError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "ProjectNotFoundError";
  }
}

export class ProjectAccessError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "ProjectAccessError";
  }
}

export class ProjectRevisionConflictError extends Error {
  constructor(
    message: string,
    public projectId: string,
    public expectedRevision: number,
    public actualRevision: number,
    public override cause?: unknown
  ) {
    super(message);
    this.name = "ProjectRevisionConflictError";
  }
}

export class ProjectValidationError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "ProjectValidationError";
  }
}

export class ProjectCreationConflictError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "ProjectCreationConflictError";
  }
}

export class ProjectPersistenceError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "ProjectPersistenceError";
  }
}

export class SourceAssetNotFoundError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "SourceAssetNotFoundError";
  }
}

export class ProjectIdempotencyMismatchError extends Error {
  constructor(message: string, public override cause?: unknown) {
    super(message);
    this.name = "ProjectIdempotencyMismatchError";
  }
}
