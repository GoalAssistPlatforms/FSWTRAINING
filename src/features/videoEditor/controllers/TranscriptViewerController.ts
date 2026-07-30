import { SourceTranscript, VisibleTranscriptWord } from "../domain/transcriptTypes";
import { VideoSequence } from "../domain/editorTypes";
import { PlaybackState, PlaybackStateSubscription } from "./playbackTypes";
import { TranscriptService } from "../services/transcriptService";
import { TranscriptDisposedError } from "../domain/transcriptErrors";

export interface TranscriptViewerState {
  status: "idle" | "loading" | "ready" | "empty" | "error";
  transcript: SourceTranscript | null;
  visibleWords: VisibleTranscriptWord[];
  activeWordId: string | null;
  selectedWordId: string | null;
  followPlayback: boolean;
  error: Error | null;
}

export interface TranscriptViewerControllerOptions {
  guideId: string;
  sourceAssetId: string;
  getSequence: () => VideoSequence;
  playbackSubscription: PlaybackStateSubscription;
  onStateChange?: (state: TranscriptViewerState) => void;
  onActiveWordChange?: (diff: {
    previousActiveWordId: string | null;
    activeWordId: string | null;
    previousSelectedWordId: string | null;
    selectedWordId: string | null;
  }) => void;
}

export class TranscriptViewerController {
  private guideId: string;
  private sourceAssetId: string;
  private getSequence: () => VideoSequence;
  private playbackSubscription: PlaybackStateSubscription;
  private onStateChange?: (state: TranscriptViewerState) => void;
  private onActiveWordChange?: (diff: {
    previousActiveWordId: string | null;
    activeWordId: string | null;
    previousSelectedWordId: string | null;
    selectedWordId: string | null;
  }) => void;

  private service: TranscriptService;
  private unsubscribePlayback: (() => void) | null = null;
  private status: "idle" | "loading" | "ready" | "empty" | "error" = "idle";
  private activeWordId: string | null = null;
  private selectedWordId: string | null = null;
  private followPlayback = true;
  private error: Error | null = null;
  private isDisposed = false;
  private lastSourceTime: number | null = null;

  constructor(options: TranscriptViewerControllerOptions) {
    this.guideId = options.guideId;
    this.sourceAssetId = options.sourceAssetId;
    this.getSequence = options.getSequence;
    this.playbackSubscription = options.playbackSubscription;
    this.onStateChange = options.onStateChange;
    this.onActiveWordChange = options.onActiveWordChange;

    this.service = new TranscriptService();
  }

  public async initialize(): Promise<void> {
    this.checkDisposed();
    this.status = "loading";
    this.emitState();

    try {
      const sequence = this.getSequence();
      const transcript = await this.service.loadTranscript(
        this.guideId,
        this.sourceAssetId,
        sequence
      );

      if (transcript) {
        this.status = "ready";
      } else {
        this.status = "empty";
      }
      this.error = null;
    } catch (e: any) {
      this.status = "error";
      this.error = e;
    }

    this.emitState();

    // Subscribe to playback changes
    if (this.status === "ready") {
      this.unsubscribePlayback = this.playbackSubscription.subscribe((state) => {
        this.handlePlaybackStateUpdate(state);
      });
    }
  }

  public loadDemoTranscript(transcript: SourceTranscript): void {
    this.checkDisposed();
    this.status = "loading";
    this.emitState();

    try {
      const sequence = this.getSequence();
      this.service.loadDemoTranscript(transcript, sequence);
      this.status = "ready";
      this.error = null;
    } catch (e: any) {
      this.status = "error";
      this.error = e;
    }

    this.emitState();

    if (this.status === "ready" && !this.unsubscribePlayback) {
      this.unsubscribePlayback = this.playbackSubscription.subscribe((state) => {
        this.handlePlaybackStateUpdate(state);
      });
    }
  }

  private handlePlaybackStateUpdate(playbackState: PlaybackState) {
    if (this.isDisposed || this.status !== "ready") return;

    const sourceTime = playbackState.sourceTime;
    this.lastSourceTime = sourceTime;
    const isCompleted = playbackState.ended;

    let nextActiveId: string | null = null;
    if (!isCompleted) {
      const activeWord = this.service.findActiveWord(sourceTime);
      if (activeWord) {
        nextActiveId = activeWord.word.id;
      }
    }

    if (nextActiveId !== this.activeWordId) {
      const prevActive = this.activeWordId;
      this.activeWordId = nextActiveId;

      this.emitState();

      if (this.onActiveWordChange) {
        this.onActiveWordChange({
          previousActiveWordId: prevActive,
          activeWordId: nextActiveId,
          previousSelectedWordId: this.selectedWordId,
          selectedWordId: this.selectedWordId
        });
      }
    }
  }

  public refreshSequence(sequence: VideoSequence): void {
    this.checkDisposed();
    if (this.status !== "ready") return;

    this.service.remapSequence(sequence);

    // Recalculate active word based on last known source time
    const prevActive = this.activeWordId;
    let nextActiveId: string | null = null;
    if (this.lastSourceTime !== null) {
      const activeWord = this.service.findActiveWord(this.lastSourceTime);
      if (activeWord) {
        nextActiveId = activeWord.word.id;
      }
    }
    this.activeWordId = nextActiveId;

    // Preserve selected word identifier where the word still exists and is visible
    if (this.selectedWordId) {
      const stillVisible = this.service
        .getVisibleWords()
        .some((vw) => vw.word.id === this.selectedWordId && vw.state === "visible");
      if (!stillVisible) {
        this.selectedWordId = null;
      }
    }

    this.emitState();

    if (this.onActiveWordChange) {
      this.onActiveWordChange({
        previousActiveWordId: prevActive,
        activeWordId: nextActiveId,
        previousSelectedWordId: this.selectedWordId,
        selectedWordId: this.selectedWordId
      });
    }
  }

  public getSeekTarget(wordId: string): number {
    this.checkDisposed();
    if (this.status !== "ready") {
      throw new Error("Controller is not in ready state");
    }

    const vw = this.service.getVisibleWords().find((w) => w.word.id === wordId);
    if (!vw) {
      throw new Error(`Word ${wordId} not found in transcript`);
    }

    // Set selected word ID and notify view
    const prevSelected = this.selectedWordId;
    this.selectedWordId = wordId;
    this.emitState();

    if (this.onActiveWordChange) {
      this.onActiveWordChange({
        previousActiveWordId: this.activeWordId,
        activeWordId: this.activeWordId,
        previousSelectedWordId: prevSelected,
        selectedWordId: wordId
      });
    }

    const sequence = this.getSequence();
    return this.service.resolveSeekSourceTime(vw, sequence);
  }

  public setFollowPlayback(follow: boolean): void {
    this.checkDisposed();
    if (this.followPlayback !== follow) {
      this.followPlayback = follow;
      this.emitState();
    }
  }

  public getState(): TranscriptViewerState {
    return {
      status: this.status,
      transcript: this.service.getCachedTranscript(),
      visibleWords: this.service.getVisibleWords(),
      activeWordId: this.activeWordId,
      selectedWordId: this.selectedWordId,
      followPlayback: this.followPlayback,
      error: this.error
    };
  }

  private emitState(): void {
    if (this.onStateChange && !this.isDisposed) {
      this.onStateChange(this.getState());
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.unsubscribePlayback) {
      this.unsubscribePlayback();
      this.unsubscribePlayback = null;
    }
    this.service.dispose();
  }

  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new TranscriptDisposedError("TranscriptViewerController has been disposed");
    }
  }
}
