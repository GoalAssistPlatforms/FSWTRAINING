import { describe, it, expect } from "vitest";
import { migrateVideoEditsV1ToV2 } from "../../migrations/migrateVideoEditsV1ToV2";
import { getVisibleSegments } from "../../../../utils/videoPlaybackController";
import { LegacyVideoEdits, InvalidSequenceError, InvalidTimeRangeError, SourceDurationError } from "../../domain/editorTypes";

describe("Legacy Edits Migration", () => {
  const sourceDuration = 100.0;
  const sourceAssetId = "source_123";

  it("handles no trim and no cuts", () => {
    const legacy: LegacyVideoEdits = {
      trimStart: 0,
      trimEnd: null,
      cuts: []
    };
    const seq = migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy, () => "clip_1");
    expect(seq.clips).toHaveLength(1);
    expect(seq.clips[0].id).toBe("clip_1");
    expect(seq.clips[0].sourceStart).toBe(0);
    expect(seq.clips[0].sourceEnd).toBe(100);
  });

  it("handles start trim only", () => {
    const legacy: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: null,
      cuts: []
    };
    const seq = migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy, () => "clip_1");
    expect(seq.clips).toHaveLength(1);
    expect(seq.clips[0].sourceStart).toBe(10);
    expect(seq.clips[0].sourceEnd).toBe(100);
  });

  it("handles end trim only", () => {
    const legacy: LegacyVideoEdits = {
      trimStart: 0,
      trimEnd: 90,
      cuts: []
    };
    const seq = migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy, () => "clip_1");
    expect(seq.clips).toHaveLength(1);
    expect(seq.clips[0].sourceStart).toBe(0);
    expect(seq.clips[0].sourceEnd).toBe(90);
  });

  it("handles start and end trim", () => {
    const legacy: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: 90,
      cuts: []
    };
    const seq = migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy, () => "clip_1");
    expect(seq.clips).toHaveLength(1);
    expect(seq.clips[0].sourceStart).toBe(10);
    expect(seq.clips[0].sourceEnd).toBe(90);
  });

  it("handles one cut", () => {
    const legacy: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: 90,
      cuts: [{ start: 30, end: 40 }]
    };
    let counter = 0;
    const seq = migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy, () => `clip_${++counter}`);
    expect(seq.clips).toHaveLength(2);
    expect(seq.clips[0].id).toBe("clip_1");
    expect(seq.clips[0].sourceStart).toBe(10);
    expect(seq.clips[0].sourceEnd).toBe(30);
    expect(seq.clips[1].id).toBe("clip_2");
    expect(seq.clips[1].sourceStart).toBe(40);
    expect(seq.clips[1].sourceEnd).toBe(90);
  });

  it("handles overlapping and adjacent cuts", () => {
    const legacy: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: 90,
      cuts: [
        { start: 30, end: 40 },
        { start: 38, end: 48 }, // Overlapping
        { start: 60, end: 70 },
        { start: 70, end: 80 }  // Adjacent
      ]
    };
    let counter = 0;
    const seq = migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy, () => `clip_${++counter}`);
    expect(seq.clips).toHaveLength(3);
    expect(seq.clips[0].sourceStart).toBe(10);
    expect(seq.clips[0].sourceEnd).toBe(30);
    expect(seq.clips[1].sourceStart).toBe(48);
    expect(seq.clips[1].sourceEnd).toBe(60);
    expect(seq.clips[2].sourceStart).toBe(80);
    expect(seq.clips[2].sourceEnd).toBe(90);
  });

  it("ignores cuts outside trim boundaries", () => {
    const legacy: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: 90,
      cuts: [
        { start: 2, end: 8 },    // completely before trimStart
        { start: 92, end: 98 },  // completely after trimEnd
        { start: 5, end: 15 }    // partially overlapping start
      ]
    };
    const seq = migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy, () => "clip_1");
    expect(seq.clips).toHaveLength(1);
    expect(seq.clips[0].sourceStart).toBe(15);
    expect(seq.clips[0].sourceEnd).toBe(90);
  });

  it("handles cut covering the entire trimmed range", () => {
    const legacy: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: 90,
      cuts: [{ start: 5, end: 95 }]
    };
    const seq = migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy);
    expect(seq.clips).toHaveLength(0);
  });

  it("does not mutate the legacy input data", () => {
    const legacy: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: 90,
      cuts: [{ start: 30, end: 40 }]
    };
    const copy = JSON.parse(JSON.stringify(legacy));
    migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy);
    expect(legacy).toEqual(copy);
  });

  it("rejects version 2 input with InvalidSequenceError", () => {
    const alreadyV2 = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [{ id: "123", sourceStart: 5, sourceEnd: 15 }]
    };
    expect(() => migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, alreadyV2 as any)).toThrow(InvalidSequenceError);
  });

  it("rejects non-finite boundaries and source duration", () => {
    const legacyNaN: LegacyVideoEdits = {
      trimStart: NaN,
      trimEnd: 90,
      cuts: []
    };
    expect(() => migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacyNaN)).toThrow(InvalidTimeRangeError);
    expect(() => migrateVideoEditsV1ToV2(sourceAssetId, Infinity, { trimStart: 0, trimEnd: 10, cuts: [] })).toThrow(SourceDurationError);
  });

  describe("Compatibility checks with legacy getVisibleSegments", () => {
    it("produces identical visible segment coordinates and durations", () => {
      const fixtures: LegacyVideoEdits[] = [
        { trimStart: 0, trimEnd: null, cuts: [] },
        { trimStart: 10, trimEnd: 90, cuts: [] },
        { trimStart: 10, trimEnd: 90, cuts: [{ start: 30, end: 40 }] },
        { trimStart: 10, trimEnd: 90, cuts: [{ start: 30, end: 40 }, { start: 38, end: 48 }, { start: 60, end: 70 }] }
      ];

      for (const legacy of fixtures) {
        const legacySegments = getVisibleSegments(sourceDuration, legacy);
        const seq = migrateVideoEditsV1ToV2(sourceAssetId, sourceDuration, legacy);

        const newSegments = seq.clips.map(c => [c.sourceStart, c.sourceEnd]);
        expect(newSegments).toEqual(legacySegments);

        const legacyDuration = legacySegments.reduce((sum, [s, e]) => sum + (e - s), 0);
        const newDuration = seq.clips.reduce((sum, c) => sum + (c.sourceEnd - c.sourceStart), 0);
        expect(newDuration).toBe(legacyDuration);
      }
    });
  });
});
