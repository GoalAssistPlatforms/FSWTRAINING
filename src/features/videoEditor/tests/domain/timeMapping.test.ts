import { describe, it, expect } from "vitest";
import { visibleTimeToSourceTime, sourceTimeToVisibleTime } from "../../domain/timeMapping";
import { VideoSequence } from "../../domain/editorTypes";

describe("Time Mapping Engine", () => {
  const sequence: VideoSequence = {
    schemaVersion: 2,
    sourceAssetId: "source_123",
    clips: [
      { id: "clip_A", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null },
      { id: "clip_B", sourceAssetId: "source_123", sourceStart: 15, sourceEnd: 25, origin: "source", createdByCommandId: null }
    ],
    protectedRanges: [],
    appliedSuggestionBatchIds: []
  };

  describe("visibleTimeToSourceTime", () => {
    it("maps start of first clip", () => {
      const res = visibleTimeToSourceTime(sequence, 0);
      expect(res.sourceTime).toBe(0);
      expect(res.clipId).toBe("clip_A");
      expect(res.isClamped).toBe(false);
    });

    it("maps middle of first clip", () => {
      const res = visibleTimeToSourceTime(sequence, 5);
      expect(res.sourceTime).toBe(5);
      expect(res.clipId).toBe("clip_A");
      expect(res.isClamped).toBe(false);
    });

    it("maps exact boundary between clips (uses start of next clip)", () => {
      const res = visibleTimeToSourceTime(sequence, 10);
      expect(res.sourceTime).toBe(15);
      expect(res.clipId).toBe("clip_B");
      expect(res.isClamped).toBe(false);
    });

    it("maps middle of second clip", () => {
      const res = visibleTimeToSourceTime(sequence, 12); // 10 from clip_A, 2 from clip_B
      expect(res.sourceTime).toBe(17);
      expect(res.clipId).toBe("clip_B");
      expect(res.isClamped).toBe(false);
    });

    it("maps end of visible timeline", () => {
      const res = visibleTimeToSourceTime(sequence, 20); // 10 from clip_A, 10 from clip_B
      expect(res.sourceTime).toBe(25);
      expect(res.clipId).toBe("clip_B");
      expect(res.isClamped).toBe(false);
    });

    it("clamps negative visible time", () => {
      const res = visibleTimeToSourceTime(sequence, -3);
      expect(res.sourceTime).toBe(0);
      expect(res.isClamped).toBe(true);
    });

    it("clamps visible times beyond duration", () => {
      const res = visibleTimeToSourceTime(sequence, 25);
      expect(res.sourceTime).toBe(25);
      expect(res.isClamped).toBe(true);
    });

    it("handles empty sequence safely", () => {
      const emptySeq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      const res = visibleTimeToSourceTime(emptySeq, 10);
      expect(res.sourceTime).toBe(0);
      expect(res.isClamped).toBe(true);
    });

    it("rejects non-finite visible times", () => {
      expect(() => visibleTimeToSourceTime(sequence, NaN)).toThrow();
      expect(() => visibleTimeToSourceTime(sequence, Infinity)).toThrow();
    });
  });

  describe("sourceTimeToVisibleTime", () => {
    it("maps visible source time", () => {
      const res = sourceTimeToVisibleTime(sequence, 5);
      expect(res.visibleTime).toBe(5);
      expect(res.isVisible).toBe(true);
      expect(res.clipId).toBe("clip_A");
      expect(res.boundaryClipId).toBeNull();
    });

    it("maps removed source time (returns nearest boundary)", () => {
      const res = sourceTimeToVisibleTime(sequence, 12); // inside 10-15 gap
      expect(res.visibleTime).toBe(10);
      expect(res.isVisible).toBe(false);
      expect(res.clipId).toBeNull();
      expect(res.nearestBoundary).toBe("previous");
      expect(res.boundaryClipId).toBe("clip_A");

      const res2 = sourceTimeToVisibleTime(sequence, 14); // inside 10-15 gap
      expect(res2.visibleTime).toBe(10);
      expect(res2.isVisible).toBe(false);
      expect(res2.clipId).toBeNull();
      expect(res2.nearestBoundary).toBe("next");
      expect(res2.boundaryClipId).toBe("clip_B");
    });

    it("maps exact clip start (inclusive)", () => {
      const resStart = sourceTimeToVisibleTime(sequence, 15);
      expect(resStart.visibleTime).toBe(10);
      expect(resStart.isVisible).toBe(true);
      expect(resStart.clipId).toBe("clip_B");
      expect(resStart.boundaryClipId).toBeNull();
    });

    it("maps exact clip end before a removed gap (exclusive)", () => {
      const resEnd = sourceTimeToVisibleTime(sequence, 10);
      expect(resEnd.visibleTime).toBe(10);
      expect(resEnd.isVisible).toBe(false);
      expect(resEnd.clipId).toBeNull();
      expect(resEnd.nearestBoundary).toBe("previous");
      expect(resEnd.boundaryClipId).toBe("clip_A");
    });

    it("maps exact next clip start", () => {
      const resNextStart = sourceTimeToVisibleTime(sequence, 15);
      expect(resNextStart.visibleTime).toBe(10);
      expect(resNextStart.isVisible).toBe(true);
      expect(resNextStart.clipId).toBe("clip_B");
    });

    it("maps exact final clip end (exclusive)", () => {
      const resFinalEnd = sourceTimeToVisibleTime(sequence, 25);
      expect(resFinalEnd.visibleTime).toBe(20); // total visible duration
      expect(resFinalEnd.isVisible).toBe(false);
      expect(resFinalEnd.clipId).toBeNull();
      expect(resFinalEnd.nearestBoundary).toBe("previous");
      expect(resFinalEnd.boundaryClipId).toBe("clip_B");
    });

    it("maps source before first clip", () => {
      const trimmedSeq: VideoSequence = {
        ...sequence,
        clips: [
          { id: "clip_B", sourceAssetId: "source_123", sourceStart: 5, sourceEnd: 15, origin: "source", createdByCommandId: null }
        ]
      };
      const res = sourceTimeToVisibleTime(trimmedSeq, 2);
      expect(res.visibleTime).toBe(0);
      expect(res.isVisible).toBe(false);
      expect(res.clipId).toBeNull();
      expect(res.nearestBoundary).toBe("next");
      expect(res.boundaryClipId).toBe("clip_B");
    });

    it("maps source after final clip", () => {
      const res = sourceTimeToVisibleTime(sequence, 30);
      expect(res.visibleTime).toBe(20);
      expect(res.isVisible).toBe(false);
      expect(res.clipId).toBeNull();
      expect(res.nearestBoundary).toBe("previous");
      expect(res.boundaryClipId).toBe("clip_B");
    });

    it("handles empty sequence safely", () => {
      const emptySeq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      const res = sourceTimeToVisibleTime(emptySeq, 10);
      expect(res.visibleTime).toBe(0);
      expect(res.isVisible).toBe(false);
      expect(res.clipId).toBeNull();
      expect(res.boundaryClipId).toBeNull();
    });

    it("rejects non-finite source times", () => {
      expect(() => sourceTimeToVisibleTime(sequence, NaN)).toThrow();
      expect(() => sourceTimeToVisibleTime(sequence, Infinity)).toThrow();
    });
  });
});
