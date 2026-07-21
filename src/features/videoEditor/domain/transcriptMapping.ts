import { SourceTranscript, TranscriptWord, VisibleTranscriptWord } from "./transcriptTypes";
import { VideoSequence, SequenceClip } from "./editorTypes";
import { sourceTimeToVisibleTime } from "./timeMapping";

export function mapTranscriptWordToVisibleState(
  word: TranscriptWord,
  sequence: VideoSequence
): VisibleTranscriptWord {
  const midpoint = (word.startSourceTime + word.endSourceTime) / 2;

  // Use start-inclusive, end-exclusive boundaries to find containing clip
  const containingClip = sequence.clips.find(
    (clip) => midpoint >= clip.sourceStart && midpoint < clip.sourceEnd
  );

  if (containingClip) {
    const effectiveStartSourceTime = Math.max(word.startSourceTime, containingClip.sourceStart);
    const effectiveEndSourceTime = Math.min(word.endSourceTime, containingClip.sourceEnd);

    if (effectiveStartSourceTime < effectiveEndSourceTime) {
      const visibleStartRes = sourceTimeToVisibleTime(sequence, effectiveStartSourceTime);
      const visibleEndRes = sourceTimeToVisibleTime(sequence, effectiveEndSourceTime);

      return {
        word,
        state: "visible",
        visibleStartTime: visibleStartRes.visibleTime,
        visibleEndTime: visibleEndRes.visibleTime,
        nearestVisibleSourceTime: effectiveStartSourceTime
      };
    }
  }

  // Removed word resolution
  // Find the nearest visible source boundary across all clips.
  // Equal distance boundary resolution prefers the previous boundary.
  let nearestVisibleSourceTime = 0;
  let minDistance = Infinity;

  for (const clip of sequence.clips) {
    const distStart = Math.abs(clip.sourceStart - midpoint);
    const distEnd = Math.abs(clip.sourceEnd - midpoint);

    // Evaluate start boundary
    if (distStart < minDistance) {
      minDistance = distStart;
      nearestVisibleSourceTime = clip.sourceStart;
    } else if (Math.abs(distStart - minDistance) < 1e-9) {
      // Equal distance: prefer previous boundary (<= midpoint)
      if (clip.sourceStart <= midpoint && nearestVisibleSourceTime > midpoint) {
        nearestVisibleSourceTime = clip.sourceStart;
      }
    }

    // Evaluate end boundary
    if (distEnd < minDistance) {
      minDistance = distEnd;
      nearestVisibleSourceTime = clip.sourceEnd;
    } else if (Math.abs(distEnd - minDistance) < 1e-9) {
      // Equal distance: prefer previous boundary (<= midpoint)
      if (clip.sourceEnd <= midpoint && nearestVisibleSourceTime > midpoint) {
        nearestVisibleSourceTime = clip.sourceEnd;
      }
    }
  }

  return {
    word,
    state: "removed",
    visibleStartTime: null,
    visibleEndTime: null,
    nearestVisibleSourceTime
  };
}

export function mapTranscriptToVisibleWords(
  transcript: SourceTranscript,
  sequence: VideoSequence
): VisibleTranscriptWord[] {
  // Input immutability check
  return (transcript?.words || []).map((w) => mapTranscriptWordToVisibleState(w, sequence));
}

export interface TimingIndexEntry {
  wordId: string;
  start: number; // effectiveStartSourceTime
  end: number;   // effectiveEndSourceTime
  visibleWord: VisibleTranscriptWord;
}

export function buildTimingIndex(
  visibleWords: VisibleTranscriptWord[],
  sequence: VideoSequence
): TimingIndexEntry[] {
  const index: TimingIndexEntry[] = [];
  for (const vw of visibleWords) {
    if (vw.state !== "visible") continue;

    const midpoint = (vw.word.startSourceTime + vw.word.endSourceTime) / 2;
    const containingClip = sequence.clips.find(
      (clip) => midpoint >= clip.sourceStart && midpoint < clip.sourceEnd
    );

    if (containingClip) {
      const effectiveStartSourceTime = Math.max(vw.word.startSourceTime, containingClip.sourceStart);
      const effectiveEndSourceTime = Math.min(vw.word.endSourceTime, containingClip.sourceEnd);
      if (effectiveStartSourceTime < effectiveEndSourceTime) {
        index.push({
          wordId: vw.word.id,
          start: effectiveStartSourceTime,
          end: effectiveEndSourceTime,
          visibleWord: vw
        });
      }
    }
  }
  return index;
}

export function findActiveTranscriptWord(
  timingIndex: TimingIndexEntry[],
  sourceTime: number
): VisibleTranscriptWord | null {
  let low = 0;
  let high = timingIndex.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const entry = timingIndex[mid];

    // start inclusive, end exclusive boundary checks
    if (sourceTime >= entry.start && sourceTime < entry.end) {
      return entry.visibleWord;
    }
    if (sourceTime < entry.start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return null;
}

export function resolveTranscriptWordSeek(
  vw: VisibleTranscriptWord,
  sequence: VideoSequence
): number {
  if (vw.state === "visible") {
    // Seek to first visible source point (effectiveStartSourceTime)
    const midpoint = (vw.word.startSourceTime + vw.word.endSourceTime) / 2;
    const containingClip = sequence.clips.find(
      (clip) => midpoint >= clip.sourceStart && midpoint < clip.sourceEnd
    );
    if (containingClip) {
      return Math.max(vw.word.startSourceTime, containingClip.sourceStart);
    }
  }
  return vw.nearestVisibleSourceTime;
}
