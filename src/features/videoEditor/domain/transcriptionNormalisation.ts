import { SourceTranscript, TranscriptWord } from "./transcriptTypes";
import { validateSourceTranscript } from "./transcriptValidation";
import { TranscriptionProviderInvalidResponseError } from "./transcriptionErrors";

export function normaliseWhisperResponse(
  jobId: string,
  sourceAssetId: string,
  authDuration: number,
  whisperJson: any
): SourceTranscript {
  if (!whisperJson || typeof whisperJson !== "object") {
    throw new TranscriptionProviderInvalidResponseError("Whisper JSON must be a non-null object");
  }

  // Support verbose_json having segments and words
  const rawWords = whisperJson.words || [];
  if (!Array.isArray(rawWords)) {
    throw new TranscriptionProviderInvalidResponseError("Whisper words property must be an array");
  }

  const words: TranscriptWord[] = rawWords.map((w: any, index: number) => {
    if (!w || typeof w !== "object") {
      throw new TranscriptionProviderInvalidResponseError(`Word at index ${index} is not an object`);
    }

    const start = Number(w.start);
    const end = Number(w.end);
    const text = String(w.word || "").trim();

    if (isNaN(start) || isNaN(end) || !text) {
      throw new TranscriptionProviderInvalidResponseError(`Word at index ${index} has invalid parameters`);
    }

    // Deterministic word ID based on job ID, word index, and rounded timings
    const startMs = Math.round(start * 1000);
    const endMs = Math.round(end * 1000);
    const id = `${jobId}_w${index}_${startMs}_${endMs}`;

    return {
      id,
      text,
      startSourceTime: start,
      endSourceTime: end,
      confidence: null,
      speakerId: null
    };
  });

  const language = String(whisperJson.language || "en").toLowerCase();

  const transcript: SourceTranscript = {
    schemaVersion: 1,
    sourceAssetId,
    language,
    duration: authDuration,
    words
  };

  // Run Package 05 validation
  try {
    validateSourceTranscript(transcript);
  } catch (err: any) {
    throw new TranscriptionProviderInvalidResponseError(`Package 05 validation failed: ${err.message}`);
  }

  return transcript;
}
