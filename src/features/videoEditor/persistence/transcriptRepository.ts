import { supabase } from "../../../api/supabase";
import { SourceTranscript } from "../domain/transcriptTypes";
import { mapDatabaseError } from "./transcriptPersistenceErrors";
import { TranscriptPersistenceInvalidError } from "../domain/transcriptErrors";
import { validateSourceTranscript } from "../domain/transcriptValidation";

export async function getTranscriptForSourceAsset(
  guideId: string,
  sourceAssetId: string
): Promise<SourceTranscript | null> {
  const { data, error } = await supabase.rpc("get_video_source_transcript", {
    p_guide_id: guideId,
    p_source_asset_id: sourceAssetId
  });

  if (error) {
    throw mapDatabaseError(error);
  }

  if (!data || data.length === 0) {
    return null;
  }

  const row = data[0];
  const transcriptJson = row.transcript_json;

  try {
    validateSourceTranscript(transcriptJson);
  } catch (e: any) {
    throw new TranscriptPersistenceInvalidError(
      `Invalid persisted transcript data: ${e.message}`
    );
  }

  return transcriptJson;
}

export async function upsertTranscriptForSourceAsset(
  guideId: string,
  sourceAssetId: string,
  transcript: SourceTranscript
): Promise<number> {
  // Validate transcript prior to upserting
  validateSourceTranscript(transcript);

  const { data, error } = await supabase.rpc("upsert_video_source_transcript", {
    p_guide_id: guideId,
    p_source_asset_id: sourceAssetId,
    p_transcript_json: transcript
  });

  if (error) {
    throw mapDatabaseError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.revision !== "number") {
    throw new Error("Invalid response from database upsert function");
  }

  return row.revision;
}
