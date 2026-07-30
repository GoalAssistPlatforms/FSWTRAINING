import { SupabaseClient } from '@supabase/supabase-js';
import { WorkerRepository, VideoTranscriptionJob } from './workerTypes';

export class PostgresWorkerRepository implements WorkerRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private snakeToCamelJob(job: any): VideoTranscriptionJob {
    return {
      id: job.id,
      sourceAssetId: job.source_asset_id,
      provider: job.provider,
      status: job.status,
      progressStage: job.progress_stage,
      attemptCount: job.attempt_count,
      leaseOwner: job.lease_owner,
      leaseGeneration: job.lease_generation
    };
  }

  async claimJob(leaseOwner: string, leaseDurationSeconds: number): Promise<VideoTranscriptionJob | null> {
    const { data, error } = await this.supabase.rpc('claim_next_video_transcription_job', {
      p_lease_owner: leaseOwner,
      p_lease_duration_seconds: leaseDurationSeconds
    });

    if (error) throw error;
    return data ? this.snakeToCamelJob(data) : null;
  }

  async heartbeatJob(jobId: string, leaseOwner: string, leaseGeneration: number, leaseDurationSeconds: number): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('heartbeat_video_transcription_job', {
      p_job_id: jobId,
      p_lease_owner: leaseOwner,
      p_lease_generation: leaseGeneration,
      p_lease_duration_seconds: leaseDurationSeconds
    });
    if (error) throw error;
    return !!data;
  }

  async recordStage(jobId: string, leaseOwner: string, leaseGeneration: number, stage: string, status: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('record_video_transcription_stage', {
      p_job_id: jobId,
      p_lease_owner: leaseOwner,
      p_lease_generation: leaseGeneration,
      p_stage: stage,
      p_status: status
    });
    if (error) throw error;
    return !!data;
  }

  async recordResult(jobId: string, leaseOwner: string, leaseGeneration: number, transcriptJson: any, providerRequestId: string, providerMetadata: any): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('record_video_transcription_result', {
      p_job_id: jobId,
      p_lease_owner: leaseOwner,
      p_lease_generation: leaseGeneration,
      p_transcript_json: transcriptJson,
      p_provider_request_id: providerRequestId,
      p_provider_metadata: providerMetadata
    });
    if (error) throw error;
    return !!data;
  }

  async recordFailure(jobId: string, leaseOwner: string, leaseGeneration: number, errorCode: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('record_video_transcription_failure', {
      p_job_id: jobId,
      p_lease_owner: leaseOwner,
      p_lease_generation: leaseGeneration,
      p_error_code: errorCode
    });
    if (error) throw error;
    return !!data;
  }

  async recoverStaleJobs(limit: number): Promise<{ jobId: string; newStatus: string }[]> {
    const { data, error } = await this.supabase.rpc('recover_stale_video_transcription_jobs', {
      p_limit: limit
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      jobId: row.job_id,
      newStatus: row.new_status
    }));
  }

  async isJobCancelled(jobId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('video_transcription_jobs')
      .select('status')
      .eq('id', jobId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return true; // not found = cancelled conceptually or bad id
      throw error;
    }
    return data.status === 'cancelled';
  }
}
