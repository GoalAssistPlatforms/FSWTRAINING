import { TranscriptionJob } from "../domain/transcriptionTypes";
import { mapDbJobToDomain } from "./transcriptionPersistenceTypes";
import { handlePersistenceError } from "./transcriptionPersistenceErrors";

export class TranscriptionRepository {
  async createTranscriptionJob(
    client: any,
    guideId: string,
    sourceAssetId: string,
    requestId: string,
    provider: string,
    settings: any
  ): Promise<TranscriptionJob> {
    const { data, error } = await client.rpc("create_video_transcription_job", {
      p_guide_id: guideId,
      p_source_asset_id: sourceAssetId,
      p_request_id: requestId,
      p_provider: provider,
      p_settings_json: settings
    });

    if (error) {
      handlePersistenceError(error);
    }
    return mapDbJobToDomain(data);
  }

  async getTranscriptionJob(client: any, jobId: string): Promise<TranscriptionJob> {
    const { data, error } = await client
      .from("video_transcription_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      handlePersistenceError(error);
    }
    if (!data) {
      handlePersistenceError({ message: `TRANSCRIPTION_JOB_NOT_FOUND: Job with ID ${jobId} not found` });
    }
    return mapDbJobToDomain(data);
  }

  async listTranscriptionJobsForSource(client: any, sourceAssetId: string): Promise<TranscriptionJob[]> {
    const { data, error } = await client
      .from("video_transcription_jobs")
      .select("*")
      .eq("source_asset_id", sourceAssetId)
      .order("created_at", { ascending: false });

    if (error) {
      handlePersistenceError(error);
    }
    return (data || []).map(mapDbJobToDomain);
  }

  async cancelTranscriptionJob(client: any, jobId: string): Promise<TranscriptionJob> {
    const { data, error } = await client.rpc("cancel_video_transcription_job", {
      p_job_id: jobId
    });

    if (error) {
      handlePersistenceError(error);
    }
    return mapDbJobToDomain(data);
  }

  async retryTranscriptionJob(client: any, jobId: string): Promise<TranscriptionJob> {
    const { data, error } = await client.rpc("retry_video_transcription_job", {
      p_job_id: jobId
    });

    if (error) {
      handlePersistenceError(error);
    }
    return mapDbJobToDomain(data);
  }

  async approveTranscriptionJob(
    client: any,
    jobId: string,
    expectedRevision: number | null
  ): Promise<TranscriptionJob> {
    const { data, error } = await client.rpc("approve_video_transcription_job", {
      p_job_id: jobId,
      p_expected_transcript_revision: expectedRevision
    });

    if (error) {
      handlePersistenceError(error);
    }
    return mapDbJobToDomain(data);
  }

  async rejectTranscriptionJob(client: any, jobId: string): Promise<TranscriptionJob> {
    const { data, error } = await client.rpc("reject_video_transcription_job", {
      p_job_id: jobId
    });

    if (error) {
      handlePersistenceError(error);
    }
    return mapDbJobToDomain(data);
  }

  async createManualImportJob(
    client: any,
    guideId: string,
    sourceAssetId: string,
    requestId: string,
    transcriptJson: any
  ): Promise<TranscriptionJob> {
    const { data, error } = await client.rpc("create_manual_transcription_import_job", {
      p_guide_id: guideId,
      p_source_asset_id: sourceAssetId,
      p_request_id: requestId,
      p_transcript_json: transcriptJson
    });

    if (error) {
      handlePersistenceError(error);
    }
    return mapDbJobToDomain(data);
  }

  async getCurrentTranscriptRevision(
    client: any,
    guideId: string,
    sourceAssetId: string
  ): Promise<number | null> {
    const { data, error } = await client
      .from("video_source_transcripts")
      .select("revision")
      .eq("source_asset_id", sourceAssetId)
      .maybeSingle();

    if (error) {
      handlePersistenceError(error);
    }
    return data?.revision || null;
  }
}
