import { SourceTranscript } from "./transcriptTypes";
import { TranscriptInvalidError } from "./transcriptErrors";

export const TRANSCRIPT_TIME_TOLERANCE_SECONDS = 0.001;

export function validateSourceTranscript(transcript: any): asserts transcript is SourceTranscript {
  if (!transcript || typeof transcript !== "object") {
    throw new TranscriptInvalidError("Transcript must be a non-null object");
  }

  // Exact key-set check on transcript level
  const allowedMainKeys = ["schemaVersion", "sourceAssetId", "language", "duration", "words"];
  for (const key of Object.keys(transcript)) {
    if (!allowedMainKeys.includes(key)) {
      throw new TranscriptInvalidError(`Unexpected field on transcript: ${key}`);
    }
  }

  if (transcript.schemaVersion !== 1) {
    throw new TranscriptInvalidError("schemaVersion must be exactly 1");
  }

  if (typeof transcript.sourceAssetId !== "string" || !transcript.sourceAssetId.trim()) {
    throw new TranscriptInvalidError("sourceAssetId must be a non-empty string");
  }

  if (typeof transcript.language !== "string" || !transcript.language.trim()) {
    throw new TranscriptInvalidError("language must be a non-empty string");
  }

  const duration = transcript.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
    throw new TranscriptInvalidError("duration must be a finite non-negative number");
  }

  if (!Array.isArray(transcript.words)) {
    throw new TranscriptInvalidError("words must be an array");
  }

  const words = transcript.words;
  const wordIds = new Set<string>();

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word || typeof word !== "object") {
      throw new TranscriptInvalidError(`Word at index ${i} must be an object`);
    }

    // Exact key-set check on word level
    const allowedWordKeys = ["id", "text", "startSourceTime", "endSourceTime", "confidence", "speakerId"];
    for (const key of Object.keys(word)) {
      if (!allowedWordKeys.includes(key)) {
        throw new TranscriptInvalidError(`Unexpected field on word object: ${key}`);
      }
    }

    // Check for missing required keys
    const requiredWordKeys = ["id", "text", "startSourceTime", "endSourceTime"];
    for (const key of requiredWordKeys) {
      if (!(key in word)) {
        throw new TranscriptInvalidError(`Word is missing required property: ${key}`);
      }
    }

    if (typeof word.id !== "string" || !word.id.trim()) {
      throw new TranscriptInvalidError(`Word at index ${i} must have a valid non-empty id`);
    }

    if (wordIds.has(word.id)) {
      throw new TranscriptInvalidError(`Duplicate word identifier found: ${word.id}`);
    }
    wordIds.add(word.id);

    if (typeof word.text !== "string" || !word.text.trim()) {
      throw new TranscriptInvalidError(`Word with id ${word.id} has empty text`);
    }

    const start = word.startSourceTime;
    const end = word.endSourceTime;

    if (typeof start !== "number" || !Number.isFinite(start) || start < 0) {
      throw new TranscriptInvalidError(`Word ${word.id} has invalid startSourceTime`);
    }

    if (typeof end !== "number" || !Number.isFinite(end) || end < 0) {
      throw new TranscriptInvalidError(`Word ${word.id} has invalid endSourceTime`);
    }

    if (start >= end) {
      throw new TranscriptInvalidError(`Word ${word.id} start time must be strictly less than end time`);
    }

    if (end > duration + TRANSCRIPT_TIME_TOLERANCE_SECONDS) {
      throw new TranscriptInvalidError(`Word ${word.id} end time exceeds transcript duration`);
    }

    if (word.confidence !== undefined && word.confidence !== null && (typeof word.confidence !== "number" || !Number.isFinite(word.confidence) || word.confidence < 0 || word.confidence > 1)) {
      throw new TranscriptInvalidError(`Word ${word.id} confidence must be null or between 0 and 1`);
    }

    if (word.speakerId !== undefined && word.speakerId !== null && (typeof word.speakerId !== "string" || !word.speakerId.trim())) {
      throw new TranscriptInvalidError(`Word ${word.id} speakerId must be null or a non-empty string`);
    }

    if (i > 0) {
      const prevWord = words[i - 1];
      if (start < prevWord.startSourceTime) {
        throw new TranscriptInvalidError(`Words are not chronological: word ${word.id} starts before ${prevWord.id}`);
      }

      // Check overlap
      const overlap = prevWord.endSourceTime - start;
      if (overlap > TRANSCRIPT_TIME_TOLERANCE_SECONDS) {
        throw new TranscriptInvalidError(`Words overlap beyond tolerance: ${prevWord.id} and ${word.id} overlap by ${overlap}s`);
      }
    }
  }
}
