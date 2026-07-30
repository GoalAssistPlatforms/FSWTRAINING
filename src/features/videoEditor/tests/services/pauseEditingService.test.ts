import { describe, expect, it } from "vitest";
import type { VisibleTranscriptWord } from "../../domain/transcriptTypes";
import {
  buildPauseShorteningPlan,
  detectTranscriptPauses,
  PAUSE_RETAIN_SECONDS,
  PAUSE_THRESHOLD_SECONDS
} from "../../services/pauseEditingService";

const word = (
  id: string,
  visibleStartTime: number | null,
  visibleEndTime: number | null,
  state: "visible" | "removed" = "visible"
): VisibleTranscriptWord => ({
  word: {
    id,
    text: id,
    startSourceTime: visibleStartTime ?? 0,
    endSourceTime: visibleEndTime ?? 0,
    confidence: null,
    speakerId: null
  },
  state,
  visibleStartTime,
  visibleEndTime,
  nearestVisibleSourceTime: visibleStartTime ?? 0
});

describe("pause editing service", () => {
  it("detects pauses at the fixed threshold and retains half a second", () => {
    const pauses = detectTranscriptPauses([
      word("one", 0, 0.4),
      word("two", 1.6, 1.9)
    ]);

    expect(PAUSE_THRESHOLD_SECONDS).toBe(1.2);
    expect(PAUSE_RETAIN_SECONDS).toBe(0.5);
    expect(pauses).toHaveLength(1);
    expect(pauses[0].duration).toBeCloseTo(1.2);
    expect(pauses[0].removalVisibleStart).toBeCloseTo(0.65);
    expect(pauses[0].removalVisibleEnd).toBeCloseTo(1.35);
  });

  it("does not show shorter pauses", () => {
    expect(detectTranscriptPauses([
      word("one", 0, 0.4),
      word("two", 1.59, 1.9)
    ])).toEqual([]);
  });

  it("ignores removed words and uses the current visible timeline", () => {
    const pauses = detectTranscriptPauses([
      word("one", 0, 0.4),
      word("removed", null, null, "removed"),
      word("two", 2, 2.3)
    ]);

    expect(pauses).toHaveLength(1);
    expect(pauses[0].previousWordId).toBe("one");
    expect(pauses[0].nextWordId).toBe("two");
  });

  it("protects only pauses whose proposed removal contains a guide step", () => {
    const pauses = detectTranscriptPauses([
      word("one", 0, 0.4),
      word("two", 2, 2.3),
      word("three", 4, 4.3)
    ]);
    const plan = buildPauseShorteningPlan(pauses, [1]);

    expect(plan.protected.map((pause) => pause.id)).toEqual(["pause-one-two"]);
    expect(plan.eligible.map((pause) => pause.id)).toEqual(["pause-two-three"]);
    expect(plan.totalSecondsRemoved).toBeCloseTo(1.2);
  });
});
