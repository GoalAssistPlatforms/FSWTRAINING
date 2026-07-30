import { LegacyVideoEdits, VideoSequence } from "../domain/editorTypes";
import { migrateVideoEditsV1ToV2 } from "../migrations/migrateVideoEditsV1ToV2";
import {
  getVisibleDuration as getLegacyVisibleDuration,
  visibleToSourceTime as legacyVisibleToSourceTime,
  sourceToVisibleTime as legacySourceToVisibleTime,
  getVisibleSegments as getLegacyVisibleSegments
} from "../../../utils/videoPlaybackController";
import { getVisibleDuration as getSeqVisibleDuration } from "../domain/sequenceEngine";
import {
  visibleTimeToSourceTime as seqVisibleToSourceTime,
  sourceTimeToVisibleTime as seqSourceToVisibleTime
} from "../domain/timeMapping";
import { validateSequence } from "../domain/sequenceValidation";
import { roundTo6 } from "../domain/timePrecision";
import { PlaybackSequenceInvalidError } from "../controllers/playbackErrors";

export interface PlaybackCompatibilityDifference {
  category: string;
  expected: any;
  actual: any;
  difference: number | string;
  result: "pass" | "fail";
}

export interface PlaybackCompatibilityResult {
  compatible: boolean;
  comparisonsRun: number;
  differences: PlaybackCompatibilityDifference[];
}

export const migrateLegacyEditsToSequence = (
  sourceAssetId: string,
  sourceDuration: number,
  legacyEdits: LegacyVideoEdits
): VideoSequence => {
  return migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacyEdits);
};

export const validateSequenceState = (
  sequence: VideoSequence,
  sourceDuration: number
) => {
  const validation = validateSequence(sequence, sourceDuration);
  if (!validation.valid) {
    throw new PlaybackSequenceInvalidError(`Sequence validation failed: ${validation.issues.map(i => i.message).join(", ")}`);
  }
  return validation;
};

export const calculateCompatibility = (
  legacyEdits: LegacyVideoEdits,
  sequence: VideoSequence,
  sourceDuration: number
): PlaybackCompatibilityResult => {
  const differences: PlaybackCompatibilityDifference[] = [];
  let comparisonsRun = 0;

  // 1. Compare Visible Duration
  const legacyDur = getLegacyVisibleDuration(sourceDuration, legacyEdits);
  const seqDur = getSeqVisibleDuration(sequence);
  const durDiff = Math.abs(legacyDur - seqDur);
  differences.push({
    category: "visibleDuration",
    expected: legacyDur,
    actual: seqDur,
    difference: durDiff,
    result: durDiff <= 1e-6 ? "pass" : "fail"
  });
  comparisonsRun++;

  // 2. Compare First Visible Source Time
  const legacySegments = getLegacyVisibleSegments(sourceDuration, legacyEdits);
  const legacyFirstVisible = legacySegments.length > 0 ? legacySegments[0][0] : sourceDuration;
  const seqFirstVisible = sequence.clips.length > 0 ? sequence.clips[0].sourceStart : sourceDuration;
  const firstDiff = Math.abs(legacyFirstVisible - seqFirstVisible);
  differences.push({
    category: "firstVisibleSourceTime",
    expected: legacyFirstVisible,
    actual: seqFirstVisible,
    difference: firstDiff,
    result: firstDiff <= 1e-6 ? "pass" : "fail"
  });
  comparisonsRun++;

  // 3. Compare Final Visible Source Boundary
  const legacyLastVisible = legacySegments.length > 0 ? legacySegments[legacySegments.length - 1][1] : sourceDuration;
  const seqLastVisible = sequence.clips.length > 0 ? sequence.clips[sequence.clips.length - 1].sourceEnd : sourceDuration;
  const lastDiff = Math.abs(legacyLastVisible - seqLastVisible);
  differences.push({
    category: "finalVisibleSourceBoundary",
    expected: legacyLastVisible,
    actual: seqLastVisible,
    difference: lastDiff,
    result: lastDiff <= 1e-6 ? "pass" : "fail"
  });
  comparisonsRun++;

  // 4. Compare Mappings (Sampled at intervals and boundary edges)
  const sampleTimes: number[] = [0, sourceDuration];
  if (legacyEdits?.trimStart !== undefined) sampleTimes.push(legacyEdits.trimStart);
  if (legacyEdits?.trimEnd !== undefined && legacyEdits.trimEnd !== null) sampleTimes.push(legacyEdits.trimEnd);
  if (legacyEdits?.cuts) {
    for (const cut of legacyEdits.cuts) {
      sampleTimes.push(cut.start, cut.end);
      sampleTimes.push(Math.max(0, cut.start - 0.01), Math.min(sourceDuration, cut.end + 0.01));
    }
  }

  // Generate uniform samples
  for (let i = 1; i < 20; i++) {
    sampleTimes.push((sourceDuration * i) / 20);
  }

  // Remove duplicates and sort
  const uniqueSamples = Array.from(new Set(sampleTimes.map(t => roundTo6(t)))).sort((a, b) => a - b);

  for (const t of uniqueSamples) {
    if (t < 0 || t > sourceDuration) continue;

    // sourceToVisible comparison
    const legacyS2V = legacySourceToVisibleTime(t, legacyEdits, sourceDuration);
    const seqS2V = seqSourceToVisibleTime(sequence, t);
    const s2vDiff = Math.abs(legacyS2V.visibleTime - seqS2V.visibleTime);
    differences.push({
      category: `sourceToVisibleTime_at_${t}`,
      expected: legacyS2V.visibleTime,
      actual: seqS2V.visibleTime,
      difference: s2vDiff,
      result: s2vDiff <= 1e-6 ? "pass" : "fail"
    });
    comparisonsRun++;

    // if source time is visible, compare visibleToSource mapping
    if (!legacyS2V.isRemoved && seqS2V.isVisible) {
      const v = legacyS2V.visibleTime;
      const legacyV2S = legacyVisibleToSourceTime(v, legacyEdits, sourceDuration);
      const seqV2S = seqVisibleToSourceTime(sequence, v).sourceTime;
      const v2sDiff = Math.abs(legacyV2S - seqV2S);

      // They are compatible if they are numerically close, OR if they resolve to the same visible time (boundary equivalence)
      let isCompat = v2sDiff <= 1e-6;
      if (!isCompat) {
        const legacyV2S_visible = seqSourceToVisibleTime(sequence, legacyV2S).visibleTime;
        const seqV2S_visible = seqSourceToVisibleTime(sequence, seqV2S).visibleTime;
        if (Math.abs(legacyV2S_visible - seqV2S_visible) <= 1e-6) {
          isCompat = true;
        }
      }

      differences.push({
        category: `visibleToSourceTime_at_${v}`,
        expected: legacyV2S,
        actual: seqV2S,
        difference: v2sDiff,
        result: isCompat ? "pass" : "fail"
      });
      comparisonsRun++;
    }
  }

  const compatible = differences.every(d => d.result === "pass");
  return {
    compatible,
    comparisonsRun,
    differences
  };
};

export const getSequenceGaps = (
  sequence: VideoSequence,
  sourceDuration: number
): Array<{ id: string; type: "trimStart" | "trimEnd" | "cuts"; start: number; end: number }> => {
  const gaps: Array<{ id: string; type: "trimStart" | "trimEnd" | "cuts"; start: number; end: number }> = [];
  if (sequence.clips.length === 0) {
    gaps.push({ id: "trim-all", type: "trimStart", start: 0, end: sourceDuration });
    return gaps;
  }

  // 1. Trim start
  const firstClip = sequence.clips[0];
  if (firstClip.sourceStart > 0) {
    gaps.push({ id: "gap-start", type: "trimStart", start: 0, end: firstClip.sourceStart });
  }

  // 2. Middle gaps
  for (let i = 0; i < sequence.clips.length - 1; i++) {
    const c1 = sequence.clips[i];
    const c2 = sequence.clips[i + 1];
    if (c2.sourceStart > c1.sourceEnd) {
      gaps.push({ id: `gap-${c1.id}-${c2.id}`, type: "cuts", start: c1.sourceEnd, end: c2.sourceStart });
    }
  }

  // 3. Trim end
  const lastClip = sequence.clips[sequence.clips.length - 1];
  if (lastClip.sourceEnd < sourceDuration) {
    gaps.push({ id: "gap-end", type: "trimEnd", start: lastClip.sourceEnd, end: sourceDuration });
  }

  return gaps;
};
