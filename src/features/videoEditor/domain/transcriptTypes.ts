export interface TranscriptWord {
  id: string;
  text: string;
  startSourceTime: number;
  endSourceTime: number;
  confidence: number | null;
  speakerId: string | null;
}

export interface SourceTranscript {
  schemaVersion: 1;
  sourceAssetId: string;
  language: string;
  duration: number;
  words: TranscriptWord[];
}

export interface VisibleTranscriptWord {
  word: TranscriptWord;
  state: "visible" | "removed";
  visibleStartTime: number | null;
  visibleEndTime: number | null;
  nearestVisibleSourceTime: number;
}
