import { VideoSequence, SequenceValidationResult, SequenceValidationIssue, SourceDurationError } from "./editorTypes";
import {
  roundTo6,
  validateDurationFinite
} from "./timePrecision";

export const validateSequence = (
  sequence: VideoSequence,
  sourceDuration: number
): SequenceValidationResult => {
  validateDurationFinite(sourceDuration);
  if (sourceDuration < 0) {
    throw new SourceDurationError("Source duration cannot be negative");
  }

  const issues: SequenceValidationIssue[] = [];
  const roundedDuration = roundTo6(sourceDuration);

  // 1. Schema version check
  if (sequence.schemaVersion !== 2) {
    issues.push({
      code: "INVALID_SCHEMA_VERSION",
      message: `Schema version must be 2, got ${sequence.schemaVersion}`,
      clipId: null
    });
  }

  // 2. Missing source asset ID
  if (!sequence.sourceAssetId || typeof sequence.sourceAssetId !== "string" || sequence.sourceAssetId.trim() === "") {
    issues.push({
      code: "MISSING_SOURCE_ASSET_ID",
      message: "Sequence sourceAssetId is missing or empty",
      clipId: null
    });
  }

  // Check clips
  const clipIds = new Set<string>();
  for (let i = 0; i < sequence.clips.length; i++) {
    const clip = sequence.clips[i];

    // Check duplicate clip ID
    if (clipIds.has(clip.id)) {
      issues.push({
        code: "DUPLICATE_CLIP_ID",
        message: `Duplicate clip identifier ${clip.id}`,
        clipId: clip.id
      });
    }
    clipIds.add(clip.id);

    // Check non-finite boundaries
    if (!Number.isFinite(clip.sourceStart) || !Number.isFinite(clip.sourceEnd)) {
      issues.push({
        code: "NON_FINITE_CLIP_VALUES",
        message: `Clip ${clip.id} has non-finite boundaries`,
        clipId: clip.id
      });
      continue;
    }

    // Check bounds
    if (clip.sourceStart < 0 || clip.sourceEnd < 0) {
      issues.push({
        code: "NEGATIVE_CLIP_BOUNDS",
        message: `Clip ${clip.id} has negative boundaries`,
        clipId: clip.id
      });
    }

    if (clip.sourceStart === clip.sourceEnd) {
      issues.push({
        code: "ZERO_DURATION_CLIP",
        message: `Clip ${clip.id} has zero duration`,
        clipId: clip.id
      });
    }

    if (clip.sourceStart > clip.sourceEnd) {
      issues.push({
        code: "REVERSED_CLIP",
        message: `Clip ${clip.id} has reversed range`,
        clipId: clip.id
      });
    }

    if (clip.sourceEnd > roundedDuration) {
      issues.push({
        code: "OUT_OF_BOUNDS",
        message: `Clip ${clip.id} end time ${clip.sourceEnd} exceeds source duration`,
        clipId: clip.id
      });
    }

    // Clip asset mismatch
    if (clip.sourceAssetId !== sequence.sourceAssetId) {
      issues.push({
        code: "CLIP_ASSET_MISMATCH",
        message: `Clip ${clip.id} source asset identifier mismatch`,
        clipId: clip.id
      });
    }
  }

  // Order & Overlap checks (operate in sequence order)
  for (let i = 1; i < sequence.clips.length; i++) {
    const prev = sequence.clips[i - 1];
    const curr = sequence.clips[i];

    if (!Number.isFinite(prev.sourceStart) || !Number.isFinite(prev.sourceEnd) ||
        !Number.isFinite(curr.sourceStart) || !Number.isFinite(curr.sourceEnd)) {
      continue;
    }

    if (curr.sourceStart < prev.sourceStart) {
      issues.push({
        code: "OUT_OF_ORDER_CLIPS",
        message: `Clips are out of order: clip ${curr.id} starts before clip ${prev.id}`,
        clipId: curr.id
      });
    } else if (curr.sourceStart < prev.sourceEnd - 1e-9) {
      issues.push({
        code: "OVERLAPPING_CLIPS",
        message: `Clips overlap between ${prev.id} and ${curr.id}`,
        clipId: curr.id
      });
    }
  }

  // Check protected ranges
  const prIds = new Set<string>();
  for (const pr of sequence.protectedRanges) {
    if (prIds.has(pr.id)) {
      issues.push({
        code: "DUPLICATE_PROTECTED_RANGE_ID",
        message: `Duplicate protected range identifier ${pr.id}`,
        clipId: null
      });
    }
    prIds.add(pr.id);

    if (!Number.isFinite(pr.sourceStart) || !Number.isFinite(pr.sourceEnd)) {
      issues.push({
        code: "INVALID_PROTECTED_RANGE",
        message: `Protected range ${pr.id} has non-finite boundaries`,
        clipId: null
      });
      continue;
    }

    if (pr.sourceStart < 0 || pr.sourceEnd < 0 || pr.sourceStart > pr.sourceEnd) {
      issues.push({
        code: "INVALID_PROTECTED_RANGE",
        message: `Protected range ${pr.id} is invalid (negative or reversed)`,
        clipId: null
      });
    }

    if (pr.sourceEnd > roundedDuration) {
      issues.push({
        code: "PROTECTED_RANGE_OUT_OF_BOUNDS",
        message: `Protected range ${pr.id} exceeds source duration`,
        clipId: null
      });
    }
  }

  // Check duplicate suggestion batch IDs
  const batchIds = new Set<string>();
  for (const batchId of sequence.appliedSuggestionBatchIds) {
    if (batchIds.has(batchId)) {
      issues.push({
        code: "DUPLICATE_SUGGESTION_BATCH_ID",
        message: `Duplicate suggestion batch identifier ${batchId}`,
        clipId: null
      });
    }
    batchIds.add(batchId);
  }

  return {
    valid: issues.length === 0,
    issues
  };
};
