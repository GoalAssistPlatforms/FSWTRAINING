import { describe, it, expect } from "vitest";
import { validateSourceTranscript } from "../../domain/transcriptValidation";
import { TranscriptInvalidError } from "../../domain/transcriptErrors";
import { SourceTranscript } from "../../domain/transcriptTypes";

describe("Transcript Validation", () => {
  const validTranscript: SourceTranscript = {
    schemaVersion: 1,
    sourceAssetId: "asset-123",
    language: "en",
    duration: 10.0,
    words: [
      { id: "w1", text: "hello", startSourceTime: 0.5, endSourceTime: 1.0, confidence: 0.95, speakerId: "spk-1" },
      { id: "w2", text: "world", startSourceTime: 1.5, endSourceTime: 2.0, confidence: null, speakerId: null }
    ]
  };

  it("passes for a completely valid transcript", () => {
    expect(() => validateSourceTranscript(validTranscript)).not.toThrow();
  });

  it("throws on null or non-object transcript", () => {
    expect(() => validateSourceTranscript(null)).toThrow(TranscriptInvalidError);
    expect(() => validateSourceTranscript("string")).toThrow(TranscriptInvalidError);
  });

  it("throws on invalid schema version", () => {
    const invalid = { ...validTranscript, schemaVersion: 2 };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on missing sourceAssetId", () => {
    const invalid = { ...validTranscript, sourceAssetId: "" };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on missing language", () => {
    const invalid = { ...validTranscript, language: "  " };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on invalid duration", () => {
    const invalid = { ...validTranscript, duration: -1.0 };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on missing words array", () => {
    const invalid = { ...validTranscript, words: "not-an-array" };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on invalid word object", () => {
    const invalid = {
      ...validTranscript,
      words: [null]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on empty word id", () => {
    const invalid = {
      ...validTranscript,
      words: [{ id: " ", text: "hello", startSourceTime: 0.5, endSourceTime: 1.0, confidence: 0.95, speakerId: "spk1" }]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on duplicate word identifiers", () => {
    const invalid = {
      ...validTranscript,
      words: [
        { id: "w1", text: "hello", startSourceTime: 0.5, endSourceTime: 1.0, confidence: 0.95, speakerId: "spk1" },
        { id: "w1", text: "world", startSourceTime: 1.2, endSourceTime: 2.0, confidence: 0.95, speakerId: "spk1" }
      ]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on empty word text", () => {
    const invalid = {
      ...validTranscript,
      words: [{ id: "w1", text: "", startSourceTime: 0.5, endSourceTime: 1.0, confidence: 0.95, speakerId: "spk1" }]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on invalid word start/end times", () => {
    const invalidStart = {
      ...validTranscript,
      words: [{ id: "w1", text: "hello", startSourceTime: -0.1, endSourceTime: 1.0, confidence: 0.95, speakerId: "spk1" }]
    };
    expect(() => validateSourceTranscript(invalidStart)).toThrow(TranscriptInvalidError);

    const invalidEnd = {
      ...validTranscript,
      words: [{ id: "w1", text: "hello", startSourceTime: 0.5, endSourceTime: -1.0, confidence: 0.95, speakerId: "spk1" }]
    };
    expect(() => validateSourceTranscript(invalidEnd)).toThrow(TranscriptInvalidError);

    const swappedTimes = {
      ...validTranscript,
      words: [{ id: "w1", text: "hello", startSourceTime: 1.5, endSourceTime: 1.0, confidence: 0.95, speakerId: "spk1" }]
    };
    expect(() => validateSourceTranscript(swappedTimes)).toThrow(TranscriptInvalidError);
  });

  it("throws when word end time exceeds duration plus tolerance", () => {
    const invalid = {
      ...validTranscript,
      words: [{ id: "w1", text: "hello", startSourceTime: 0.5, endSourceTime: 10.005, confidence: 0.95, speakerId: "spk1" }]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("allows word end time to exceed duration within tolerance", () => {
    const valid = {
      ...validTranscript,
      words: [{ id: "w1", text: "hello", startSourceTime: 0.5, endSourceTime: 10.0005, confidence: 0.95, speakerId: "spk1" }]
    };
    expect(() => validateSourceTranscript(valid)).not.toThrow();
  });

  it("throws on invalid word confidence", () => {
    const invalid = {
      ...validTranscript,
      words: [{ id: "w1", text: "hello", startSourceTime: 0.5, endSourceTime: 1.0, confidence: 1.5, speakerId: "spk1" }]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws on invalid speakerId", () => {
    const invalid = {
      ...validTranscript,
      words: [{ id: "w1", text: "hello", startSourceTime: 0.5, endSourceTime: 1.0, confidence: 0.95, speakerId: "" }]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws when words are not chronological", () => {
    const invalid = {
      ...validTranscript,
      words: [
        { id: "w1", text: "hello", startSourceTime: 2.0, endSourceTime: 3.0, confidence: 0.95, speakerId: "spk1" },
        { id: "w2", text: "world", startSourceTime: 1.0, endSourceTime: 2.0, confidence: 0.95, speakerId: "spk1" }
      ]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("throws when words overlap beyond tolerance", () => {
    const invalid = {
      ...validTranscript,
      words: [
        { id: "w1", text: "hello", startSourceTime: 0.5, endSourceTime: 1.5, confidence: 0.95, speakerId: "spk1" },
        { id: "w2", text: "world", startSourceTime: 1.49, endSourceTime: 2.5, confidence: 0.95, speakerId: "spk1" }
      ]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow(TranscriptInvalidError);
  });

  it("allows words to overlap within tolerance", () => {
    const valid = {
      ...validTranscript,
      words: [
        { id: "w1", text: "hello", startSourceTime: 0.5, endSourceTime: 1.5005, confidence: 0.95, speakerId: "spk1" },
        { id: "w2", text: "world", startSourceTime: 1.5, endSourceTime: 2.5, confidence: 0.95, speakerId: "spk1" }
      ]
    };
    expect(() => validateSourceTranscript(valid)).not.toThrow();
  });
});
