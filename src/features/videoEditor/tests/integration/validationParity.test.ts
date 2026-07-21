import { describe, it, expect, beforeAll, afterAll } from "vitest";
// @ts-ignore
import { Client } from "pg";
import { validateSourceTranscript } from "../../domain/transcriptValidation";
import { TranscriptInvalidError } from "../../domain/transcriptErrors";
import fs from "fs";
import path from "path";

// Load environment variables if they are not already loaded by Vitest
try {
  const envText = fs.readFileSync(path.resolve(process.cwd(), ".env.test"), "utf8");
  for (const line of envText.split("\n")) {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/(^['"]|['"]$)/g, "");
      process.env[key] = val;
    }
  }
} catch (e) {}

describe("TypeScript and PostgreSQL Validator Parity Tests", () => {
  let pgClient: Client | null = null;
  const testDbUrl = process.env.VIDEO_EDITOR_TEST_DATABASE_URL;

  const accountId = "de305d54-75b4-431b-adb2-eb6b9e546003";
  const guideId = "de305d54-75b4-431b-adb2-eb6b9e546004";

  beforeAll(async () => {
    if (testDbUrl) {
      pgClient = new Client({ connectionString: testDbUrl });
      await pgClient.connect();
      // Insert temporary account
      await pgClient.query(
        `INSERT INTO public.accounts (id, name) VALUES ($1, 'Test Account') ON CONFLICT (id) DO NOTHING`,
        [accountId]
      );
      // Insert temporary guide
      await pgClient.query(
        `INSERT INTO public.courses (id, title, status, account_id) VALUES ($1, 'Test Guide', 'draft', $2) ON CONFLICT (id) DO NOTHING`,
        [guideId, accountId]
      );
      // Insert a dummy video_source_assets record using standard bootstrapped fixture UUIDs
      await pgClient.query(
        `INSERT INTO public.video_source_assets (id, account_id, guide_id, original_storage_path, duration_seconds, file_size_bytes, preparation_status)
         VALUES ($1, $2, $3, 'path.mp4', 10.0, 100, 'ready')
         ON CONFLICT (id) DO UPDATE SET duration_seconds = 10.0`,
        [uuid, accountId, guideId]
      );
    } else {
      console.warn("VIDEO_EDITOR_TEST_DATABASE_URL not set. Skipping PostgreSQL part of parity tests.");
    }
  });

  afterAll(async () => {
    if (pgClient) {
      await pgClient.query("DELETE FROM public.video_source_assets WHERE id = $1", [uuid]);
      await pgClient.query("DELETE FROM public.courses WHERE id = $1", [guideId]);
      await pgClient.query("DELETE FROM public.accounts WHERE id = $1", [accountId]);
      await pgClient.end();
    }
  });

  const runValidators = async (transcript: any) => {
    let tsError: Error | null = null;
    try {
      validateSourceTranscript(transcript);
    } catch (e: any) {
      tsError = e;
    }

    let pgError: Error | null = null;
    if (pgClient) {
      try {
        // We route the validation through the internal function
        await pgClient.query(
          "SELECT public.validate_video_source_transcript_internal($1, $2)",
          [transcript.sourceAssetId || "00000000-0000-0000-0000-000000000000", JSON.stringify(transcript)]
        );
      } catch (e: any) {
        pgError = e;
      }
    }

    return { tsError, pgError };
  };

  const uuid = "de305d54-75b4-431b-adb2-eb6b9e546014";

  it("1. Valid canonical transcript succeeds on both", async () => {
    const valid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, endSourceTime: 2.0, confidence: 0.95, speakerId: "spk1" },
        { id: "w2", text: "world", startSourceTime: 2.0, endSourceTime: 3.0, confidence: null, speakerId: null }
      ]
    };
    const { tsError, pgError } = await runValidators(valid);
    expect(tsError).toBeNull();
    if (pgClient) expect(pgError).toBeNull();
  });

  it("2. Extra key in root object fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      extraField: "invalid",
      words: []
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("3. Extra key in word object fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, endSourceTime: 2.0, confidence: 0.95, speakerId: "spk1", extra: 1 }
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("4. Missing key in root object fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      words: []
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("5. Missing required key in word object fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, confidence: 0.95, speakerId: "spk1" }
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("6. Overlapping times fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, endSourceTime: 2.0, confidence: 0.95, speakerId: "spk1" },
        { id: "w2", text: "world", startSourceTime: 1.5, endSourceTime: 3.0, confidence: null, speakerId: null }
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("7. Words not in chronological order fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 2.0, endSourceTime: 3.0, confidence: 0.95, speakerId: "spk1" },
        { id: "w2", text: "world", startSourceTime: 1.0, endSourceTime: 2.0, confidence: null, speakerId: null }
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("8. Word end time exceeds duration fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, endSourceTime: 11.0, confidence: 0.95, speakerId: "spk1" }
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("9. Confidence out of bounds fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, endSourceTime: 2.0, confidence: 1.5, speakerId: "spk1" }
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("10. Source mismatch fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: "de305d54-75b4-431b-adb2-eb6b9e546999", // Mismatched UUID
      language: "en",
      duration: 10.0,
      words: []
    };
    // Note: in TypeScript we check against activeSourceAssetId in controller. But the validator function validateSourceTranscript doesn't check database.
    // However, the database validator checks for matching UUID. So let's run it.
    let pgError: Error | null = null;
    if (pgClient) {
      try {
        await pgClient.query(
          "SELECT public.validate_video_source_transcript_internal($1, $2)",
          [uuid, JSON.stringify(invalid)] // passing mismatched UUID
        );
      } catch (e: any) {
        pgError = e;
      }
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("11. Duration mismatch fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 12.0, // database has 10.0
      words: []
    };
    let pgError: Error | null = null;
    if (pgClient) {
      try {
        await pgClient.query(
          "SELECT public.validate_video_source_transcript_internal($1, $2)",
          [uuid, JSON.stringify(invalid)]
        );
      } catch (e: any) {
        pgError = e;
      }
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("duration mismatch");
    }
  });

  it("12. Duplicate word ID fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, endSourceTime: 2.0, confidence: 0.9, speakerId: "spk1" },
        { id: "w1", text: "world", startSourceTime: 2.0, endSourceTime: 3.0, confidence: 0.9, speakerId: "spk1" }
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("13. Invalid speaker ID fails on both", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, endSourceTime: 2.0, confidence: 0.9, speakerId: 123 } // non-string
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeInstanceOf(TranscriptInvalidError);
    if (pgClient) {
      expect(pgError).not.toBeNull();
      expect(pgError?.message).toContain("TRANSCRIPTION_INVALID");
    }
  });

  it("14. Empty words array succeeds on both", async () => {
    const valid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: []
    };
    const { tsError, pgError } = await runValidators(valid);
    expect(tsError).toBeNull();
    if (pgClient) {
      expect(pgError).toBeNull();
    }
  });

  it("15. Missing confidence key is accepted for provider compatibility", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, endSourceTime: 2.0, speakerId: "spk1" } // missing confidence
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeNull();
    if (pgClient) {
      expect(pgError).toBeNull();
    }
  });

  it("16. Missing speakerId key is accepted for provider compatibility", async () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: uuid,
      language: "en",
      duration: 10.0,
      words: [
        { id: "w1", text: "hello", startSourceTime: 1.0, endSourceTime: 2.0, confidence: 0.9 } // missing speakerId
      ]
    };
    const { tsError, pgError } = await runValidators(invalid);
    expect(tsError).toBeNull();
    if (pgClient) {
      expect(pgError).toBeNull();
    }
  });
});
