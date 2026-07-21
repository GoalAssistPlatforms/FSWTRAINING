import { TranscriptionJob, TranscriptionJobStatus } from "../domain/transcriptionTypes";
import { TranscriptionService } from "../services/transcriptionService";
import { SourceTranscript } from "../domain/transcriptTypes";
import { TranscriptionDisposedError } from "../domain/transcriptionErrors";

export interface TranscriptionJobControllerState {
  status:
    | "idle"
    | "loading"
    | "ready"
    | "processing"
    | "awaiting_approval"
    | "failed"
    | "cancelled"
    | "completed"
    | "error";
  job: TranscriptionJob | null;
  resultTranscript: SourceTranscript | null;
  existingTranscriptRevision: number | null;
  canApprove: boolean;
  canReject: boolean;
  canRetry: boolean;
  canCancel: boolean;
  error: Error | null;
}

export class TranscriptionJobController {
  private service: TranscriptionService;
  private guideId: string;
  private sourceAssetId: string;
  private onStateChange: (state: TranscriptionJobControllerState) => void;

  private state: TranscriptionJobControllerState = {
    status: "idle",
    job: null,
    resultTranscript: null,
    existingTranscriptRevision: null,
    canApprove: false,
    canReject: false,
    canRetry: false,
    canCancel: false,
    error: null
  };

  private unsubscribe: (() => void) | null = null;
  private isDisposed = false;

  constructor(
    service: TranscriptionService,
    guideId: string,
    sourceAssetId: string,
    onStateChange: (state: TranscriptionJobControllerState) => void
  ) {
    this.service = service;
    this.guideId = guideId;
    this.sourceAssetId = sourceAssetId;
    this.onStateChange = onStateChange;
  }

  public getState(): TranscriptionJobControllerState {
    return { ...this.state };
  }

  private assertNotDisposed() {
    if (this.isDisposed) {
      throw new TranscriptionDisposedError();
    }
  }

  private updateState(patch: Partial<TranscriptionJobControllerState>) {
    if (this.isDisposed) return;
    this.state = { ...this.state, ...patch };

    // Derive action permissions
    const status = this.state.job?.status;
    const isConflict =
      status === "awaiting_approval" &&
      this.state.existingTranscriptRevision !== this.state.job?.baseTranscriptRevision;

    this.state.canApprove = status === "awaiting_approval" && !isConflict;
    this.state.canReject = status === "awaiting_approval";
    this.state.canRetry = status === "failed";
    this.state.canCancel = !!status && ["queued", "extracting_audio", "transcribing", "validating"].includes(status);

    this.onStateChange(this.state);
  }

  async init() {
    this.assertNotDisposed();
    this.updateState({ status: "loading" });

    try {
      const existingRevision = await this.service.getCurrentTranscriptRevision(this.guideId, this.sourceAssetId);
      this.updateState({ existingTranscriptRevision: existingRevision });

      const jobs = await this.service.listJobs(this.sourceAssetId);
      const processingJob = jobs.find(j =>
        ["queued", "extracting_audio", "transcribing", "validating"].includes(j.status)
      );
      const reviewJob = jobs.find(j => j.status === "awaiting_approval");

      if (processingJob) {
        this.startSubscription(processingJob.id);
      } else if (reviewJob) {
        this.updateState({
          status: "awaiting_approval",
          job: reviewJob,
          resultTranscript: reviewJob.resultTranscriptJson || null
        });
      } else {
        const lastJob = jobs[0] || null;
        let status = lastJob
          ? (lastJob.status === "completed"
              ? "completed"
              : lastJob.status === "failed"
              ? "failed"
              : lastJob.status === "cancelled"
              ? "cancelled"
              : "ready")
          : "ready";

        // If the job says it's completed, but the transcript is missing from the database,
        // we fall back to "ready" to avoid confusing the user with "Transcription completed"
        // when the viewer says "No transcript is available".
        if (status === "completed" && existingRevision === null) {
          status = "ready";
        }

        this.updateState({
          status: status as TranscriptionJobControllerState["status"],
          job: lastJob,
          resultTranscript: lastJob?.resultTranscriptJson || null
        });
      }
    } catch (err: any) {
      this.updateState({ status: "error", error: err });
    }
  }

  async startTranscription(requestId: string) {
    this.assertNotDisposed();
    if (this.state.status === "loading") {
      return; // prevent duplicate start
    }

    this.updateState({ status: "loading" });
    try {
      const job = await this.service.createJob(this.guideId, this.sourceAssetId, requestId, "openai", {});
      this.startSubscription(job.id);
      return job;
    } catch (err: any) {
      this.updateState({ status: "error", error: err });
      throw err;
    }
  }

  async startManualImport(requestId: string, transcriptJson: any) {
    this.assertNotDisposed();
    this.updateState({ status: "loading" });
    try {
      const job = await this.service.createManualImportJob(
        this.guideId,
        this.sourceAssetId,
        requestId,
        transcriptJson
      );
      this.updateState({
        status: "awaiting_approval",
        job,
        resultTranscript: job.resultTranscriptJson || transcriptJson,
        existingTranscriptRevision: job.baseTranscriptRevision
      });
      return job;
    } catch (err: any) {
      this.updateState({ status: "error", error: err });
      throw err;
    }
  }

  async cancel() {
    this.assertNotDisposed();
    if (!this.state.job) return;
    try {
      const job = await this.service.cancelJob(this.state.job.id);
      this.updateState({ job, status: "cancelled" });
      return job;
    } catch (err: any) {
      this.updateState({ status: "error", error: err });
      throw err;
    }
  }

  async retry() {
    this.assertNotDisposed();
    if (!this.state.job) return;
    try {
      const job = await this.service.retryJob(this.state.job.id);
      this.startSubscription(job.id);
      return job;
    } catch (err: any) {
      this.updateState({ status: "error", error: err });
      throw err;
    }
  }

  async approve() {
    this.assertNotDisposed();
    if (!this.state.job) return;
    try {
      const job = await this.service.approveJob(this.state.job.id, this.state.existingTranscriptRevision);
      this.updateState({ job, status: "completed" });
      return job;
    } catch (err: any) {
      this.updateState({ status: "error", error: err });
      throw err;
    }
  }

  async reject() {
    this.assertNotDisposed();
    if (!this.state.job) return;
    try {
      const job = await this.service.rejectJob(this.state.job.id);
      this.updateState({ job, status: "ready" });
      return job;
    } catch (err: any) {
      this.updateState({ status: "error", error: err });
      throw err;
    }
  }

  private startSubscription(jobId: string) {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.unsubscribe = this.service.subscribeToJob(jobId, (job) => {
      const uiStatus = ["queued", "extracting_audio", "transcribing", "validating"].includes(job.status)
        ? "processing"
        : (job.status as any);

      this.updateState({
        job,
        status: uiStatus,
        resultTranscript: job.resultTranscriptJson || null
      });
    });
  }

  dispose() {
    this.isDisposed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
