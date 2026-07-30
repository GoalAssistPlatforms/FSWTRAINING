import { describe, it, expect } from "vitest";
import { validateSequence } from "../../domain/sequenceValidation";
import { VideoSequence, SourceDurationError } from "../../domain/editorTypes";

describe("Sequence Validation", () => {
  it("passes for a valid sequence", () => {
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
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(true);
    expect(res.issues).toHaveLength(0);
  });

  it("identifies invalid schema version", () => {
    const seq: VideoSequence = {
      schemaVersion: 1 as any, // invalid version
      sourceAssetId: "source_123",
      clips: [],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "INVALID_SCHEMA_VERSION")).toBe(true);
  });

  it("identifies missing source asset ID", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "",
      clips: [],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "MISSING_SOURCE_ASSET_ID")).toBe(true);
  });

  it("identifies non-finite clip boundaries", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [
        { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: NaN, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "NON_FINITE_CLIP_VALUES")).toBe(true);
  });

  it("identifies zero duration clip boundaries", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [
        { id: "1", sourceAssetId: "source_123", sourceStart: 10, sourceEnd: 10, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "ZERO_DURATION_CLIP")).toBe(true);
  });

  it("identifies reversed clips (start after end)", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [
        { id: "1", sourceAssetId: "source_123", sourceStart: 15, sourceEnd: 10, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "REVERSED_CLIP")).toBe(true);
  });

  it("identifies clip asset identifier mismatches", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [
        { id: "1", sourceAssetId: "wrong_source_id", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "CLIP_ASSET_MISMATCH")).toBe(true);
  });

  it("identifies duplicate clip identifiers", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [
        { id: "dup", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 5, origin: "source", createdByCommandId: null },
        { id: "dup", sourceAssetId: "source_123", sourceStart: 10, sourceEnd: 15, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "DUPLICATE_CLIP_ID")).toBe(true);
  });

  it("identifies clips outside permitted chronological order", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [
        { id: "2", sourceAssetId: "source_123", sourceStart: 15, sourceEnd: 25, origin: "source", createdByCommandId: null },
        { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "OUT_OF_ORDER_CLIPS")).toBe(true);
  });

  it("identifies overlapping clips", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [
        { id: "1", sourceAssetId: "source_123", sourceStart: 0, sourceEnd: 10, origin: "source", createdByCommandId: null },
        { id: "2", sourceAssetId: "source_123", sourceStart: 8, sourceEnd: 20, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "OVERLAPPING_CLIPS")).toBe(true);
  });

  it("identifies protected range issues (out of bounds, duplicate ID, invalid bounds)", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [],
      protectedRanges: [
        { id: "dup", sourceStart: 0, sourceEnd: 5, reason: "", createdAt: "", createdBy: "" },
        { id: "dup", sourceStart: 10, sourceEnd: 15, reason: "", createdAt: "", createdBy: "" },
        { id: "invalid", sourceStart: 10, sourceEnd: 5, reason: "", createdAt: "", createdBy: "" },
        { id: "out_of_bounds", sourceStart: 10, sourceEnd: 35, reason: "", createdAt: "", createdBy: "" }
      ],
      appliedSuggestionBatchIds: []
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "DUPLICATE_PROTECTED_RANGE_ID")).toBe(true);
    expect(res.issues.some(i => i.code === "INVALID_PROTECTED_RANGE")).toBe(true);
    expect(res.issues.some(i => i.code === "PROTECTED_RANGE_OUT_OF_BOUNDS")).toBe(true);
  });

  it("identifies duplicate suggestion batch identifiers", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [],
      protectedRanges: [],
      appliedSuggestionBatchIds: ["batch_1", "batch_1"]
    };
    const res = validateSequence(seq, 30);
    expect(res.valid).toBe(false);
    expect(res.issues.some(i => i.code === "DUPLICATE_SUGGESTION_BATCH_ID")).toBe(true);
  });

  it("throws SourceDurationError on negative or non-finite source duration", () => {
    const seq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "source_123",
      clips: [],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    expect(() => validateSequence(seq, -10)).toThrow(SourceDurationError);
    expect(() => validateSequence(seq, NaN)).toThrow(SourceDurationError);
  });
});
