import {
  TranscriptInvalidError,
  TranscriptSourceMismatchError,
  TranscriptDurationMismatchError,
  TranscriptNotFoundError,
  TranscriptPermissionError,
  TranscriptDisposedError,
  TranscriptImportConflictError,
  TranscriptPersistenceInvalidError
} from "../domain/transcriptErrors";

export function mapDatabaseError(err: any): Error {
  if (!err) return new Error("Unknown database error");

  const message = err.message || "";
  const code = err.code || "";

  if (message.includes("TRANSCRIPT_PERMISSION_DENIED") || code === "42501") {
    return new TranscriptPermissionError(message || "Permission denied for transcript operation");
  }

  if (message.includes("TRANSCRIPT_SOURCE_MISMATCH")) {
    return new TranscriptSourceMismatchError(message || "Source asset mismatch");
  }

  if (message.includes("TRANSCRIPT_DURATION_MISMATCH")) {
    return new TranscriptDurationMismatchError(message || "Transcript duration mismatch");
  }

  if (message.includes("TRANSCRIPT_INVALID")) {
    return new TranscriptInvalidError(message || "Invalid transcript structure");
  }

  if (message.includes("TRANSCRIPT_NOT_FOUND")) {
    return new TranscriptNotFoundError(message || "Transcript not found");
  }

  // Handle unique constraint violations as import conflict
  if (code === "23505") {
    return new TranscriptImportConflictError("A transcript already exists for this source asset");
  }

  return new Error(message || "Database persistence operation failed");
}
