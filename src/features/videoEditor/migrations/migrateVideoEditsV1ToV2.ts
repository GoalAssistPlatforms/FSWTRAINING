import { LegacyVideoEdits, VideoSequence, SequenceClip, InvalidSequenceError, InvalidTimeRangeError } from "../domain/editorTypes";
import { normaliseSequence } from "../domain/sequenceEngine";
import {
  roundTo6,
  validateDurationFinite
} from "../domain/timePrecision";
import { generateSecureId, IdFactory } from "../domain/idGenerator";

export const migrateVideoEditsV1ToV2 = (
  sourceAssetId: string,
  sourceDuration: number,
  legacyEdits: LegacyVideoEdits,
  idFactory: IdFactory = generateSecureId
): VideoSequence => {
  validateDurationFinite(sourceDuration);

  if ((legacyEdits as any)?.schemaVersion === 2) {
    throw new InvalidSequenceError("Cannot migrate version 2 sequence using the version 1 migrator");
  }

  let rawTrimStart = legacyEdits?.trimStart ?? 0.0;
  let rawTrimEnd = legacyEdits?.trimEnd ?? sourceDuration;

  if (typeof rawTrimStart === 'string') rawTrimStart = parseFloat(rawTrimStart);
  if (typeof rawTrimEnd === 'string') rawTrimEnd = parseFloat(rawTrimEnd);

  if (!Number.isFinite(rawTrimStart) || !Number.isFinite(rawTrimEnd)) {
    throw new InvalidTimeRangeError("Legacy trim boundaries must be finite numbers");
  }

  // Clamp trim boundaries to 0 through sourceDuration
  const trimStart = Math.max(0, Math.min(sourceDuration, rawTrimStart));
  const trimEnd = Math.max(0, Math.min(sourceDuration, rawTrimEnd));

  if (trimEnd <= trimStart) {
    return {
      schemaVersion: 2,
      sourceAssetId,
      clips: [],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
  }

  let rawCuts = legacyEdits?.cuts || [];
  if (!Array.isArray(rawCuts) && typeof rawCuts === 'object') {
      rawCuts = Object.values(rawCuts);
  }
  const cuts = Array.isArray(rawCuts) ? rawCuts : [];

  const activeCuts: Array<{ start: number; end: number }> = [];

  for (const cut of cuts) {
    if (!cut || typeof cut !== 'object') continue;

    const startVal = typeof cut.start === 'string' ? parseFloat(cut.start) : cut.start;
    const endVal = typeof cut.end === 'string' ? parseFloat(cut.end) : cut.end;

    if (!Number.isFinite(startVal) || !Number.isFinite(endVal)) {
      console.warn("Invalid legacy cut discarded:", cut);
      continue;
    }

    // Clamp cut boundaries to 0 through sourceDuration
    const clampedCutStart = Math.max(0, Math.min(sourceDuration, startVal));
    const clampedCutEnd = Math.max(0, Math.min(sourceDuration, endVal));

    // Clamp cut to trim boundaries
    const start = Math.max(clampedCutStart, trimStart);
    const end = Math.min(clampedCutEnd, trimEnd);

    if (start < end) {
      activeCuts.push({
        start: roundTo6(start),
        end: roundTo6(end)
      });
    }
  }

  // Sort cuts chronologically
  activeCuts.sort((a, b) => a.start - b.start);

  const mergedCuts: Array<{ start: number; end: number }> = [];
  for (const cut of activeCuts) {
    if (mergedCuts.length === 0) {
      mergedCuts.push(cut);
    } else {
      const last = mergedCuts[mergedCuts.length - 1];
      // Compare using precision threshold (overlapping or touching)
      if (cut.start <= last.end + 1e-9) {
        last.end = Math.max(last.end, cut.end);
      } else {
        mergedCuts.push(cut);
      }
    }
  }

  const clips: SequenceClip[] = [];
  let currentStart = trimStart;

  for (const cut of mergedCuts) {
    if (cut.start > currentStart) {
      clips.push({
        id: idFactory(),
        sourceAssetId,
        sourceStart: roundTo6(currentStart),
        sourceEnd: roundTo6(cut.start),
        origin: "source",
        createdByCommandId: null
      });
    }
    currentStart = Math.max(currentStart, cut.end);
  }

  if (currentStart < trimEnd) {
    clips.push({
      id: idFactory(),
      sourceAssetId,
      sourceStart: roundTo6(currentStart),
      sourceEnd: roundTo6(trimEnd),
      origin: "source",
      createdByCommandId: null
    });
  }

  const sequence: VideoSequence = {
    schemaVersion: 2,
    sourceAssetId,
    clips,
    protectedRanges: [],
    appliedSuggestionBatchIds: []
  };

  return normaliseSequence(sequence, sourceDuration);
};
