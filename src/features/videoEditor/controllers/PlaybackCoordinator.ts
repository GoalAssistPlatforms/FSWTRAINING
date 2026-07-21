declare var process: any;

import { VideoSequence, LegacyVideoEdits } from "../domain/editorTypes";
import {
  PlaybackState,
  PlaybackStatus,
  PlaybackControllerOptions,
  IMediaElement
} from "./playbackTypes";
import { PlaybackController, SourceSeekResult } from "./PlaybackController";
import { isSequencePlaybackEnabled } from "../config/playbackFeatureFlags";
import {
  calculateCompatibility,
  migrateLegacyEditsToSequence,
  validateSequenceState,
  PlaybackCompatibilityResult
} from "../services/playbackSequenceService";
import {
  getVisibleDuration as getLegacyVisibleDuration,
  visibleToSourceTime as legacyVisibleToSourceTime,
  sourceToVisibleTime as legacySourceToVisibleTime,
  getNextVisibleTime as legacyGetNextVisibleTime,
  getVisibleSegments as getLegacyVisibleSegments
} from "../../../utils/videoPlaybackController";
import { roundTo6 } from "../domain/timePrecision";

export interface PlaybackCoordinatorOptions {
  media: IMediaElement;
  getLegacyEdits: () => LegacyVideoEdits;
  getSequence: () => VideoSequence;
  getSourceDuration: () => number;
  boundaryTolerance?: number;
  onStateChange?: (state: PlaybackState) => void;
  onClipChange?: (clipId: string | null) => void;
  onError?: (error: any) => void;
}

// Nested Legacy Controller implementing same interface
class LegacyPlaybackController {
  private media: IMediaElement;
  private getLegacyEdits: () => LegacyVideoEdits;
  private getSourceDuration: () => number;
  private boundaryTolerance: number;
  private onStateChange?: (state: PlaybackState) => void;
  private onError?: (error: any) => void;

  private isDisposed = false;
  private status: PlaybackStatus = "idle";
  private visibleDuration = 0;
  private ended = false;
  private isWaitingForMetadata = false;

  private boundListeners: Record<string, EventListener> = {};
  private lastEmittedState: string | null = null;

  constructor(options: {
    media: IMediaElement;
    getLegacyEdits: () => LegacyVideoEdits;
    getSourceDuration: () => number;
    boundaryTolerance: number;
    onStateChange?: (state: PlaybackState) => void;
    onError?: (error: any) => void;
  }) {
    this.media = options.media;
    this.getLegacyEdits = options.getLegacyEdits;
    this.getSourceDuration = options.getSourceDuration;
    this.boundaryTolerance = options.boundaryTolerance;
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    const events = [
      "loadedmetadata",
      "durationchange",
      "timeupdate",
      "play",
      "pause",
      "seeking",
      "seeked",
      "ended",
      "ratechange",
      "volumechange",
      "error"
    ];

    for (const event of events) {
      const handlerName = `handle${event.charAt(0).toUpperCase() + event.slice(1)}`;
      const handler = (this as any)[handlerName]?.bind(this);
      if (handler) {
        this.boundListeners[event] = handler;
        this.media.addEventListener(event, handler);
      }
    }
  }

  private removeEventListeners() {
    for (const [event, handler] of Object.entries(this.boundListeners)) {
      this.media.removeEventListener(event, handler);
    }
    this.boundListeners = {};
  }

  public load() {
    this.status = "loading";
    this.emitState();

    const mediaDuration = this.media.duration;
    if (!Number.isFinite(mediaDuration) || mediaDuration === 0) {
      this.isWaitingForMetadata = true;
      return;
    }

    this.isWaitingForMetadata = false;
    this.preparePlayback();
  }

  private preparePlayback() {
    try {
      const edits = this.getLegacyEdits();
      const sourceDuration = this.getSourceDuration();
      this.visibleDuration = getLegacyVisibleDuration(sourceDuration, edits);

      this.ended = false;
      this.status = "ready";

      const segments = getLegacyVisibleSegments(sourceDuration, edits);
      const firstStart = segments.length > 0 ? segments[0][0] : 0;
      if (Math.abs(this.media.currentTime - firstStart) > this.boundaryTolerance) {
        this.media.currentTime = firstStart;
      }
      this.emitState();
    } catch (e: any) {
      this.status = "error";
      this.emitState();
      if (this.onError) this.onError(e);
    }
  }

  public play() {
    const edits = this.getLegacyEdits();
    const sourceDuration = this.getSourceDuration();
    if (this.ended) {
      this.ended = false;
      const segments = getLegacyVisibleSegments(sourceDuration, edits);
      const firstStart = segments.length > 0 ? segments[0][0] : 0;
      this.media.currentTime = firstStart;
    }

    // Verify playhead is in visible segment
    const rawTime = this.media.currentTime;
    const mapping = legacySourceToVisibleTime(rawTime, edits, sourceDuration);
    if (mapping.isRemoved) {
      const nextTime = legacyGetNextVisibleTime(rawTime, edits, sourceDuration);
      this.media.currentTime = nextTime;
    }

    this.media.play();
  }

  public pause() {
    this.media.pause();
  }

  public togglePlayback() {
    if (this.media.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  public seekVisibleTime(visibleTime: number) {
    const edits = this.getLegacyEdits();
    const sourceDuration = this.getSourceDuration();
    const clamped = Math.max(0, Math.min(this.visibleDuration, visibleTime));

    if (clamped === 0) {
      const segments = getLegacyVisibleSegments(sourceDuration, edits);
      const firstStart = segments.length > 0 ? segments[0][0] : 0;
      this.media.currentTime = firstStart;
    } else if (clamped === this.visibleDuration) {
      const trimEnd = edits?.trimEnd !== null && edits?.trimEnd !== undefined ? edits.trimEnd : sourceDuration;
      this.media.currentTime = trimEnd;
      this.media.pause();
      this.ended = true;
      this.status = "ended";
    } else {
      const sourceTime = legacyVisibleToSourceTime(clamped, edits, sourceDuration);
      this.media.currentTime = sourceTime;
    }
    this.emitState();
  }

  public seekSourceTime(sourceTime: number): SourceSeekResult {
    const edits = this.getLegacyEdits();
    const sourceDuration = this.getSourceDuration();
    const nextTime = legacyGetNextVisibleTime(sourceTime, edits, sourceDuration);

    this.media.currentTime = nextTime;

    const mapping = legacySourceToVisibleTime(nextTime, edits, sourceDuration);
    this.emitState();

    return {
      requestedSourceTime: sourceTime,
      resolvedSourceTime: nextTime,
      visibleTime: mapping.visibleTime,
      wasRemoved: mapping.isRemoved || nextTime !== sourceTime,
      selectedBoundary: nextTime !== sourceTime ? "next" : "exact"
    };
  }

  public setPlaybackRate(rate: number) {
    this.media.playbackRate = rate;
  }

  public setVolume(vol: number) {
    this.media.volume = vol;
  }

  public setMuted(muted: boolean) {
    this.media.muted = muted;
  }

  public refreshSequence() {
    const edits = this.getLegacyEdits();
    const sourceDuration = this.getSourceDuration();
    this.visibleDuration = getLegacyVisibleDuration(sourceDuration, edits);
    this.emitState();
  }

  public dispose() {
    this.isDisposed = true;
    this.removeEventListeners();
  }

  private handleLoadedmetadata() {
    if (this.isWaitingForMetadata) {
      this.isWaitingForMetadata = false;
      this.preparePlayback();
    }
  }

  private handleDurationchange() {
    if (this.isWaitingForMetadata) {
      this.isWaitingForMetadata = false;
      this.preparePlayback();
    }
  }

  private handleTimeupdate() {
    if (this.isDisposed) return;
    const edits = this.getLegacyEdits();
    const sourceDuration = this.getSourceDuration();
    const rawTime = this.media.currentTime;

    const nextTime = legacyGetNextVisibleTime(rawTime, edits, sourceDuration);
    if (nextTime !== rawTime) {
      this.media.currentTime = nextTime;
      return;
    }

    const trimEnd = edits?.trimEnd !== null && edits?.trimEnd !== undefined ? edits.trimEnd : sourceDuration;
    if (rawTime >= trimEnd - this.boundaryTolerance) {
      this.media.pause();
      this.media.currentTime = trimEnd;
      this.ended = true;
      this.status = "ended";
    }

    this.emitState();
  }

  private handlePlay() {
    this.status = "playing";
    this.emitState();
  }

  private handlePause() {
    if (this.status !== "ended") {
      this.status = "paused";
    }
    this.emitState();
  }

  private handleSeeking() {
    if (this.status !== "seeking") {
      this.status = "seeking";
      this.emitState();
    }
  }

  private handleSeeked() {
    if (this.ended) {
      this.status = "ended";
    } else {
      this.status = this.media.paused ? "paused" : "playing";
    }
    this.emitState();
  }

  private handleEnded() {
    this.media.pause();
    this.ended = true;
    this.status = "ended";
    this.emitState();
  }

  private handleRatechange() {
    this.emitState();
  }

  private handleVolumechange() {
    this.emitState();
  }

  private handleError() {
    this.status = "error";
    this.emitState();
  }

  public getState(): PlaybackState {
    const edits = this.getLegacyEdits();
    const sourceDuration = this.getSourceDuration();
    const rawTime = this.media.currentTime;
    const mapping = legacySourceToVisibleTime(rawTime, edits, sourceDuration);

    return {
      status: this.status,
      sourceTime: roundTo6(rawTime),
      visibleTime: roundTo6(mapping.visibleTime),
      visibleDuration: this.visibleDuration,
      activeClipId: null,
      playbackRate: this.media.playbackRate,
      volume: this.media.volume,
      muted: this.media.muted,
      ended: this.ended
    };
  }

  private emitState() {
    if (this.onStateChange) {
      const state = this.getState();
      const stateStr = JSON.stringify(state);
      if (stateStr !== this.lastEmittedState) {
        this.lastEmittedState = stateStr;
        this.onStateChange(state);
      }
    }
  }
}

export class PlaybackCoordinator {
  private media: IMediaElement;
  private getLegacyEdits: () => LegacyVideoEdits;
  private getSequence: () => VideoSequence;
  private getSourceDuration: () => number;
  private boundaryTolerance: number;
  private onStateChange?: (state: PlaybackState) => void;
  private onClipChange?: (clipId: string | null) => void;
  private onError?: (error: any) => void;

  private activeController: PlaybackController | LegacyPlaybackController | null = null;
  private isDisposed = false;
  private playbackMode: "legacy" | "sequence" = "legacy";
  private subscribers: Set<(state: PlaybackState) => void> = new Set();

  constructor(options: PlaybackCoordinatorOptions) {
    this.media = options.media;
    this.getLegacyEdits = options.getLegacyEdits;
    this.getSequence = options.getSequence;
    this.getSourceDuration = options.getSourceDuration;
    this.boundaryTolerance = options.boundaryTolerance ?? 0.02;
    this.onStateChange = options.onStateChange;
    this.onClipChange = options.onClipChange;
    this.onError = options.onError;
  }

  public subscribe(listener: (state: PlaybackState) => void): () => void {
    this.subscribers.add(listener);
    const currentState = this.getState();
    if (currentState) {
      listener(currentState);
    }
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private handleStateChange(state: PlaybackState) {
    if (this.onStateChange) {
      this.onStateChange(state);
    }
    for (const listener of this.subscribers) {
      listener(state);
    }
  }

  public async load(): Promise<void> {
    if (this.isDisposed) return;

    if (this.activeController) {
      this.activeController.dispose();
      this.activeController = null;
    }

    const sequenceEnabled = isSequencePlaybackEnabled();

    if (sequenceEnabled) {
      try {
        const seq = this.getSequence();
        const srcDur = this.getSourceDuration();
        validateSequenceState(seq, srcDur);

        // Calculate and run compatibility check
        const legacyEdits = this.getLegacyEdits();
        const compat = calculateCompatibility(legacyEdits, seq, srcDur);
        this.logCompatibility(compat);

        this.playbackMode = "sequence";
        this.activeController = new PlaybackController({
          media: this.media,
          getSequence: this.getSequence,
          getSourceDuration: this.getSourceDuration,
          boundaryTolerance: this.boundaryTolerance,
          onStateChange: (state) => this.handleStateChange(state),
          onClipChange: this.onClipChange,
          onError: (err) => this.handleRuntimeError(err)
        });
        await this.activeController.load();
      } catch (e: any) {
        // Preparation fallback to legacy
        console.warn("Sequence playback preparation failed. Falling back to legacy playback:", e.message);
        this.playbackMode = "legacy";
        this.activeController = new LegacyPlaybackController({
          media: this.media,
          getLegacyEdits: this.getLegacyEdits,
          getSourceDuration: this.getSourceDuration,
          boundaryTolerance: this.boundaryTolerance,
          onStateChange: (state) => this.handleStateChange(state),
          onError: this.onError
        });
        this.activeController.load();
      }
    } else {
      this.playbackMode = "legacy";
      this.activeController = new LegacyPlaybackController({
        media: this.media,
        getLegacyEdits: this.getLegacyEdits,
        getSourceDuration: this.getSourceDuration,
        boundaryTolerance: this.boundaryTolerance,
        onStateChange: (state) => this.handleStateChange(state),
        onError: this.onError
      });
      this.activeController.load();
    }
  }

  private handleRuntimeError(error: any) {
    if (this.isDisposed) return;
    console.error("Runtime error in sequence playback controller:", error.message);

    // Runtime fallback to legacy
    this.media.pause();
    const currentSourceTime = this.media.currentTime;

    if (this.activeController) {
      this.activeController.dispose();
    }

    this.playbackMode = "legacy";
    this.activeController = new LegacyPlaybackController({
      media: this.media,
      getLegacyEdits: this.getLegacyEdits,
      getSourceDuration: this.getSourceDuration,
      boundaryTolerance: this.boundaryTolerance,
      onStateChange: (state) => this.handleStateChange(state),
      onError: this.onError
    });
    this.activeController.load();

    // Resolve nearest legacy position
    this.activeController.seekSourceTime(currentSourceTime);
  }

  private logCompatibility(compat: PlaybackCompatibilityResult) {
    const isDev = typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production";
    if (isDev) {
      console.log(`[Compatibility Check] Compatible: ${compat.compatible}, Total Comparisons: ${compat.comparisonsRun}`);
      for (const diff of compat.differences) {
        if (diff.result === "fail") {
          console.warn(`[Compatibility Difference] Category: ${diff.category}, Expected: ${diff.expected}, Actual: ${diff.actual}, Diff: ${diff.difference}`);
        }
      }
    }
  }

  public play(): void {
    if (this.activeController) this.activeController.play();
  }

  public pause(): void {
    if (this.activeController) this.activeController.pause();
  }

  public togglePlayback(): void {
    if (this.activeController) this.activeController.togglePlayback();
  }

  public seekVisibleTime(visibleTime: number): void {
    if (this.activeController) this.activeController.seekVisibleTime(visibleTime);
  }

  public seekSourceTime(sourceTime: number): SourceSeekResult | null {
    if (this.activeController) {
      return this.activeController.seekSourceTime(sourceTime);
    }
    return null;
  }

  public setPlaybackRate(rate: number): void {
    if (this.activeController) this.activeController.setPlaybackRate(rate);
  }

  public setVolume(vol: number): void {
    if (this.activeController) this.activeController.setVolume(vol);
  }

  public setMuted(muted: boolean): void {
    if (this.activeController) this.activeController.setMuted(muted);
  }

  public getState(): PlaybackState | null {
    return this.activeController ? this.activeController.getState() : null;
  }

  public refreshSequence(): void {
    if (this.activeController) this.activeController.refreshSequence();
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.activeController) {
      this.activeController.dispose();
      this.activeController = null;
    }
  }

  public getPlaybackMode(): "legacy" | "sequence" {
    return this.playbackMode;
  }
}
