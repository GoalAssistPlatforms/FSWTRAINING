export interface LegacyVideoCut {
  id?: string
  start: number
  end: number
}

export interface LegacyVideoEdits {
  schemaVersion?: 1
  trimStart?: number
  trimEnd?: number | null
  cuts?: LegacyVideoCut[]
}

export interface SequenceClip {
  id: string
  sourceAssetId: string
  sourceStart: number
  sourceEnd: number
  origin: "source" | "restored"
  createdByCommandId: string | null
}

export interface ProtectedRange {
  id: string
  sourceStart: number
  sourceEnd: number
  reason: string | null
  createdAt: string
  createdBy: string
}

export interface VideoSequence {
  schemaVersion: 2
  sourceAssetId: string
  clips: SequenceClip[]
  protectedRanges: ProtectedRange[]
  appliedSuggestionBatchIds: string[]
}

export type VideoEditorProjectStatus =
  | "preparing"
  | "ready"
  | "editing"
  | "rendering"
  | "completed"
  | "failed"

export interface VideoEditorProject {
  id: string
  organisationId: string
  guideId: string
  sourceAssetId: string
  schemaVersion: number
  revision: number
  status: VideoEditorProjectStatus
  sequence: VideoSequence
  createdAt: string
  updatedAt: string
}

export interface VisibleToSourceResult {
  sourceTime: number
  clipId: string | null
  isClamped: boolean
}

export interface SourceToVisibleResult {
  visibleTime: number
  clipId: string | null
  isVisible: boolean
  nearestBoundary: "previous" | "next" | "exact"
  boundaryClipId: string | null
}

export interface SequenceValidationIssue {
  code: string
  message: string
  clipId: string | null
}

export interface SequenceValidationResult {
  valid: boolean
  issues: SequenceValidationIssue[]
}

// Domain Errors
export class InvalidTimeRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTimeRangeError";
  }
}

export class ProtectedRangeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtectedRangeConflictError";
  }
}

export class InvalidSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSequenceError";
  }
}

export class SourceDurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceDurationError";
  }
}

export class IdentifierGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentifierGenerationError";
  }
}
