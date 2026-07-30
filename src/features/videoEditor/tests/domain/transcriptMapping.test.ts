import { describe, it, expect } from "vitest";
import { TranscriptWord, SourceTranscript } from "../../domain/transcriptTypes";
import { VideoSequence } from "../../domain/editorTypes";
import {
  mapTranscriptWordToVisibleState,
  mapTranscriptToVisibleWords,
  buildTimingIndex,
  findActiveTranscriptWord,
  resolveTranscriptWordSeek
} from "../../domain/transcriptMapping";

describe("Transcript Mapping", () => {
  const sequence: VideoSequence = {
    schemaVersion: 2,
    sourceAssetId: "asset-123",
    clips: [
      { id: "c1", sourceAssetId: "asset-123", sourceStart: 1.0, sourceEnd: 4.0, origin: "source", createdByCommandId: null },
      { id: "c2", sourceAssetId: "asset-123", sourceStart: 6.0, sourceEnd: 9.0, origin: "source", createdByCommandId: null }
    ],
    protectedRanges: [],
    appliedSuggestionBatchIds: []
  };

  const wordInside: TranscriptWord = { id: "w1", text: "in", startSourceTime: 2.0, endSourceTime: 3.0, confidence: 0.9, speakerId: "s1" };
  const wordOverlapStart: TranscriptWord = { id: "w2", text: "overlap-start", startSourceTime: 0.5, endSourceTime: 2.0, confidence: 0.9, speakerId: "s1" };
  const wordOverlapEnd: TranscriptWord = { id: "w3", text: "overlap-end", startSourceTime: 3.5, endSourceTime: 4.3, confidence: 0.9, speakerId: "s1" };
  const wordOutside: TranscriptWord = { id: "w4", text: "out", startSourceTime: 4.5, endSourceTime: 5.5, confidence: 0.9, speakerId: "s1" };

  describe("mapTranscriptWordToVisibleState", () => {
    it("maps word fully inside clip as visible", () => {
      const res = mapTranscriptWordToVisibleState(wordInside, sequence);
      expect(res.state).toBe("visible");
      expect(res.visibleStartTime).toBe(1.0); // 2.0 - 1.0 = 1.0
      expect(res.visibleEndTime).toBe(2.0); // 3.0 - 1.0 = 2.0
      expect(res.nearestVisibleSourceTime).toBe(2.0);
    });

    it("clamps boundaries for words overlapping start of clip", () => {
      const res = mapTranscriptWordToVisibleState(wordOverlapStart, sequence);
      expect(res.state).toBe("visible");
      expect(res.visibleStartTime).toBe(0.0); // clamped startSourceTime 1.0 mapped to visibleStartTime = 0.0
      expect(res.visibleEndTime).toBe(1.0); // clamped endSourceTime 2.0 mapped to visibleStartTime = 1.0
      expect(res.nearestVisibleSourceTime).toBe(1.0);
    });

    it("clamps boundaries for words overlapping end of clip", () => {
      const res = mapTranscriptWordToVisibleState(wordOverlapEnd, sequence);
      expect(res.state).toBe("visible");
      expect(res.visibleStartTime).toBe(2.5); // clamped startSourceTime 3.5 mapped to visibleStartTime = 2.5
      expect(res.visibleEndTime).toBe(3.0); // clamped endSourceTime 4.0 mapped to visibleStartTime = 3.0
      expect(res.nearestVisibleSourceTime).toBe(3.5);
    });

    it("resolves outside words as removed with nearest visible source time", () => {
      const res = mapTranscriptWordToVisibleState(wordOutside, sequence);
      expect(res.state).toBe("removed");
      expect(res.visibleStartTime).toBeNull();
      expect(res.visibleEndTime).toBeNull();
      expect(res.nearestVisibleSourceTime).toBe(4.0); // midpoint 5.0 is closer to end of c1 (4.0) than start of c2 (6.0)
    });

    it("evaluates midpoint on clip start as visible", () => {
      // Word: [0.0, 2.0]. Midpoint: 1.0 (exactly on clip c1 start)
      const wordMidOnStart: TranscriptWord = { id: "w_mid_start", text: "midstart", startSourceTime: 0.0, endSourceTime: 2.0, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordMidOnStart, sequence);
      expect(res.state).toBe("visible");
      expect(res.visibleStartTime).toBe(0.0); // Clamped start 1.0 -> visible 0.0
    });

    it("evaluates midpoint on clip end as removed", () => {
      // Word: [3.0, 5.0]. Midpoint: 4.0 (exactly on clip c1 end)
      const wordMidOnEnd: TranscriptWord = { id: "w_mid_end", text: "midend", startSourceTime: 3.0, endSourceTime: 5.0, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordMidOnEnd, sequence);
      expect(res.state).toBe("removed");
    });

    it("marks word beginning in removed content as removed if midpoint outside", () => {
      // Word: [0.0, 0.8]. Midpoint: 0.4 (outside c1 [1.0, 4.0))
      const wordBegRemoved: TranscriptWord = { id: "w_beg_rem", text: "begrem", startSourceTime: 0.0, endSourceTime: 0.8, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordBegRemoved, sequence);
      expect(res.state).toBe("removed");
    });

    it("marks word ending in removed content as removed if midpoint outside", () => {
      // Word: [4.2, 5.0]. Midpoint: 4.6 (outside)
      const wordEndRemoved: TranscriptWord = { id: "w_end_rem", text: "endrem", startSourceTime: 4.2, endSourceTime: 5.0, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordEndRemoved, sequence);
      expect(res.state).toBe("removed");
    });

    it("marks word spanning several clips as removed", () => {
      // Word: [2.0, 7.0]. Midpoint: 4.5 (in the gap between c1 and c2)
      const wordSpanClips: TranscriptWord = { id: "w_span", text: "span", startSourceTime: 2.0, endSourceTime: 7.0, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordSpanClips, sequence);
      expect(res.state).toBe("removed");
    });

    it("clamps start and end to clip boundaries", () => {
      // Word: [0.8, 2.0]. Midpoint: 1.4 (inside c1). Clamps start to 1.0.
      const wordStartClamp: TranscriptWord = { id: "w_clamp_start", text: "clampstart", startSourceTime: 0.8, endSourceTime: 2.0, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordStartClamp, sequence);
      expect(res.visibleStartTime).toBe(0.0); // 1.0 - 1.0 = 0.0
      expect(res.visibleEndTime).toBe(1.0); // 2.0 - 1.0 = 1.0
    });

    it("clamps end to clip end boundary", () => {
      // Word: [3.0, 4.2]. Midpoint: 3.6 (inside c1). Clamps end to 4.0.
      const wordEndClamp: TranscriptWord = { id: "w_clamp_end", text: "clampend", startSourceTime: 3.0, endSourceTime: 4.2, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordEndClamp, sequence);
      expect(res.visibleStartTime).toBe(2.0); // 3.0 - 1.0 = 2.0
      expect(res.visibleEndTime).toBe(3.0); // 4.0 - 1.0 = 3.0
    });

    it("handles clamping producing no positive duration", () => {
      // Clip: [1.0, 1.00000000000000000001) is not practical, but if start >= end:
      const wordNoDur: TranscriptWord = { id: "w_nodur", text: "nodur", startSourceTime: 1.0, endSourceTime: 1.0, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordNoDur, sequence);
      expect(res.state).toBe("removed");
    });

    it("resolves removed word nearest previous boundary", () => {
      // Word: [4.4, 5.4]. Midpoint: 4.9. Closer to c1 end (4.0, distance 0.9) than c2 start (6.0, distance 1.1).
      const wordNearPrev: TranscriptWord = { id: "w_near_prev", text: "nearprev", startSourceTime: 4.4, endSourceTime: 5.4, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordNearPrev, sequence);
      expect(res.nearestVisibleSourceTime).toBe(4.0);
    });

    it("resolves removed word nearest next boundary", () => {
      // Word: [4.6, 5.6]. Midpoint: 5.1. Closer to c2 start (6.0, distance 0.9) than c1 end (4.0, distance 1.1).
      const wordNearNext: TranscriptWord = { id: "w_near_next", text: "nearnext", startSourceTime: 4.6, endSourceTime: 5.6, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordNearNext, sequence);
      expect(res.nearestVisibleSourceTime).toBe(6.0);
    });

    it("resolves equal distance to prefer previous boundary", () => {
      // Word: [4.5, 5.5]. Midpoint: 5.0. Distance to c1 end (4.0) is 1.0. Distance to c2 start (6.0) is 1.0.
      const wordEqualDist: TranscriptWord = { id: "w_equal", text: "equal", startSourceTime: 4.5, endSourceTime: 5.5, confidence: 0.9, speakerId: "s1" };
      const res = mapTranscriptWordToVisibleState(wordEqualDist, sequence);
      expect(res.nearestVisibleSourceTime).toBe(4.0);
    });

    it("handles empty sequence correctly", () => {
      const emptySeq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "asset-123",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      const res = mapTranscriptWordToVisibleState(wordInside, emptySeq);
      expect(res.state).toBe("removed");
      expect(res.nearestVisibleSourceTime).toBe(0.0);
    });

    it("handles start trim correctly", () => {
      const startTrimSeq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "asset-123",
        clips: [
          { id: "c1", sourceAssetId: "asset-123", sourceStart: 2.5, sourceEnd: 4.0, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      // Word inside was [2.0, 3.0]. Midpoint is 2.5, which is inside [2.5, 4.0).
      const res = mapTranscriptWordToVisibleState(wordInside, startTrimSeq);
      expect(res.state).toBe("visible");
      expect(res.visibleStartTime).toBe(0.0); // clamped start 2.5 -> visible 0.0
    });

    it("handles end trim correctly", () => {
      const endTrimSeq: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "asset-123",
        clips: [
          { id: "c1", sourceAssetId: "asset-123", sourceStart: 1.0, sourceEnd: 2.2, origin: "source", createdByCommandId: null }
        ],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };
      // Word inside was [2.0, 3.0]. Midpoint is 2.5, which is outside [1.0, 2.2).
      const res = mapTranscriptWordToVisibleState(wordInside, endTrimSeq);
      expect(res.state).toBe("removed");
    });

    it("enforces input immutability", () => {
      const originalSeqJson = JSON.stringify(sequence);
      const originalWordJson = JSON.stringify(wordInside);
      mapTranscriptWordToVisibleState(wordInside, sequence);
      expect(JSON.stringify(sequence)).toBe(originalSeqJson);
      expect(JSON.stringify(wordInside)).toBe(originalWordJson);
    });
  });

  describe("Timing Index and Binary Search", () => {
    const transcript: SourceTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "one", startSourceTime: 1.5, endSourceTime: 2.0, confidence: 0.9, speakerId: "spk1" },
        { id: "w2", text: "two", startSourceTime: 2.5, endSourceTime: 3.5, confidence: 0.9, speakerId: "spk1" },
        { id: "w3", text: "three", startSourceTime: 4.5, endSourceTime: 5.5, confidence: 0.9, speakerId: "spk1" }, // removed
        { id: "w4", text: "four", startSourceTime: 7.0, endSourceTime: 8.0, confidence: 0.9, speakerId: "spk1" }
      ]
    };

    it("builds timing index only with visible words and searches accurately", () => {
      const visibleWords = mapTranscriptToVisibleWords(transcript, sequence);
      const index = buildTimingIndex(visibleWords, sequence);

      // w1, w2, w4 should be in index, w3 should not.
      expect(index).toHaveLength(3);
      expect(index[0].wordId).toBe("w1");
      expect(index[1].wordId).toBe("w2");
      expect(index[2].wordId).toBe("w4");

      // Binary search checks
      expect(findActiveTranscriptWord(index, 1.8)?.word.id).toBe("w1");
      expect(findActiveTranscriptWord(index, 2.0)).toBeNull();
      expect(findActiveTranscriptWord(index, 3.0)?.word.id).toBe("w2");
      expect(findActiveTranscriptWord(index, 5.0)).toBeNull();
      expect(findActiveTranscriptWord(index, 7.5)?.word.id).toBe("w4");
    });
  });

  describe("Scale Performance Test", () => {
    it("handles 1,000 clips and 10,000 words efficiently", () => {
      const scaleSequence: VideoSequence = {
        schemaVersion: 2,
        sourceAssetId: "scale-asset",
        clips: [],
        protectedRanges: [],
        appliedSuggestionBatchIds: []
      };

      // 1,000 non-overlapping clips of duration 5s with 5s gaps
      for (let i = 0; i < 1000; i++) {
        scaleSequence.clips.push({
          id: `c-${i}`,
          sourceAssetId: "scale-asset",
          sourceStart: i * 10,
          sourceEnd: i * 10 + 5,
          origin: "source",
          createdByCommandId: null
        });
      }

      const words: TranscriptWord[] = [];
      // 10,000 words spread across the timeline
      for (let i = 0; i < 10000; i++) {
        words.push({
          id: `w-${i}`,
          text: `word-${i}`,
          startSourceTime: i * 1.0,
          endSourceTime: i * 1.0 + 0.5,
          confidence: 0.95,
          speakerId: "spk1"
        });
      }

      const scaleTranscript: SourceTranscript = {
        schemaVersion: 1,
        sourceAssetId: "scale-asset",
        language: "en",
        duration: 10000.0,
        words
      };

      const start = performance.now();
      const visibleWords = mapTranscriptToVisibleWords(scaleTranscript, scaleSequence);
      const index = buildTimingIndex(visibleWords, scaleSequence);
      const active = findActiveTranscriptWord(index, 500.2);
      const duration = performance.now() - start;

      expect(visibleWords).toHaveLength(10000);
      expect(index.length).toBeLessThan(10000);
      expect(duration).toBeLessThan(2000); // Performance threshold 2000ms
    });
  });
});
