import { describe, it, expect } from "vitest";
import {
  createInitialSequence,
  getVisibleDuration,
  removeSourceRange,
  removeVisibleRange,
  restoreSourceRange,
  normaliseSequence,
  doesRangeOverlapProtection
} from "../../domain/sequenceEngine";
import {
  VideoSequence,
  SourceDurationError,
  InvalidTimeRangeError,
  ProtectedRangeConflictError,
  InvalidSequenceError,
  SequenceClip
} from "../../domain/editorTypes";

describe("Sequence Engine", () => {
  describe("createInitialSequence", () => {
    it("creates a single full duration clip", () => {
      const seq = createInitialSequence("source_123", 60.5, () => "clip_1");
      expect(seq.schemaVersion).toBe(2);
      expect(seq.sourceAssetId).toBe("source_123");
      expect(seq.clips).toHaveLength(1);
      expect(seq.clips[0].id).toBe("clip_1");
      expect(seq.clips[0].sourceStart).toBe(0);
      expect(seq.clips[0].sourceEnd).toBe(60.5);
      expect(seq.clips[0].origin).toBe("source");
    });

    it("rejects negative duration", () => {
      expect(() => createInitialSequence("source_123", -10)).toThrow(SourceDurationError);
    });

    it("handles zero duration", () => {
      const seq = createInitialSequence("source_123", 0);
      expect(seq.clips).toHaveLength(0);
    });

    it("generates unique identifiers if no factory is injected", () => {
      const seq1 = createInitialSequence("source_123", 60);
      const seq2 = createInitialSequence("source_123", 60);
      expect(seq1.clips[0].id).toBeDefined();
      expect(seq1.clips[0].id).not.toBe(seq2.clips[0].id);
    });

    it("rejects non-finite duration", () => {
      expect(() => createInitialSequence("source_123", NaN)).toThrow(SourceDurationError);
      expect(() => createInitialSequence("source_123", Infinity)).toThrow(SourceDurationError);
    });
  });

  describe("getVisibleDuration", () => {
    it("handles one clip", () => {
      const seq = createInitialSequence("source_123", 60);
      expect(getVisibleDuration(seq)).toBe(60);
    });

    it("handles several clips with decimal durations", () => {
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [
          { id: "1", sourceAssetId: "source_123", sourceStart: 0.1, sourceEnd: 10.2, origin: "source", createdByCommandId: null },
          { id: "2", sourceAssetId: "source_123", sourceStart: 15.3, sourceEnd: 25.4, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      expect(getVisibleDuration(seq)).toBe(20.2);
    });

    it("handles empty sequence", () => {
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      expect(getVisibleDuration(seq)).toBe(0);
    });
  });

  describe("source removal", () => {
    const baseSeq = createInitialSequence("source_123", 30, () => "clip_1");

    it("removes inside one clip", () => {
      const seq = removeSourceRange(baseSeq, 10, 15, 30, undefined, () => "clip_split");
      expect(seq.clips).toHaveLength(2);
      expect(seq.clips[0].sourceStart).toBe(0);
      expect(seq.clips[0].sourceEnd).toBe(10);
      expect(seq.clips[1].id).toBe("clip_split");
      expect(seq.clips[1].sourceStart).toBe(15);
      expect(seq.clips[1].sourceEnd).toBe(30);
    });

    it("removes beginning of one clip", () => {
      const seq = removeSourceRange(baseSeq, 0, 5, 30);
      expect(seq.clips).toHaveLength(1);
      expect(seq.clips[0].sourceStart).toBe(5);
      expect(seq.clips[0].sourceEnd).toBe(30);
    });

    it("removes end of one clip", () => {
      const seq = removeSourceRange(baseSeq, 25, 30, 30);
      expect(seq.clips).toHaveLength(1);
      expect(seq.clips[0].sourceStart).toBe(0);
      expect(seq.clips[0].sourceEnd).toBe(25);
    });

    it("removes an entire clip", () => {
      const seq = removeSourceRange(baseSeq, 0, 30, 30);
      expect(seq.clips).toHaveLength(0);
    });

    it("removes across several clips", () => {
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [
          { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null },
          { id: "2", sourceAssetId: "source_123", sourceStart: 15, sourceEnd: 25, origin: "source", createdByCommandId: null },
          { id: "3", sourceAssetId: "source_123", sourceStart: 30, sourceEnd: 40, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      const res = removeSourceRange(seq, 8, 22, 40);
      expect(res.clips).toHaveLength(3);
      expect(res.clips[0].sourceStart).toBe(0);
      expect(res.clips[0].sourceEnd).toBe(8);
      expect(res.clips[1].sourceStart).toBe(22);
      expect(res.clips[1].sourceEnd).toBe(25);
      expect(res.clips[2].sourceStart).toBe(30);
      expect(res.clips[2].sourceEnd).toBe(40);
    });

    it("removes outside all visible clips", () => {
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [{ id: "1", sourceAssetId: "source_123", sourceStart: 5, sourceEnd: 15, origin: "source", createdByCommandId: null }],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      const res = removeSourceRange(seq, 0, 4, 30);
      expect(res.clips).toHaveLength(1);
      expect(res.clips[0].sourceStart).toBe(5);
      expect(res.clips[0].sourceEnd).toBe(15);
    });

    it("handles zero duration removal", () => {
      const seq = removeSourceRange(baseSeq, 10, 10, 30);
      expect(seq.clips).toHaveLength(baseSeq.clips.length);
      expect(seq.clips[0].sourceStart).toBe(baseSeq.clips[0].sourceStart);
      expect(seq.clips[0].sourceEnd).toBe(baseSeq.clips[0].sourceEnd);
    });

    it("rejects invalid reversed range", () => {
      expect(() => removeSourceRange(baseSeq, 15, 10, 30)).toThrow(InvalidTimeRangeError);
    });

    it("rejects protected range conflict", () => {
      const seqWithProtection: VideoSequence = {
        ...baseSeq,
        protectedRanges: [{ id: "pr1", sourceStart: 10, sourceEnd: 15, reason: "Speech", createdAt: "", createdBy: "" }]
      };
      expect(() => removeSourceRange(seqWithProtection, 9, 11, 30)).toThrow(ProtectedRangeConflictError);
      expect(() => removeSourceRange(seqWithProtection, 14, 16, 30)).toThrow(ProtectedRangeConflictError);
    });

    it("ensures supplied sequence remains unchanged", () => {
      const copy = JSON.parse(JSON.stringify(baseSeq));
      removeSourceRange(baseSeq, 10, 15, 30);
      expect(baseSeq).toEqual(copy);
    });

    it("rejects non-finite time inputs", () => {
      expect(() => removeSourceRange(baseSeq, NaN, 10, 30)).toThrow(InvalidTimeRangeError);
      expect(() => removeSourceRange(baseSeq, 0, Infinity, 30)).toThrow(InvalidTimeRangeError);
    });
  });

  describe("visible removal", () => {
    const baseSeq = createInitialSequence("source_123", 30, () => "clip_1");

    it("removes inside the first clip", () => {
      const seq = removeVisibleRange(baseSeq, 10, 15, 30, undefined, () => "clip_split");
      expect(seq.clips).toHaveLength(2);
      expect(seq.clips[0].sourceStart).toBe(0);
      expect(seq.clips[0].sourceEnd).toBe(10);
      expect(seq.clips[1].id).toBe("clip_split");
      expect(seq.clips[1].sourceStart).toBe(15);
      expect(seq.clips[1].sourceEnd).toBe(30);
    });

    it("removes across a cut boundary", () => {
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [
          { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null },
          { id: "2", sourceAssetId: "source_123", sourceStart: 15, sourceEnd: 25, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      const res = removeVisibleRange(seq, 8, 12, 30);
      expect(res.clips).toHaveLength(2);
      expect(res.clips[0].sourceStart).toBe(0);
      expect(res.clips[0].sourceEnd).toBe(8);
      expect(res.clips[1].sourceStart).toBe(17);
      expect(res.clips[1].sourceEnd).toBe(25);
    });

    it("removes across three clips", () => {
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [
          { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 5, origin: "source", createdByCommandId: null },
          { id: "2", sourceAssetId: "source_123", sourceStart: 10, sourceEnd: 15, origin: "source", createdByCommandId: null },
          { id: "3", sourceAssetId: "source_123", sourceStart: 20, sourceEnd: 25, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      const res = removeVisibleRange(seq, 3, 12, 30);
      expect(res.clips).toHaveLength(2);
      expect(res.clips[0].sourceStart).toBe(0);
      expect(res.clips[0].sourceEnd).toBe(3);
      expect(res.clips[1].sourceStart).toBe(22);
      expect(res.clips[1].sourceEnd).toBe(25);
    });

    it("removes from visible start", () => {
      const seq = removeVisibleRange(baseSeq, 0, 5, 30);
      expect(seq.clips).toHaveLength(1);
      expect(seq.clips[0].sourceStart).toBe(5);
    });

    it("removes to visible end", () => {
      const seq = removeVisibleRange(baseSeq, 25, 30, 30);
      expect(seq.clips).toHaveLength(1);
      expect(seq.clips[0].sourceEnd).toBe(25);
    });

    it("clamps selection outside visible duration", () => {
      const seq = removeVisibleRange(baseSeq, 20, 50, 30);
      expect(seq.clips).toHaveLength(1);
      expect(seq.clips[0].sourceEnd).toBe(20);
    });

    it("supplied sequence remains unchanged", () => {
      const copy = JSON.parse(JSON.stringify(baseSeq));
      removeVisibleRange(baseSeq, 5, 10, 30);
      expect(baseSeq).toEqual(copy);
    });

    it("rejects non-finite time inputs", () => {
      expect(() => removeVisibleRange(baseSeq, NaN, 10, 30)).toThrow(InvalidTimeRangeError);
    });
  });

  describe("restoring source range", () => {
    const baseSeq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [
        { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null },
        { id: "2", sourceAssetId: "source_123", sourceStart: 20, sourceEnd: 30, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    it("restores one removed gap", () => {
      const seq = restoreSourceRange(baseSeq, 10, 20, 30, undefined, () => "restored_clip");
      expect(seq.clips).toHaveLength(1);
      expect(seq.clips[0].sourceStart).toBe(0);
      expect(seq.clips[0].sourceEnd).toBe(30);
    });

    it("restores a partial gap", () => {
      const seq = restoreSourceRange(baseSeq, 12, 18, 30, undefined, () => "restored_clip");
      expect(seq.clips).toHaveLength(3);
      expect(seq.clips[0].sourceStart).toBe(0);
      expect(seq.clips[0].sourceEnd).toBe(10);
      expect(seq.clips[1].id).toBe("restored_clip");
      expect(seq.clips[1].sourceStart).toBe(12);
      expect(seq.clips[1].sourceEnd).toBe(18);
      expect(seq.clips[1].origin).toBe("restored");
      expect(seq.clips[2].sourceStart).toBe(20);
      expect(seq.clips[2].sourceEnd).toBe(30);
    });

    it("restores an already visible range", () => {
      const seq = restoreSourceRange(baseSeq, 2, 8, 30);
      expect(seq.clips).toHaveLength(2);
      expect(seq.clips[0].sourceStart).toBe(0);
      expect(seq.clips[0].sourceEnd).toBe(10);
      expect(seq.clips[1].sourceStart).toBe(20);
      expect(seq.clips[1].sourceEnd).toBe(30);
    });

    it("clamps boundaries during restore", () => {
      const seq = restoreSourceRange(baseSeq, -5, 35, 30, undefined, () => "restored_clip");
      expect(seq.clips).toHaveLength(1);
      expect(seq.clips[0].sourceStart).toBe(0);
      expect(seq.clips[0].sourceEnd).toBe(30);
    });

    it("supplied sequence remains unchanged", () => {
      const copy = JSON.parse(JSON.stringify(baseSeq));
      restoreSourceRange(baseSeq, 10, 20, 30);
      expect(baseSeq).toEqual(copy);
    });

    it("rejects non-finite time inputs", () => {
      expect(() => restoreSourceRange(baseSeq, NaN, 10, 30)).toThrow(InvalidTimeRangeError);
    });
  });

  describe("normalisation rules", () => {
    it("merges adjacent compatible clips", () => {
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [
          { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null },
          { id: "2", sourceAssetId: "source_123", sourceStart: 10, sourceEnd: 20, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      const res = normaliseSequence(seq, 30);
      expect(res.clips).toHaveLength(1);
      expect(res.clips[0].sourceStart).toBe(0);
      expect(res.clips[0].sourceEnd).toBe(20);
    });

    it("rejects overlapping or out of order clips", () => {
      const seqOverlap: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [
          { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null },
          { id: "2", sourceAssetId: "source_123", sourceStart: 8, sourceEnd: 20, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      expect(() => normaliseSequence(seqOverlap, 30)).toThrow(InvalidSequenceError);

      const seqOutOfOrder: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [
          { id: "2", sourceAssetId: "source_123", sourceStart: 15, sourceEnd: 25, origin: "source", createdByCommandId: null },
          { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      expect(() => normaliseSequence(seqOutOfOrder, 30)).toThrow(InvalidSequenceError);
    });

    it("rejects negative boundaries or out of duration clip ends", () => {
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [
          { id: "1", sourceAssetId: "source_123", sourceStart: -5, sourceEnd: 10, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      expect(() => normaliseSequence(seq, 30)).toThrow(InvalidSequenceError);

      const seq2: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips: [
          { id: "1", sourceAssetId: "source_123", sourceStart: 5, sourceEnd: 35, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      expect(() => normaliseSequence(seq2, 30)).toThrow(InvalidSequenceError);
    });
  });

  describe("performance benchmarks", () => {
    it("supports 1000 clips without major delay", () => {
      const clips: SequenceClip[] = [];
      for (let i = 0; i < 1000; i++) {
        clips.push({
          id: `clip_${i}`,
          sourceAssetId: "source_123",
          sourceStart: i * 2,
          sourceEnd: i * 2 + 1,
          origin: "source",
          createdByCommandId: null
        });
      }
      const seq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "source_123",
        clips,
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };

      const start = Date.now();
      const dur = getVisibleDuration(seq);
      const end = Date.now();

      expect(dur).toBe(1000);
      expect(end - start).toBeLessThan(100);
    });
  });
});
