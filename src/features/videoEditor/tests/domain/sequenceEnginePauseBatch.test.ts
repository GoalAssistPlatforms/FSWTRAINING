import { describe, expect, it } from "vitest";
import { createInitialSequence, removeVisibleRanges } from "../../domain/sequenceEngine";

describe("removeVisibleRanges", () => {
  it("removes several ranges without shifting earlier coordinates", () => {
    const sequence = createInitialSequence("asset", 10, () => "initial");
    const result = removeVisibleRanges(
      sequence,
      [
        { visibleStart: 1, visibleEnd: 2 },
        { visibleStart: 6, visibleEnd: 8 }
      ],
      10
    );

    expect(result.clips.map((clip) => [clip.sourceStart, clip.sourceEnd])).toEqual([
      [0, 1],
      [2, 6],
      [8, 10]
    ]);
  });

  it("rejects overlapping ranges", () => {
    const sequence = createInitialSequence("asset", 10, () => "initial");
    expect(() => removeVisibleRanges(
      sequence,
      [
        { visibleStart: 1, visibleEnd: 3 },
        { visibleStart: 2, visibleEnd: 4 }
      ],
      10
    )).toThrow("Removal ranges cannot overlap");
  });
});
