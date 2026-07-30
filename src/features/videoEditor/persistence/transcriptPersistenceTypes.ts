import { SourceTranscript } from "../domain/transcriptTypes";

export interface VideoSourceTranscriptRow {
  id: string;
  account_id: string;
  guide_id: string;
  source_asset_id: string;
  schema_version: number;
  language: string;
  duration: number;
  transcript_json: SourceTranscript;
  revision: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
