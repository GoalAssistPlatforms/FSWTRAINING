import { SourceTranscript, VisibleTranscriptWord } from "../domain/transcriptTypes";
import { VideoSequence } from "../domain/editorTypes";
import {
  getTranscriptForSourceAsset,
  upsertTranscriptForSourceAsset
} from "../persistence/transcriptRepository";
import {
  mapTranscriptToVisibleWords,
  buildTimingIndex,
  findActiveTranscriptWord,
  resolveTranscriptWordSeek,
  TimingIndexEntry
} from "../domain/transcriptMapping";
import { validateSourceTranscript } from "../domain/transcriptValidation";
import { TranscriptDisposedError } from "../domain/transcriptErrors";

export class TranscriptService {
  private cachedTranscript: SourceTranscript | null = null;
  private cachedVisibleWords: VisibleTranscriptWord[] = [];
  private cachedTimingIndex: TimingIndexEntry[] = [];
  private isDisposed = false;

  public async loadTranscript(
    guideId: string,
    sourceAssetId: string,
    sequence: VideoSequence
  ): Promise<SourceTranscript | null> {
    this.checkDisposed();
    const transcript = await getTranscriptForSourceAsset(guideId, sourceAssetId);
    if (transcript) {
      validateSourceTranscript(transcript);
      this.cachedTranscript = transcript;
      this.remapSequence(sequence);
    } else {
      this.cachedTranscript = null;
      this.cachedVisibleWords = [];
      this.cachedTimingIndex = [];
    }
    return this.cachedTranscript;
  }

  public async importTranscript(
    guideId: string,
    sourceAssetId: string,
    transcript: SourceTranscript,
    sequence: VideoSequence
  ): Promise<number> {
    this.checkDisposed();
    validateSourceTranscript(transcript);
    const revision = await upsertTranscriptForSourceAsset(guideId, sourceAssetId, transcript);
    this.cachedTranscript = transcript;
    this.remapSequence(sequence);
    return revision;
  }

  public remapSequence(sequence: VideoSequence): void {
    this.checkDisposed();
    if (!this.cachedTranscript) {
      this.cachedVisibleWords = [];
      this.cachedTimingIndex = [];
      return;
    }
    this.cachedVisibleWords = mapTranscriptToVisibleWords(this.cachedTranscript, sequence);
    this.cachedTimingIndex = buildTimingIndex(this.cachedVisibleWords, sequence);
  }

  public loadDemoTranscript(transcript: SourceTranscript, sequence: VideoSequence): void {
    this.checkDisposed();
    validateSourceTranscript(transcript);
    this.cachedTranscript = transcript;
    this.remapSequence(sequence);
  }

  public getCachedTranscript(): SourceTranscript | null {
    this.checkDisposed();
    return this.cachedTranscript;
  }

  public getVisibleWords(): VisibleTranscriptWord[] {
    this.checkDisposed();
    return this.cachedVisibleWords;
  }

  public getTimingIndex(): TimingIndexEntry[] {
    this.checkDisposed();
    return this.cachedTimingIndex;
  }

  public findActiveWord(sourceTime: number): VisibleTranscriptWord | null {
    this.checkDisposed();
    return findActiveTranscriptWord(this.cachedTimingIndex, sourceTime);
  }

  public resolveSeekSourceTime(
    vw: VisibleTranscriptWord,
    sequence: VideoSequence
  ): number {
    this.checkDisposed();
    return resolveTranscriptWordSeek(vw, sequence);
  }

  public dispose(): void {
    this.isDisposed = true;
    this.cachedTranscript = null;
    this.cachedVisibleWords = [];
    this.cachedTimingIndex = [];
  }

  private checkDisposed(): void {
    if (this.isDisposed) {
      throw new TranscriptDisposedError("TranscriptService has been disposed");
    }
  }
}
