import type { VisibleTranscriptWord } from "../domain/transcriptTypes";

export const PAUSE_THRESHOLD_SECONDS = 1.2;
export const PAUSE_RETAIN_SECONDS = 0.5;

const TIME_EPSILON = 1e-6;

export interface TranscriptPause {
  id: string;
  previousWordId: string;
  nextWordId: string;
  duration: number;
  visibleStart: number;
  visibleEnd: number;
  removalVisibleStart: number;
  removalVisibleEnd: number;
}

export interface PauseShorteningPlan {
  eligible: TranscriptPause[];
  protected: TranscriptPause[];
  totalSecondsRemoved: number;
}

export const detectTranscriptPauses = (
  words: VisibleTranscriptWord[],
  thresholdSeconds = PAUSE_THRESHOLD_SECONDS,
  retainSeconds = PAUSE_RETAIN_SECONDS
): TranscriptPause[] => {
  if (!Number.isFinite(thresholdSeconds) || thresholdSeconds <= 0) {
    throw new Error("Pause threshold must be a positive number");
  }
  if (!Number.isFinite(retainSeconds) || retainSeconds < 0) {
    throw new Error("Retained pause duration cannot be negative");
  }

  const visibleWords = words.filter((visibleWord) =>
    visibleWord.state === "visible"
    && Number.isFinite(visibleWord.visibleStartTime)
    && Number.isFinite(visibleWord.visibleEndTime)
  );
  const pauses: TranscriptPause[] = [];
  const retainedBefore = retainSeconds / 2;
  const retainedAfter = retainSeconds - retainedBefore;

  for (let index = 0; index < visibleWords.length - 1; index++) {
    const previousWord = visibleWords[index];
    const nextWord = visibleWords[index + 1];
    const visibleStart = Number(previousWord.visibleEndTime);
    const visibleEnd = Number(nextWord.visibleStartTime);
    const duration = visibleEnd - visibleStart;

    if (duration + TIME_EPSILON < thresholdSeconds || duration <= retainSeconds + TIME_EPSILON) {
      continue;
    }

    pauses.push({
      id: `pause-${previousWord.word.id}-${nextWord.word.id}`,
      previousWordId: previousWord.word.id,
      nextWordId: nextWord.word.id,
      duration,
      visibleStart,
      visibleEnd,
      removalVisibleStart: visibleStart + retainedBefore,
      removalVisibleEnd: visibleEnd - retainedAfter
    });
  }

  return pauses;
};

export const buildPauseShorteningPlan = (
  pauses: TranscriptPause[],
  visibleStepTimes: number[]
): PauseShorteningPlan => {
  const eligible: TranscriptPause[] = [];
  const protectedPauses: TranscriptPause[] = [];

  for (const pause of pauses) {
    const containsStep = visibleStepTimes.some((stepTime) =>
      Number.isFinite(stepTime)
      && stepTime + TIME_EPSILON >= pause.removalVisibleStart
      && stepTime < pause.removalVisibleEnd - TIME_EPSILON
    );

    if (containsStep) {
      protectedPauses.push(pause);
    } else {
      eligible.push(pause);
    }
  }

  return {
    eligible,
    protected: protectedPauses,
    totalSecondsRemoved: eligible.reduce(
      (total, pause) => total + (pause.removalVisibleEnd - pause.removalVisibleStart),
      0
    )
  };
};
