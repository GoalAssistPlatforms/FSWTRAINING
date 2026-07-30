import { VideoSequence, VisibleToSourceResult, SourceToVisibleResult } from "./editorTypes";
import {
  roundTo6,
  validateVisibleTimeFinite
} from "./timePrecision";
import { getVisibleDuration } from "./sequenceEngine";

export const visibleTimeToSourceTime = (
  sequence: VideoSequence,
  visibleTime: number
): VisibleToSourceResult => {
  validateVisibleTimeFinite(visibleTime);

  if (sequence.clips.length === 0) {
    return {
      sourceTime: 0.0,
      clipId: null,
      isClamped: true
    };
  }

  // Clamping negative visible times to the start of the first clip
  if (visibleTime < 0) {
    const firstClip = sequence.clips[0];
    return {
      sourceTime: firstClip.sourceStart,
      clipId: firstClip.id,
      isClamped: true
    };
  }

  let remaining = visibleTime;
  for (let i = 0; i < sequence.clips.length; i++) {
    const clip = sequence.clips[i];
    const len = clip.sourceEnd - clip.sourceStart;
    const isLast = i === sequence.clips.length - 1;
    if (remaining < len || (remaining === len && isLast)) {
      return {
        sourceTime: roundTo6(clip.sourceStart + remaining),
        clipId: clip.id,
        isClamped: false
      };
    }
    remaining -= len;
  }

  // Clamping times beyond the visible duration to the end of the last clip
  const lastClip = sequence.clips[sequence.clips.length - 1];
  return {
    sourceTime: lastClip.sourceEnd,
    clipId: lastClip.id,
    isClamped: true
  };
};

export const sourceTimeToVisibleTime = (
  sequence: VideoSequence,
  sourceTime: number
): SourceToVisibleResult => {
  validateVisibleTimeFinite(sourceTime);

  const totalVisible = getVisibleDuration(sequence);

  if (sequence.clips.length === 0) {
    return {
      visibleTime: 0.0,
      clipId: null,
      isVisible: false,
      nearestBoundary: "exact",
      boundaryClipId: null
    };
  }

  const firstClip = sequence.clips[0];
  const lastClip = sequence.clips[sequence.clips.length - 1];

  // Clamp source times before the first visible clip
  if (sourceTime < firstClip.sourceStart) {
    return {
      visibleTime: 0.0,
      clipId: null,
      isVisible: false,
      nearestBoundary: "next",
      boundaryClipId: firstClip.id
    };
  }

  // Exact check for final clip end
  if (Math.abs(sourceTime - lastClip.sourceEnd) < 1e-9) {
    return {
      visibleTime: totalVisible,
      clipId: null,
      isVisible: false,
      nearestBoundary: "previous",
      boundaryClipId: lastClip.id
    };
  }

  // Check if beyond final clip end
  if (sourceTime > lastClip.sourceEnd) {
    return {
      visibleTime: totalVisible,
      clipId: null,
      isVisible: false,
      nearestBoundary: "previous",
      boundaryClipId: lastClip.id
    };
  }

  let accumulated = 0.0;
  for (let i = 0; i < sequence.clips.length; i++) {
    const clip = sequence.clips[i];
    const len = clip.sourceEnd - clip.sourceStart;

    // Inclusive start, exclusive end check
    if (sourceTime >= clip.sourceStart && sourceTime < clip.sourceEnd) {
      return {
        visibleTime: roundTo6(accumulated + (sourceTime - clip.sourceStart)),
        clipId: clip.id,
        isVisible: true,
        nearestBoundary: "exact",
        boundaryClipId: null
      };
    }

    // Check if in a gap between this clip and the next one (using array order)
    const nextClip = sequence.clips[i + 1];
    if (nextClip && sourceTime >= clip.sourceEnd && sourceTime < nextClip.sourceStart) {
      const distToPrev = sourceTime - clip.sourceEnd;
      const distToNext = nextClip.sourceStart - sourceTime;
      return {
        visibleTime: roundTo6(accumulated + len),
        clipId: null,
        isVisible: false,
        nearestBoundary: distToPrev <= distToNext ? "previous" : "next",
        boundaryClipId: distToPrev <= distToNext ? clip.id : nextClip.id
      };
    }

    accumulated += len;
  }

  return {
    visibleTime: totalVisible,
    clipId: null,
    isVisible: false,
    nearestBoundary: "previous",
    boundaryClipId: lastClip.id
  };
};
