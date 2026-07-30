import { TranscriptionJob } from "../domain/transcriptionTypes";
import { TranscriptionRepository } from "../persistence/transcriptionRepository";

export class TranscriptionService {
  private repository = new TranscriptionRepository();
  private client: any;

  constructor(supabaseClient: any) {
    this.client = supabaseClient;
  }
  isAutomaticTranscriptionWorkerAvailable(): boolean {
    return false;
  }

  async getCurrentTranscriptRevision(guideId: string, sourceAssetId: string): Promise<number | null> {
    return this.repository.getCurrentTranscriptRevision(this.client, guideId, sourceAssetId);
  }

  async createJob(
    guideId: string,
    sourceAssetId: string,
    requestId: string,
    provider: string,
    settings: any
  ): Promise<TranscriptionJob> {
    return this.repository.createTranscriptionJob(
      this.client,
      guideId,
      sourceAssetId,
      requestId,
      provider,
      settings
    );
  }

  async getJob(jobId: string): Promise<TranscriptionJob> {
    return this.repository.getTranscriptionJob(this.client, jobId);
  }

  async listJobs(sourceAssetId: string): Promise<TranscriptionJob[]> {
    return this.repository.listTranscriptionJobsForSource(this.client, sourceAssetId);
  }

  async cancelJob(jobId: string): Promise<TranscriptionJob> {
    return this.repository.cancelTranscriptionJob(this.client, jobId);
  }

  async retryJob(jobId: string): Promise<TranscriptionJob> {
    return this.repository.retryTranscriptionJob(this.client, jobId);
  }

  async approveJob(jobId: string, expectedRevision: number | null): Promise<TranscriptionJob> {
    return this.repository.approveTranscriptionJob(this.client, jobId, expectedRevision);
  }

  async rejectJob(jobId: string): Promise<TranscriptionJob> {
    return this.repository.rejectTranscriptionJob(this.client, jobId);
  }

  async createManualImportJob(
    guideId: string,
    sourceAssetId: string,
    requestId: string,
    transcriptJson: any
  ): Promise<TranscriptionJob> {
    return this.repository.createManualImportJob(
      this.client,
      guideId,
      sourceAssetId,
      requestId,
      transcriptJson
    );
  }

  // Subscribe to changes on a transcription job using polling for maximum test reliability
  subscribeToJob(jobId: string, onUpdate: (job: TranscriptionJob) => void): () => void {
    let active = true;
    let timeoutId: any = null;

    const poll = async () => {
      if (!active) return;
      try {
        const job = await this.getJob(jobId);
        if (active) {
          onUpdate(job);
          // If the job status is terminal, stop polling
          if (["completed", "rejected", "failed", "cancelled"].includes(job.status)) {
            return;
          }
        }
      } catch (err) {
        console.warn("Error polling transcription job status:", err);
      }
      if (active) {
        timeoutId = setTimeout(poll, 1000);
      }
    };

    poll();

    return () => {
      active = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }
}
