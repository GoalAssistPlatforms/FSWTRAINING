import { VideoSequence } from "../domain/editorTypes";

export type TimelineDragMode = "start" | "end" | "range" | "playhead" | null;

export interface TimelinePersistentState {
  sequence: VideoSequence;
  projectRevision: number;
}

export interface TimelineTransientState {
  selection: TimelineSelection | null;
  previewSequence: VideoSequence | null;
  dragMode: TimelineDragMode | null;
  focusedHandle: "start" | "end" | null;
  hoveredJoinId: string | null;
}

export interface TimelineSelection {
  startVisibleTime: number;
  endVisibleTime: number;
}
