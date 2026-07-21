import { describe, it, expect } from "vitest";
import { normaliseWhisperResponse } from "../../domain/transcriptionNormalisation";
import { TranscriptionProviderInvalidResponseError } from "../../domain/transcriptionErrors";

describe("Whisper Transcription Normalisation", () => {
  const jobId = "test-job-123";
  const sourceAssetId = "test-asset-456";
  const authDuration = 10.0;

  const validWhisperResponse = {
    language: "english",
    words: [
      { word: "Hello", start: 0.1, end: 0.5 },
      { word: "world", start: 0.6, end: 1.0 }
    ]
  };

  it("successfully normalises valid response", () => {
    const res = normaliseWhisperResponse(jobId, sourceAssetId, authDuration, validWhisperResponse);

    expect(res.schemaVersion).toBe(1);
    expect(res.sourceAssetId).toBe(sourceAssetId);
    expect(res.language).toBe("english");
    expect(res.duration).toBe(authDuration);
    expect(res.words).toHaveLength(2);

    const [w1, w2] = res.words;
    expect(w1.text).toBe("Hello");
    expect(w1.startSourceTime).toBe(0.1);
    expect(w1.endSourceTime).toBe(0.5);
    expect(w1.confidence).toBeNull();
    expect(w1.speakerId).toBeNull();
    // Deterministic ID format: jobId_wIndex_startMs_endMs
    expect(w1.id).toBe(`${jobId}_w0_100_500`);

    expect(w2.text).toBe("world");
    expect(w2.startSourceTime).toBe(0.6);
    expect(w2.endSourceTime).toBe(1.0);
    expect(w2.id).toBe(`${jobId}_w1_600_1000`);
  });

  it("handles missing word parameters by throwing invalid response error", () => {
    const invalidResponse = {
      language: "en",
      words: [{ word: "", start: 0.1, end: 0.5 }]
    };

    expect(() =>
      normaliseWhisperResponse(jobId, sourceAssetId, authDuration, invalidResponse)
    ).toThrow(TranscriptionProviderInvalidResponseError);
  });

  it("throws duration mismatch when words exceed duration or duration doesn't align", () => {
    // If the word ends at 15.0 but authDuration is 10.0, validateSourceTranscript throws
    const longResponse = {
      language: "en",
      words: [
        { word: "too", start: 0.1, end: 0.5 },
        { word: "long", start: 12.0, end: 13.0 }
      ]
    };

    expect(() =>
      normaliseWhisperResponse(jobId, sourceAssetId, authDuration, longResponse)
    ).toThrow(TranscriptionProviderInvalidResponseError);
  });

  it("normalises language code to lowercase", () => {
    const res = normaliseWhisperResponse(jobId, sourceAssetId, authDuration, {
      language: "ENGLISH",
      words: [{ word: "hi", start: 0.1, end: 0.5 }]
    });
    expect(res.language).toBe("english");
  });
});
