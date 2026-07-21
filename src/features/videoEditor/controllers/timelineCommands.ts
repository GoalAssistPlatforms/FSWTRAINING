import { VideoSequence } from "../domain/editorTypes";

export type TimelineCommandType =
  | "RemoveVisibleRange"
  | "RemoveVisibleRanges"
  | "RestoreRemovedRange"
  | "MoveRemovedRange"
  | "ResizeRemovedRange"
  | "SetStartTrim"
  | "SetEndTrim"
  | "UndoTimelineEdit"
  | "RedoTimelineEdit";

export interface TimelineCommandPayload {
  visibleStart?: number;
  visibleEnd?: number;
  sourceStart?: number;
  sourceEnd?: number;
  originalSourceStart?: number;
  originalSourceEnd?: number;
  legacyMigration?: any;
  [key: string]: any;
}

export interface TimelineCommand {
  id: string;
  projectId: string;
  sourceAssetId: string;
  type: TimelineCommandType;
  beforeSequence: VideoSequence;
  afterSequence: VideoSequence;
  revisionBefore: number;
  revisionAfter: number;
  createdAt: string;
  payload: TimelineCommandPayload;
}
