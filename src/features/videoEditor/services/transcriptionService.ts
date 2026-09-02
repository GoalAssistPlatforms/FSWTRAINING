import { TranscriptionJob } from "../domain/transcriptionTypes";
import { TranscriptionRepository } from "../persistence/transcriptionRepository";

export interface BackgroundTranscriptionStart {
  runId: string | null;
  alreadyStarted: boolean;
}

export class TranscriptionService {
  private repository = new TranscriptionRepository();
  private client: any;

  constructor(supabaseClient: any) {
    this.client = supabaseClient;
  }

  // Background transcription runs as a Vercel Workflow. It is switched on per deployment so the
  // in-browser path stays in use until the migration and environment are in place.
  isAutomaticTranscriptionWorkerAvailable(): boolean {
    return import.meta.env.VITE_BACKGROUND_TRANSCRIPTION_ENABLED === "true";
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

  // Asks the server to attach a workflow run to a queued job.
  async startBackgroundTranscription(jobId: string): Promise<BackgroundTranscriptionStart> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    const accessToken = data?.session?.access_token;
    if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

    const response = await fetch("/api/transcription/start", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ jobId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.statusMessage || payload?.message || "Background transcription could not be started.");
    }
    return {
      runId: payload?.runId ?? null,
      alreadyStarted: Boolean(payload?.alreadyStarted)
    };
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
