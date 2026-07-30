import { TranscriptionService } from "../services/transcriptionService";
import { TranscriptionJobController } from "./TranscriptionJobController";
import { TranscriptViewerController } from "./TranscriptViewerController";
import { validateSourceTranscript } from "../domain/transcriptValidation";
import { migrateLegacyEditsToSequence } from "../services/playbackSequenceService";
import { fswAlert } from "../../../utils/dialog";
import { TranscriptionValidationError, getSafeTranscriptionUserMessage } from "../domain/transcriptionErrors";

export interface TranscriptionUIControllerConfig {
  supabase: any;
  guideId: string | null;
  editorVideo: HTMLVideoElement;
  playbackCoordinator: any;
  videoEdits: any;
  isTimelineSeqEditing: boolean;
  timelineEditorController: any;
  renderTranscriptState: (state: any) => void;
  updateWordHighlights: (diff: any) => void;
  onStateChange: (state: any) => void;
}

export class TranscriptionUIController {
  private supabase: any;
  private guideId: string | null = null;
  private activeSourceAssetId: string | null = null;
  private activeSourceDuration: number | null = null;

  private editorVideo: HTMLVideoElement;
  private playbackCoordinator: any;
  private videoEdits: any;
  private isTimelineSeqEditing: boolean;
  private timelineEditorController: any;
  private renderTranscriptState: (state: any) => void;
  private updateWordHighlights: (diff: any) => void;
  private onStateChange: (state: any) => void;

  public transcriptionService: TranscriptionService | null = null;
  public transcriptionJobController: TranscriptionJobController | null = null;
  public transcriptViewerController: TranscriptViewerController | null = null;

  private isProgrammaticScrolling = false;

  constructor(config: TranscriptionUIControllerConfig) {
    this.supabase = config.supabase;
    this.guideId = config.guideId;
    this.editorVideo = config.editorVideo;
    this.playbackCoordinator = config.playbackCoordinator;
    this.videoEdits = config.videoEdits;
    this.isTimelineSeqEditing = config.isTimelineSeqEditing;
    this.timelineEditorController = config.timelineEditorController;
    this.renderTranscriptState = config.renderTranscriptState;
    this.updateWordHighlights = config.updateWordHighlights;
    this.onStateChange = config.onStateChange;
  }

  public setSourceAsset(id: string | null, duration: number | null) {
    this.dispose();

    this.activeSourceAssetId = id;
    this.activeSourceDuration = duration;

    // Manual import remains disabled until both identifiers are available
    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement | null;
    if (importBtn) {
      importBtn.disabled = !(this.guideId && this.activeSourceAssetId);
    }

    if (this.guideId && this.activeSourceAssetId && this.activeSourceDuration !== null) {
      this.transcriptionService = new TranscriptionService(this.supabase);

      this.transcriptionJobController = new TranscriptionJobController(
        this.transcriptionService,
        this.guideId,
        this.activeSourceAssetId,
        (jobState) => {
          this.onStateChange(jobState);
        }
      );
      this.transcriptionJobController.init();

      this.transcriptViewerController = new TranscriptViewerController({
        guideId: this.guideId,
        sourceAssetId: this.activeSourceAssetId,
        getSequence: () => {
          const dur = this.editorVideo.duration || 0.0;
          if (this.isTimelineSeqEditing && this.timelineEditorController) {
            return this.timelineEditorController.getCommittedSequence();
          }
          return migrateLegacyEditsToSequence(this.activeSourceAssetId!, dur, this.videoEdits);
        },
        playbackSubscription: {
          subscribe: (listener) => {
            return this.playbackCoordinator.subscribe(listener);
          }
        },
        onStateChange: (state) => {
          this.renderTranscriptState(state);
        },
        onActiveWordChange: (diff) => {
          this.updateWordHighlights(diff);
        }
      });

      this.transcriptViewerController.initialize().then(() => {
        const transcriptContent = document.getElementById("sys-transcript-content");
        if (transcriptContent) {
          const onScroll = () => {
            if (this.isProgrammaticScrolling) {
              this.isProgrammaticScrolling = false;
              return;
            }
            if (this.transcriptViewerController) {
              const state = this.transcriptViewerController.getState();
              if (state.followPlayback) {
                this.transcriptViewerController.setFollowPlayback(false);
              }
            }
          };
          transcriptContent.addEventListener("scroll", onScroll);
          (transcriptContent as any)._onScroll = onScroll;
        }
      });
    }
  }

  public getActiveSourceAssetId(): string | null {
    return this.activeSourceAssetId;
  }

  public getActiveSourceDuration(): number | null {
    return this.activeSourceDuration;
  }

  public setGuideId(guideId: string | null) {
    this.guideId = guideId;
    // Refresh buttons state
    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement | null;
    if (importBtn) {
      importBtn.disabled = !(this.guideId && this.activeSourceAssetId);
    }
  }

  public loadDemoTranscript() {
    if (!this.transcriptViewerController) return;
    const duration = this.activeSourceDuration || this.editorVideo.duration || 60;
    const sourceAssetId = this.activeSourceAssetId || "demo-asset-123";

    const words = [];
    // Generate roughly 2 words per second
    const numWords = Math.floor(duration * 2);
    for (let i = 0; i < numWords; i++) {
        const start = i * 0.5;
        let end = start + 0.45;
        if (start >= duration) break;
        if (end > duration) end = duration;

        words.push({
            id: `demo-word-${i}`,
            text: `Word${i}`,
            startSourceTime: start,
            endSourceTime: end,
            confidence: 0.99,
            speakerId: "speaker-1"
        });
    }

    const demoTranscript = {
        schemaVersion: 1,
        sourceAssetId: sourceAssetId,
        duration: duration,
        words: words
    };

    this.transcriptViewerController.loadDemoTranscript(demoTranscript as any);
  }

  public async handleManualImportFile(file: File) {
    if (!this.guideId || !this.activeSourceAssetId) {
      await fswAlert("The transcript file cannot be imported because the video or guide is not initialized.");
      return;
    }

    const MANUAL_IMPORT_LIMIT_BYTES = 1048576; // 1 MB
    try {
      if (file.size > MANUAL_IMPORT_LIMIT_BYTES) {
        throw new TranscriptionValidationError("The transcript file is too large.");
      }

      const text = await file.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new TranscriptionValidationError("The transcript file is not in a valid JSON format.");
      }

      // Run Domain validations
      try {
        validateSourceTranscript(json);
      } catch (err) {
        throw new TranscriptionValidationError("Normalized transcript failed validation.");
      }

      if (json.sourceAssetId !== this.activeSourceAssetId) {
        throw new TranscriptionValidationError("The transcript belongs to a different video.");
      }

      const activeDuration = this.editorVideo.duration || 0;
      if (Math.abs(json.duration - activeDuration) > 0.001) {
        throw new TranscriptionValidationError("The transcript duration does not match this video.");
      }

      if (this.transcriptionJobController) {
        await this.transcriptionJobController.startManualImport(crypto.randomUUID(), json);
        await fswAlert("Transcript submitted for review.");
      }
    } catch (err: any) {
      await fswAlert(getSafeTranscriptionUserMessage(err));
    }
  }

  public async handleApprove() {
    if (!this.transcriptionJobController) return;
    try {
      await this.transcriptionJobController.approve();
      if (this.transcriptViewerController) {
        await this.transcriptViewerController.initialize();
      }
    } catch (err: any) {
      await fswAlert(getSafeTranscriptionUserMessage(err));
    }
  }

  public async handleImportSuccess() {
    if (this.transcriptViewerController) {
      await this.transcriptViewerController.initialize();
    }
  }

  public setupUIListeners() {
    const importBtn = document.getElementById("sys-transcribe-import-btn");
    const staticFileInput = document.getElementById("sys-transcribe-file-input") as HTMLInputElement | null;

    if (staticFileInput) {
      staticFileInput.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          await this.handleManualImportFile(file);
        }
        staticFileInput.value = "";
      };
    }

    if (importBtn) {
      importBtn.onclick = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            await this.handleManualImportFile(file);
          }
        };
        input.click();
      };
    }
  }

  public dispose() {
    const transcriptContent = document.getElementById("sys-transcript-content");
    if (transcriptContent && (transcriptContent as any)._onScroll) {
      transcriptContent.removeEventListener("scroll", (transcriptContent as any)._onScroll);
      delete (transcriptContent as any)._onScroll;
    }

    if (this.transcriptionJobController) {
      this.transcriptionJobController.dispose();
      this.transcriptionJobController = null;
    }
    if (this.transcriptViewerController) {
      this.transcriptViewerController.dispose();
      this.transcriptViewerController = null;
    }
  }
}
