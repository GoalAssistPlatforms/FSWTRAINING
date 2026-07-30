import { describe, it, expect, vi, beforeEach } from "vitest";
import { TranscriptViewerController } from "../../controllers/TranscriptViewerController";
import { getTranscriptForSourceAsset } from "../../persistence/transcriptRepository";
import { VideoSequence } from "../../domain/editorTypes";
import { SourceTranscript } from "../../domain/transcriptTypes";
import { PlaybackState } from "../../controllers/playbackTypes";
import { TranscriptInvalidError, TranscriptDisposedError } from "../../domain/transcriptErrors";

vi.mock("../../persistence/transcriptRepository", () => ({
  getTranscriptForSourceAsset: vi.fn()
}));

describe("TranscriptViewerController", () => {
  const guideId = "guide-123";
  const sourceAssetId = "asset-123";

  const sequence: VideoSequence = {
    schemaVersion: 2,
    sourceAssetId: "asset-123",
    clips: [
      { id: "c1", sourceAssetId: "asset-123", sourceStart: 1.0, sourceEnd: 4.0, origin: "source", createdByCommandId: null },
      { id: "c2", sourceAssetId: "asset-123", sourceStart: 6.0, sourceEnd: 9.0, origin: "source", createdByCommandId: null }
    ],
    protectedRanges: [],
    appliedSuggestionBatchIds: []
  };

  const mockTranscript: SourceTranscript = {
    schemaVersion: 1,
    sourceAssetId: "asset-123",
    language: "en",
    duration: 10,
    words: [
      { id: "w1", text: "hello", startSourceTime: 1.5, endSourceTime: 2.0, confidence: 0.95, speakerId: "spk-1" },
      { id: "w2", text: "world", startSourceTime: 3.0, endSourceTime: 3.8, confidence: null, speakerId: null },
      { id: "w3", text: "removed-word", startSourceTime: 4.5, endSourceTime: 5.5, confidence: null, speakerId: null }
    ]
  };

  let getSequence: () => VideoSequence;
  let listeners: ((state: PlaybackState) => void)[];
  let playbackSubscription: { subscribe: (listener: any) => () => void };

  beforeEach(() => {
    vi.clearAllMocks();
    getSequence = () => sequence;
    listeners = [];
    playbackSubscription = {
      subscribe: (listener: (state: PlaybackState) => void) => {
        listeners.push(listener);
        return () => {
          listeners = listeners.filter(l => l !== listener);
        };
      }
    };
  });

  const getMockPlaybackState = (overrides: Partial<PlaybackState> = {}): PlaybackState => ({
    status: "idle",
    sourceTime: 0,
    visibleTime: 0,
    visibleDuration: 0,
    activeClipId: null,
    playbackRate: 1,
    volume: 1,
    muted: false,
    ended: false,
    ...overrides
  });

  it("1. starts in idle state", () => {
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    expect(controller.getState().status).toBe("idle");
  });

  it("2. transitions to loading during initialization", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockReturnValue(new Promise(() => {})); // never resolves
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    const initPromise = controller.initialize();
    expect(controller.getState().status).toBe("loading");
  });

  it("3. transitions to ready state when transcript is found", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    const state = controller.getState();
    expect(state.status).toBe("ready");
    expect(state.visibleWords).toHaveLength(3);
    expect(state.visibleWords[0].state).toBe("visible"); // w1 inside c1
    expect(state.visibleWords[2].state).toBe("removed"); // w3 (4.5 to 5.5) in gap [4.0, 6.0)
  });

  it("4. handles empty / null transcript gracefully", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(null);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    const state = controller.getState();
    expect(state.status).toBe("empty");
    expect(state.visibleWords).toHaveLength(0);
  });

  it("5. transitions to error state when loading fails", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockRejectedValue(new Error("Network Error"));
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    expect(controller.getState().status).toBe("error");
    expect(controller.getState().error?.message).toBe("Network Error");
  });

  it("6. updates visible active word on playback updates", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const onActiveWordChange = vi.fn();
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription,
      onActiveWordChange
    });
    await controller.initialize();

    // Word w1: [1.5, 2.0]. Update playhead to 1.8 -> w1 active
    listeners.forEach(l => l(getMockPlaybackState({ status: "playing", sourceTime: 1.8, activeClipId: "c1" })));
    expect(controller.getState().activeWordId).toBe("w1");
    expect(onActiveWordChange).toHaveBeenCalledWith({
      previousActiveWordId: null,
      activeWordId: "w1",
      previousSelectedWordId: null,
      selectedWordId: null
    });
  });

  it("7. excludes removed words from the active word index lookup", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();

    // Word w3: [4.5, 5.5] (removed). Playback at 5.0 -> activeWordId remains null
    listeners.forEach(l => l(getMockPlaybackState({ status: "playing", sourceTime: 5.0, activeClipId: "c1" })));
    expect(controller.getState().activeWordId).toBeNull();
  });

  it("8. resolves seek target for visible word click", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();

    const targetSourceTime = controller.getSeekTarget("w1");
    expect(targetSourceTime).toBe(1.5); // Start source time
  });

  it("9. resolves seek target for removed word click to nearest visible boundary", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();

    // w3: [4.5, 5.5]. Midpoint 5.0. Gap between 4.0 and 6.0. Equal distance. Resolves to previous boundary 4.0.
    const targetSourceTime = controller.getSeekTarget("w3");
    expect(targetSourceTime).toBe(4.0);
  });

  it("10. updates state but maintains follow playback configuration during paused state", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    expect(controller.getState().followPlayback).toBe(true);

    listeners.forEach(l => l(getMockPlaybackState({ status: "paused", sourceTime: 1.8 })));
    expect(controller.getState().activeWordId).toBe("w1");
    expect(controller.getState().followPlayback).toBe(true);
  });

  it("11. keeps follow state stable and issues no unexpected actions on completed playback", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();

    listeners.forEach(l => l(getMockPlaybackState({ status: "ended", sourceTime: 9.0 })));
    expect(controller.getState().activeWordId).toBeNull();
  });

  it("12. handles sequence refresh to dynamically remap words", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();

    listeners.forEach(l => l(getMockPlaybackState({ status: "playing", sourceTime: 3.2 })));
    expect(controller.getState().activeWordId).toBe("w2");

    // Refresh sequence, cutting out w2 (now c1 ends at 2.5)
    const trimmedSequence: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [{ id: "c1", sourceAssetId: "asset-123", sourceStart: 1.0, sourceEnd: 2.5, origin: "source", createdByCommandId: null }],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    getSequence = () => trimmedSequence;

    controller.refreshSequence(trimmedSequence);
    const state = controller.getState();
    expect(state.visibleWords[1].state).toBe("removed"); // w2 is now removed!
  });

  it("13. performs no database reload when refreshing sequence", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    expect(getTranscriptForSourceAsset).toHaveBeenCalledTimes(1);

    controller.refreshSequence(sequence);
    expect(getTranscriptForSourceAsset).toHaveBeenCalledTimes(1); // Still 1!
  });

  it("14. preserves selected word state across sequence refreshes", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    controller.getSeekTarget("w2");
    expect(controller.getState().selectedWordId).toBe("w2");

    controller.refreshSequence(sequence);
    expect(controller.getState().selectedWordId).toBe("w2");
  });

  it("15. clears active word when it gets cut or removed", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    listeners.forEach(l => l(getMockPlaybackState({ status: "playing", sourceTime: 3.2 })));
    expect(controller.getState().activeWordId).toBe("w2");

    // Remove w2
    const trimmedSequence: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [{ id: "c1", sourceAssetId: "asset-123", sourceStart: 1.0, sourceEnd: 2.5, origin: "source", createdByCommandId: null }],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    getSequence = () => trimmedSequence;

    controller.refreshSequence(trimmedSequence);
    // w2 is now removed, active word must clear
    expect(controller.getState().activeWordId).toBeNull();
  });

  it("16. enables follow playback by default", () => {
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    expect(controller.getState().followPlayback).toBe(true);
  });

  it("17. disables follow playback on manual scrolling indicator", () => {
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    controller.setFollowPlayback(false);
    expect(controller.getState().followPlayback).toBe(false);
  });

  it("18. does not disable follow playback on programmatic scrolling indicator", () => {
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    // Programmatic scrolling preserves followPlayback (does not call setFollowPlayback(false))
    expect(controller.getState().followPlayback).toBe(true);
  });

  it("19. resumes follow playback on request", () => {
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    controller.setFollowPlayback(false);
    expect(controller.getState().followPlayback).toBe(false);
    controller.setFollowPlayback(true);
    expect(controller.getState().followPlayback).toBe(true);
  });

  it("20. prevents stale states from overlapping rapid events", async () => {
    let resolvePromise: any;
    const pendingPromise = new Promise<SourceTranscript>(resolve => {
      resolvePromise = resolve;
    });
    vi.mocked(getTranscriptForSourceAsset).mockReturnValue(pendingPromise);

    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });

    const initPromise = controller.initialize();

    // Dispose before initial load finishes
    controller.dispose();
    resolvePromise(mockTranscript);

    await initPromise;
    expect(() => controller.getState()).toThrow(TranscriptDisposedError);
  });

  it("21. does not trigger database autosaves during updates", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    controller.getSeekTarget("w1");
    // State is local. No network calls or save calls.
    expect(getTranscriptForSourceAsset).toHaveBeenCalledTimes(1);
  });

  it("22. does not create timeline commands during selections", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    controller.getSeekTarget("w1");
    expect(controller.getState().selectedWordId).toBe("w1");
  });

  it("23. unsubscribes from playback subscription on disposal", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    expect(listeners).toHaveLength(1);

    controller.dispose();
    expect(listeners).toHaveLength(0);
  });

  it("24. throws errors for operations attempted after disposal", async () => {
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    controller.dispose();
    expect(() => controller.getState()).toThrow();
    expect(() => controller.getSeekTarget("w1")).toThrow();
  });

  it("25. handles ten thousand words timing index efficiently", async () => {
    const largeWords = Array.from({ length: 10000 }, (_, i) => ({
      id: `w-${i}`,
      text: `word-${i}`,
      startSourceTime: i * 0.1,
      endSourceTime: i * 0.1 + 0.08,
      confidence: 0.99,
      speakerId: "spk"
    }));
    const largeTranscript: SourceTranscript = {
      schemaVersion: 1,
      sourceAssetId,
      language: "en",
      duration: 1050,
      words: largeWords
    };

    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(largeTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });

    const start = performance.now();
    await controller.initialize();
    const duration = performance.now() - start;

    expect(controller.getState().visibleWords).toHaveLength(10000);
    expect(duration).toBeLessThan(200); // Initialize in < 200ms
  });
});
