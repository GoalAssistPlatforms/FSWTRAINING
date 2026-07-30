import { VideoSequence, SequenceClip } from "../domain/editorTypes";
import {
  PlaybackControllerOptions,
  PlaybackState,
  PlaybackStatus,
  IMediaElement
} from "./playbackTypes";
import {
  PlaybackSequenceInvalidError,
  PlaybackSourceMismatchError,
  PlaybackMediaUnavailableError,
  PlaybackSeekError,
  PlaybackTransitionError,
  PlaybackDisposedError
} from "./playbackErrors";
import {
  visibleTimeToSourceTime,
  sourceTimeToVisibleTime
} from "../domain/timeMapping";
import { getVisibleDuration } from "../domain/sequenceEngine";
import { validateSequenceState } from "../services/playbackSequenceService";
import { roundTo6 } from "../domain/timePrecision";

export interface SourceSeekResult {
  requestedSourceTime: number;
  resolvedSourceTime: number;
  visibleTime: number;
  wasRemoved: boolean;
  selectedBoundary: "previous" | "next" | "exact";
}

export class PlaybackController {
  private media: IMediaElement;
  private getSequence: () => VideoSequence;
  private getSourceDuration: () => number;
  private boundaryTolerance: number;
  private onStateChange?: (state: PlaybackState) => void;
  private onClipChange?: (clipId: string | null) => void;
  private onError?: (error: any) => void;

  private isDisposed = false;
  private status: PlaybackStatus = "idle";
  private currentClipId: string | null = null;
  private visibleDuration = 0;
  private ended = false;
  private isWaitingForMetadata = false;

  private seekGeneration = 0;
  private activeTransitionGeneration = 0;
  private isSeekingOrTransitioning = false;
  private preSeekPlayingState = false;
  private seekTimeoutId: any = null;
  private silentSeekEndTime: number | null = null;

  private internalTransition: {
    generation: number;
    targetSourceTime: number;
    targetClipId: string;
    resumePlayback: boolean;
  } | null = null;

  private stateFrameId: number | null = null;

  private findNextVisibleClip(
    sequence: VideoSequence,
    sourceTime: number
  ): SequenceClip | null {
    return sequence.clips.find(
      clip => clip.sourceStart >= sourceTime
    ) ?? null;
  }

  private resumeMedia(): void {
    void Promise.resolve(this.media.play()).catch(error => {
      if (this.onError) {
        this.onError(error);
      }
    });
  }

  private transitionToClip(nextClip: SequenceClip): void {
    if (this.internalTransition) {
      return;
    }

    const resumePlayback = !this.media.paused && !this.ended;
    const generation = ++this.activeTransitionGeneration;

    this.internalTransition = {
      generation,
      targetSourceTime: nextClip.sourceStart,
      targetClipId: nextClip.id,
      resumePlayback
    };

    this.isSeekingOrTransitioning = true;
    this.preSeekPlayingState = resumePlayback;
    this.silentSeekEndTime = nextClip.sourceStart;

    this.updateActiveClip(nextClip.id);

    this.clearSeekTimeout();
    this.seekTimeoutId = setTimeout(() => {
      this.handleSeekTimeout(generation);
    }, 1000) as any;

    this.media.currentTime = nextClip.sourceStart;
  }

  private scheduleStateEmit(): void {
    if (this.stateFrameId !== null) {
      return;
    }

    const schedule = globalThis.requestAnimationFrame ??
      ((callback: FrameRequestCallback) =>
        setTimeout(
          () => callback(performance.now()),
          16
        ) as any);

    this.stateFrameId = schedule(() => {
      this.stateFrameId = null;
      this.emitState();
    });
  }

  // Cache to avoid duplicate state updates
  private lastEmittedState: string | null = null;

  // Store bound event listeners for removal
  private boundListeners: Record<string, EventListener> = {};

  constructor(options: PlaybackControllerOptions) {
    this.media = options.media;
    this.getSequence = options.getSequence;
    this.getSourceDuration = options.getSourceDuration;
    this.boundaryTolerance = options.boundaryTolerance ?? 0.02;
    this.onStateChange = options.onStateChange;
    this.onClipChange = options.onClipChange;
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

  private checkDisposed() {
    if (this.isDisposed) {
      throw new PlaybackDisposedError("Controller has been disposed");
    }
  }

  public async load(): Promise<void> {
    this.checkDisposed();
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
      const sequence = this.getSequence();
      const sourceDuration = this.getSourceDuration();

      // Validate sequence
      validateSequenceState(sequence, sourceDuration);

      // Verify clips fit within source duration
      for (const clip of sequence.clips) {
        if (clip.sourceEnd > sourceDuration + 1e-6) {
          throw new PlaybackSequenceInvalidError("Clip boundaries exceed source duration");
        }
      }

      this.visibleDuration = getVisibleDuration(sequence);

      if (sequence.clips.length === 0) {
        this.ended = true;
        this.status = "ended";
        this.currentClipId = null;
        this.emitState();
        return;
      }

      this.ended = false;
      this.status = "ready";

      // Set initial position to first clip start
      const firstClip = sequence.clips[0];
      if (Math.abs(this.media.currentTime - firstClip.sourceStart) > this.boundaryTolerance) {
        this.media.currentTime = firstClip.sourceStart;
      }
      this.updateActiveClip(firstClip.id);
      this.emitState();
    } catch (e: any) {
      this.status = "error";
      this.emitState();
      if (this.onError) {
        this.onError(e);
      }
      throw e;
    }
  }

  public play(): void {
    this.checkDisposed();
    const sequence = this.getSequence();
    if (sequence.clips.length === 0) {
      return;
    }

    if (this.ended) {
      // Replay from beginning
      this.ended = false;
      const firstClip = sequence.clips[0];
      this.media.currentTime = firstClip.sourceStart;
    }

    // Verify playhead is in visible range
    const rawTime = this.media.currentTime;
    const mapping = sourceTimeToVisibleTime(sequence, rawTime);
    if (!mapping.isVisible) {
      const resolved = this.resolveRemovedSourceTime(rawTime);
      this.media.currentTime = resolved.resolvedSourceTime;
    }

    this.media.play();
  }

  public pause(): void {
    this.checkDisposed();
    this.media.pause();
  }

  public togglePlayback(): void {
    this.checkDisposed();
    if (this.media.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  public async seekVisibleTime(visibleTime: number): Promise<void> {
    this.checkDisposed();
    if (!Number.isFinite(visibleTime)) {
      throw new Error("Non-finite visible time");
    }

    const sequence = this.getSequence();
    if (sequence.clips.length === 0) {
      this.media.currentTime = 0;
      return;
    }

    // Clamp
    const clamped = Math.max(0, Math.min(this.visibleDuration, visibleTime));
    const gen = ++this.seekGeneration;
    this.isSeekingOrTransitioning = true;
    this.status = "seeking";
    this.preSeekPlayingState = !this.media.paused;

    this.clearSeekTimeout();
    this.seekTimeoutId = setTimeout(() => {
      this.handleSeekTimeout(gen);
    }, 1000) as any;

    if (clamped === 0) {
      const firstClip = sequence.clips[0];
      this.media.currentTime = firstClip.sourceStart;
      this.updateActiveClip(firstClip.id);
    } else if (clamped === this.visibleDuration) {
      const lastClip = sequence.clips[sequence.clips.length - 1];
      this.media.currentTime = lastClip.sourceEnd;
      this.media.pause();
      this.ended = true;
      this.status = "ended";
      this.updateActiveClip(lastClip.id);
    } else {
      const mapping = visibleTimeToSourceTime(sequence, clamped);
      this.media.currentTime = mapping.sourceTime;
      this.updateActiveClip(mapping.clipId);
    }

    this.emitState();
  }

  public seekSourceTime(sourceTime: number): SourceSeekResult {
    this.checkDisposed();
    if (!Number.isFinite(sourceTime)) {
      throw new Error("Non-finite source time");
    }

    const sequence = this.getSequence();
    const resolved = this.resolveRemovedSourceTime(sourceTime);
    const gen = ++this.seekGeneration;

    this.isSeekingOrTransitioning = true;
    this.status = "seeking";
    this.preSeekPlayingState = !this.media.paused;

    this.clearSeekTimeout();
    this.seekTimeoutId = setTimeout(() => {
      this.handleSeekTimeout(gen);
    }, 1000) as any;

    this.media.currentTime = resolved.resolvedSourceTime;

    const s2v = sourceTimeToVisibleTime(sequence, resolved.resolvedSourceTime);
    this.updateActiveClip(s2v.clipId);
    this.emitState();

    return resolved;
  }

  private resolveRemovedSourceTime(sourceTime: number): SourceSeekResult {
    const sequence = this.getSequence();
    const sourceDuration = this.getSourceDuration();

    if (sequence.clips.length === 0) {
      return {
        requestedSourceTime: sourceTime,
        resolvedSourceTime: 0,
        visibleTime: 0,
        wasRemoved: true,
        selectedBoundary: "exact"
      };
    }

    const firstClip = sequence.clips[0];
    const lastClip = sequence.clips[sequence.clips.length - 1];

    if (sourceTime < firstClip.sourceStart) {
      return {
        requestedSourceTime: sourceTime,
        resolvedSourceTime: firstClip.sourceStart,
        visibleTime: 0,
        wasRemoved: true,
        selectedBoundary: "next"
      };
    }

    if (sourceTime > lastClip.sourceEnd) {
      return {
        requestedSourceTime: sourceTime,
        resolvedSourceTime: lastClip.sourceEnd,
        visibleTime: this.visibleDuration,
        wasRemoved: true,
        selectedBoundary: "previous"
      };
    }

    const s2v = sourceTimeToVisibleTime(sequence, sourceTime);
    if (s2v.isVisible) {
      return {
        requestedSourceTime: sourceTime,
        resolvedSourceTime: sourceTime,
        visibleTime: s2v.visibleTime,
        wasRemoved: false,
        selectedBoundary: "exact"
      };
    }

    // It is in a gap. Find nearby clips.
    for (let i = 0; i < sequence.clips.length - 1; i++) {
      const clip = sequence.clips[i];
      const nextClip = sequence.clips[i + 1];
      if (sourceTime >= clip.sourceEnd && sourceTime <= nextClip.sourceStart) {
        const distPrev = sourceTime - clip.sourceEnd;
        const distNext = nextClip.sourceStart - sourceTime;
        if (distPrev <= distNext) {
          const prevMapping = sourceTimeToVisibleTime(sequence, clip.sourceEnd);
          return {
            requestedSourceTime: sourceTime,
            resolvedSourceTime: clip.sourceEnd,
            visibleTime: prevMapping.visibleTime,
            wasRemoved: true,
            selectedBoundary: "previous"
          };
        } else {
          const nextMapping = sourceTimeToVisibleTime(sequence, nextClip.sourceStart);
          return {
            requestedSourceTime: sourceTime,
            resolvedSourceTime: nextClip.sourceStart,
            visibleTime: nextMapping.visibleTime,
            wasRemoved: true,
            selectedBoundary: "next"
          };
        }
      }
    }

    return {
      requestedSourceTime: sourceTime,
      resolvedSourceTime: lastClip.sourceEnd,
      visibleTime: this.visibleDuration,
      wasRemoved: true,
      selectedBoundary: "previous"
    };
  }

  public setPlaybackRate(rate: number): void {
    this.checkDisposed();
    this.media.playbackRate = rate;
  }

  public setVolume(vol: number): void {
    this.checkDisposed();
    this.media.volume = vol;
  }

  public setMuted(muted: boolean): void {
    this.checkDisposed();
    this.media.muted = muted;
  }

  public refreshSequence(): void {
    this.checkDisposed();
    const sequence = this.getSequence();
    const sourceDuration = this.getSourceDuration();
    validateSequenceState(sequence, sourceDuration);

    const oldDur = this.visibleDuration;
    this.visibleDuration = getVisibleDuration(sequence);

    if (sequence.clips.length === 0) {
      this.ended = true;
      this.status = "ended";
      this.currentClipId = null;
      this.emitState();
      return;
    }

    const rawTime = this.media.currentTime;
    const mapping = sourceTimeToVisibleTime(sequence, rawTime);

    if (mapping.isVisible) {
      this.updateActiveClip(mapping.clipId);
    } else {
      // Current time is removed under new sequence. Seek to nearest boundary.
      const resolved = this.resolveRemovedSourceTime(rawTime);

      const targetClip = resolved.selectedBoundary === "next"
        ? sequence.clips.find(clip => Math.abs(clip.sourceStart - resolved.resolvedSourceTime) <= 1e-6)
        : sequence.clips.find(clip => Math.abs(clip.sourceEnd - resolved.resolvedSourceTime) <= 1e-6);
      let safeTarget = resolved.resolvedSourceTime;
      if (targetClip) {
        safeTarget = resolved.selectedBoundary === "next"
          ? Math.min(targetClip.sourceStart + 0.01, targetClip.sourceEnd)
          : Math.max(targetClip.sourceEnd - 0.01, targetClip.sourceStart);
      }

      this.silentSeekEndTime = safeTarget;
      this.media.currentTime = safeTarget;
      this.updateActiveClip(targetClip?.id || null);
    }

    this.emitState();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.clearSeekTimeout();
    this.removeEventListeners();
  }

  private clearSeekTimeout() {
    if (this.seekTimeoutId !== null) {
      clearTimeout(this.seekTimeoutId);
      this.seekTimeoutId = null;
    }
  }

  private handleSeekTimeout(generation: number) {
    if (this.isDisposed) return;
    if (generation !== this.seekGeneration && generation !== this.activeTransitionGeneration) {
      return; // Obsolete generation
    }
    console.warn(`[PlaybackController] Seek/Transition timed out for generation ${generation}. Recovering.`);
    this.isSeekingOrTransitioning = false;
    this.seekTimeoutId = null;

    const rawTime = this.media.currentTime;
    const sequence = this.getSequence();
    const mapping = sourceTimeToVisibleTime(sequence, rawTime);
    this.updateActiveClip(mapping.clipId);

    if (this.ended) {
      this.status = "ended";
    } else {
      this.status = this.media.paused ? "paused" : "playing";
      if (this.preSeekPlayingState && this.media.paused) {
        this.media.play();
      }
    }
    this.emitState();
  }

  // Media element event handlers
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
    if (
      this.isDisposed ||
      this.isSeekingOrTransitioning
    ) {
      return;
    }

    const sequence = this.getSequence();

    if (sequence.clips.length === 0) {
      return;
    }

    const rawTime = this.media.currentTime;

    const activeClip = sequence.clips.find(
      clip =>
        rawTime >= clip.sourceStart &&
        rawTime < clip.sourceEnd
    );

    if (!activeClip) {
      const firstClip = sequence.clips[0];

      if (rawTime < firstClip.sourceStart) {
        this.transitionToClip(firstClip);
        return;
      }

      const nextClip = this.findNextVisibleClip(
        sequence,
        rawTime
      );

      if (nextClip) {
        this.transitionToClip(nextClip);
        return;
      }

      this.triggerPlaybackEnded();
      return;
    }

    this.updateActiveClip(activeClip.id);

    if (rawTime + this.boundaryTolerance >= activeClip.sourceEnd) {
      const index = sequence.clips.findIndex(
        clip => clip.id === activeClip.id
      );

      const nextClip = sequence.clips[index + 1];

      if (nextClip) {
        this.transitionToClip(nextClip);
      } else {
        this.triggerPlaybackEnded();
      }

      return;
    }

    this.scheduleStateEmit();
  }

  private triggerPlaybackEnded() {
    const sequence = this.getSequence();
    const lastClip = sequence.clips[sequence.clips.length - 1];
    this.media.pause();
    this.media.currentTime = lastClip.sourceEnd;
    this.ended = true;
    this.status = "ended";
    this.emitState();
  }

  private handlePlay() {
    if (this.isDisposed) return;
    this.status = "playing";
    this.emitState();
  }

  private handlePause() {
    if (this.isDisposed) return;
    if (this.status !== "ended") {
      this.status = "paused";
    }
    this.emitState();
  }

  private handleSeeking() {
    if (this.isDisposed) return;
    if (this.silentSeekEndTime !== null) return;
    if (this.isSeekingOrTransitioning) return;

    if (this.status !== "seeking") {
      this.status = "seeking";
      this.emitState();
    }
  }

  private handleSeeked() {
    if (this.isDisposed) {
      return;
    }

    this.clearSeekTimeout();

    const transition = this.internalTransition;

    if (transition) {
      this.internalTransition = null;
      this.silentSeekEndTime = null;
      this.isSeekingOrTransitioning = false;

      this.status = transition.resumePlayback
        ? "playing"
        : "paused";

      this.updateActiveClip(
        transition.targetClipId
      );

      if (
        transition.resumePlayback &&
        this.media.paused
      ) {
        this.resumeMedia();
      }

      this.emitState();
      return;
    }

    this.isSeekingOrTransitioning = false;
    this.silentSeekEndTime = null;

    if (this.ended) {
      this.status = "ended";
    } else {
      this.status = this.media.paused
        ? "paused"
        : "playing";

      if (
        this.preSeekPlayingState &&
        this.media.paused
      ) {
        this.resumeMedia();
      }
    }

    this.emitState();
  }

  private handleEnded() {
    if (this.isDisposed) return;
    this.triggerPlaybackEnded();
  }

  private handleRatechange() {
    if (this.isDisposed) return;
    this.emitState();
  }

  private handleVolumechange() {
    if (this.isDisposed) return;
    this.emitState();
  }

  private handleError() {
    if (this.isDisposed) return;
    this.status = "error";
    this.emitState();
  }

  private updateActiveClip(clipId: string | null) {
    if (clipId !== this.currentClipId) {
      this.currentClipId = clipId;
      if (this.onClipChange) {
        this.onClipChange(clipId);
      }
    }
  }

  public getState(): PlaybackState {
    const sequence = this.getSequence();
    const rawTime = this.media.currentTime;
    let visibleTime = 0;

    if (sequence.clips.length > 0) {
      const s2v = sourceTimeToVisibleTime(sequence, rawTime);
      visibleTime = s2v.visibleTime;
    }

    return {
      status: this.status,
      sourceTime: roundTo6(rawTime),
      visibleTime: roundTo6(visibleTime),
      visibleDuration: this.visibleDuration,
      activeClipId: this.currentClipId,
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
