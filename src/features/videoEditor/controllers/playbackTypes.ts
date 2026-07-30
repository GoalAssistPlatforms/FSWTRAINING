import { VideoSequence } from "../domain/editorTypes";

export type PlaybackStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "seeking"
  | "ended"
  | "error";

export interface PlaybackState {
  status: PlaybackStatus;
  sourceTime: number;
  visibleTime: number;
  visibleDuration: number;
  activeClipId: string | null;
  playbackRate: number;
  volume: number;
  muted: boolean;
  ended: boolean;
}

export interface IMediaElement {
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: string, listener: any): void;
  removeEventListener(type: string, listener: any): void;
}

export interface PlaybackControllerOptions {
  media: IMediaElement;
  getSequence: () => VideoSequence;
  getSourceDuration: () => number;
  boundaryTolerance?: number;
  onStateChange?: (state: PlaybackState) => void;
  onClipChange?: (clipId: string | null) => void;
  onError?: (error: any) => void;
}

export interface PlaybackStateSubscription {
  subscribe(listener: (state: PlaybackState) => void): () => void;
}
