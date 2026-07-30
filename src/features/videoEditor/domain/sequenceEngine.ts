import type {
  VideoSequence,
  SequenceClip
} from "./editorTypes";
import {
  InvalidSequenceError,
  InvalidTimeRangeError,
  ProtectedRangeConflictError,
  SourceDurationError
} from "./editorTypes";
import {
  roundTo6,
  validateDurationFinite,
  validateTimeRangeFinite
} from "./timePrecision";
import { generateSecureId } from "./idGenerator";
import type { IdFactory } from "./idGenerator";

export const createInitialSequence = (
  sourceAssetId: string,
  sourceDuration: number,
  idFactory: IdFactory = generateSecureId
): VideoSequence => {
  validateDurationFinite(sourceDuration);
  if (sourceDuration < 0) {
    throw new SourceDurationError("Duration cannot be negative");
  }

  const clips: SequenceClip[] = [];
  if (sourceDuration > 0) {
    clips.push({
      id: idFactory(),
      sourceAssetId,
      sourceStart: 0,
      sourceEnd: roundTo6(sourceDuration),
      origin: "source",
      createdByCommandId: null
    });
  }
  return {
    schemaVersion: 2,
    sourceAssetId,
    clips,
    protectedRanges: [],
    appliedSuggestionBatchIds: []
  };
};

export const getVisibleDuration = (sequence: VideoSequence): number => {
  return roundTo6((sequence.clips || []).reduce((sum, clip) => {
    validateTimeRangeFinite(clip.sourceStart, clip.sourceEnd);
    return sum + (clip.sourceEnd - clip.sourceStart);
  }, 0.0));
};

export const doesRangeOverlapProtection = (
  sequence: VideoSequence,
  sourceStart: number,
  sourceEnd: number
): boolean => {
  validateTimeRangeFinite(sourceStart, sourceEnd);
  return (sequence.protectedRanges || []).some(pr => {
    validateTimeRangeFinite(pr.sourceStart, pr.sourceEnd);
    const overlapStart = Math.max(sourceStart, pr.sourceStart);
    const overlapEnd = Math.min(sourceEnd, pr.sourceEnd);
    return overlapStart < overlapEnd - 1e-9;
  });
};

export const normaliseSequence = (
  sequence: VideoSequence,
  sourceDuration: number
): VideoSequence => {
  validateDurationFinite(sourceDuration);
  if (sourceDuration < 0) {
    throw new SourceDurationError("Duration cannot be negative");
  }

  const roundedDuration = roundTo6(sourceDuration);
  const normalisedClips: SequenceClip[] = [];

  for (const clip of sequence.clips) {
    validateTimeRangeFinite(clip.sourceStart, clip.sourceEnd);
    const start = roundTo6(clip.sourceStart);
    const end = roundTo6(clip.sourceEnd);

    if (start < 0 || end < 0) {
      throw new InvalidSequenceError("Clip boundaries cannot be negative");
    }
    if (end > roundedDuration) {
      throw new InvalidSequenceError("Clip boundaries exceed source duration");
    }
    if (start > end) {
      throw new InvalidSequenceError("Clip start cannot be after end");
    }
    if (start === end) {
      continue;
    }

    normalisedClips.push({
      ...clip,
      sourceStart: start,
      sourceEnd: end
    });
  }

  const mergedClips: SequenceClip[] = [];
  for (const clip of normalisedClips) {
    if (mergedClips.length === 0) {
      mergedClips.push(clip);
    } else {
      const last = mergedClips[mergedClips.length - 1];
      if (clip.sourceStart < last.sourceEnd - 1e-9) {
        throw new InvalidSequenceError("Overlapping or out-of-order clips detected in sequence");
      }

      // Merge adjacent compatible source clips
      if (Math.abs(clip.sourceStart - last.sourceEnd) < 1e-9) {
        last.sourceEnd = clip.sourceEnd;
      } else {
        mergedClips.push(clip);
      }
    }
  }

  return {
    ...sequence,
    clips: mergedClips
  };
};

export const removeSourceRange = (
  sequence: VideoSequence,
  sourceStart: number,
  sourceEnd: number,
  sourceDuration: number,
  commandId?: string,
  idFactory: IdFactory = generateSecureId
): VideoSequence => {
  validateDurationFinite(sourceDuration);
  validateTimeRangeFinite(sourceStart, sourceEnd);

  if (sourceStart > sourceEnd) {
    throw new InvalidTimeRangeError("Start time cannot exceed end time");
  }
  if (sourceStart === sourceEnd) {
    return sequence;
  }

  const clampedStart = Math.max(0, sourceStart);
  const clampedEnd = Math.min(sourceDuration, sourceEnd);

  if (doesRangeOverlapProtection(sequence, clampedStart, clampedEnd)) {
    throw new ProtectedRangeConflictError("Range overlaps a protected range");
  }

  const nextClips: SequenceClip[] = [];

  for (const clip of sequence.clips) {
    if (clip.sourceEnd <= clampedStart || clip.sourceStart >= clampedEnd) {
      nextClips.push({ ...clip });
    } else if (clip.sourceStart >= clampedStart && clip.sourceEnd <= clampedEnd) {
      continue;
    } else if (clip.sourceStart < clampedStart && clip.sourceEnd <= clampedEnd) {
      nextClips.push({
        ...clip,
        sourceEnd: clampedStart
      });
    } else if (clip.sourceStart >= clampedStart && clip.sourceEnd > clampedEnd) {
      nextClips.push({
        ...clip,
        sourceStart: clampedEnd
      });
    } else if (clip.sourceStart < clampedStart && clip.sourceEnd > clampedEnd) {
      nextClips.push({
        ...clip,
        sourceEnd: clampedStart
      });
      nextClips.push({
        ...clip,
        id: idFactory(),
        sourceStart: clampedEnd
      });
    }
  }

  const updatedSequence = {
    ...sequence,
    clips: nextClips
  };

  return normaliseSequence(updatedSequence, sourceDuration);
};

export const removeVisibleRange = (
  sequence: VideoSequence,
  visibleStart: number,
  visibleEnd: number,
  sourceDuration: number,
  commandId?: string,
  idFactory: IdFactory = generateSecureId
): VideoSequence => {
  validateDurationFinite(sourceDuration);
  validateTimeRangeFinite(visibleStart, visibleEnd);

  if (visibleStart > visibleEnd) {
    throw new InvalidTimeRangeError("Start time cannot exceed end time");
  }
  if (visibleStart === visibleEnd) {
    return sequence;
  }

  const nextClips: SequenceClip[] = [];
  let currentVisibleStart = 0;

  for (const clip of sequence.clips) {
    const clipLen = clip.sourceEnd - clip.sourceStart;
    const clipVisibleEnd = currentVisibleStart + clipLen;

    const overlapStart = Math.max(visibleStart, currentVisibleStart);
    const overlapEnd = Math.min(visibleEnd, clipVisibleEnd);

    if (overlapStart >= overlapEnd) {
      nextClips.push({ ...clip });
    } else {
      const localOverlapStart = overlapStart - currentVisibleStart;
      const localOverlapEnd = overlapEnd - currentVisibleStart;

      const sourceOverlapStart = clip.sourceStart + localOverlapStart;
      const sourceOverlapEnd = clip.sourceStart + localOverlapEnd;

      if (doesRangeOverlapProtection(sequence, sourceOverlapStart, sourceOverlapEnd)) {
        throw new ProtectedRangeConflictError("Range overlaps a protected range");
      }

      if (localOverlapStart > 0 && localOverlapEnd < clipLen) {
        nextClips.push({
          ...clip,
          sourceEnd: sourceOverlapStart
        });
        nextClips.push({
          ...clip,
          id: idFactory(),
          sourceStart: sourceOverlapEnd
        });
      } else if (localOverlapStart > 0) {
        nextClips.push({
          ...clip,
          sourceEnd: sourceOverlapStart
        });
      } else if (localOverlapEnd < clipLen) {
        nextClips.push({
          ...clip,
          sourceStart: sourceOverlapEnd
        });
      }
    }
    currentVisibleStart = clipVisibleEnd;
  }

  const updatedSequence = {
    ...sequence,
    clips: nextClips
  };

  return normaliseSequence(updatedSequence, sourceDuration);
};

export const removeVisibleRanges = (
  sequence: VideoSequence,
  ranges: Array<{ visibleStart: number; visibleEnd: number }>,
  sourceDuration: number
): VideoSequence => {
  const orderedRanges = [...ranges].sort(
    (left, right) => left.visibleStart - right.visibleStart
  );

  for (let index = 1; index < orderedRanges.length; index++) {
    if (orderedRanges[index].visibleStart < orderedRanges[index - 1].visibleEnd) {
      throw new InvalidTimeRangeError("Removal ranges cannot overlap");
    }
  }

  let nextSequence = sequence;
  for (const range of [...orderedRanges].reverse()) {
    nextSequence = removeVisibleRange(
      nextSequence,
      range.visibleStart,
      range.visibleEnd,
      sourceDuration
    );
  }

  return nextSequence;
};

export const restoreSourceRange = (
  sequence: VideoSequence,
  sourceStart: number,
  sourceEnd: number,
  sourceDuration: number,
  commandId?: string,
  idFactory: IdFactory = generateSecureId
): VideoSequence => {
  validateDurationFinite(sourceDuration);
  validateTimeRangeFinite(sourceStart, sourceEnd);

  if (sourceStart > sourceEnd) {
    throw new InvalidTimeRangeError("Start time cannot exceed end time");
  }
  if (sourceStart === sourceEnd) {
    return sequence;
  }

  const clampedStart = Math.max(0, sourceStart);
  const clampedEnd = Math.min(sourceDuration, sourceEnd);

  const missingRanges: Array<{ start: number; end: number }> = [];
  let current = clampedStart;

  for (const clip of sequence.clips) {
    if (clip.sourceStart >= clampedEnd) {
      break;
    }
    if (clip.sourceEnd <= current) {
      continue;
    }
    if (clip.sourceStart > current) {
      missingRanges.push({ start: current, end: clip.sourceStart });
    }
    current = Math.max(current, clip.sourceEnd);
  }

  if (current < clampedEnd) {
    missingRanges.push({ start: current, end: clampedEnd });
  }

  const nextClips = [...sequence.clips];

  for (const range of missingRanges) {
    nextClips.push({
      id: idFactory(),
      sourceAssetId: sequence.sourceAssetId,
      sourceStart: range.start,
      sourceEnd: range.end,
      origin: "restored",
      createdByCommandId: commandId || null
    });
  }

  nextClips.sort((a, b) => a.sourceStart - b.sourceStart);

  const updatedSequence = {
    ...sequence,
    clips: nextClips
  };

  return normaliseSequence(updatedSequence, sourceDuration);
};
