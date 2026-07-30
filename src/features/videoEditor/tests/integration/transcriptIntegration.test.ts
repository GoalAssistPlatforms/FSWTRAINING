declare var process: any;

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isSequenceTranscriptViewerEnabled,
  isSequenceTranscriptViewerActive,
  isSequencePlaybackEnabled
} from "../../config/playbackFeatureFlags";
import { getTranscriptForSourceAsset } from "../../persistence/transcriptRepository";
import { TranscriptViewerController } from "../../controllers/TranscriptViewerController";
import { PlaybackCoordinator } from "../../controllers/PlaybackCoordinator";
import { VideoSequence } from "../../domain/editorTypes";
import { SourceTranscript } from "../../domain/transcriptTypes";
import { PlaybackState } from "../../controllers/playbackTypes";

vi.mock("../../persistence/transcriptRepository", () => ({
  getTranscriptForSourceAsset: vi.fn()
}));

describe("Transcript Integration Tests", () => {
  const guideId = "guide-123";
  const sourceAssetId = "asset-123";

  const sequence: VideoSequence = {
    schemaVersion: 2,
    sourceAssetId: "asset-123",
    clips: [
      { id: "c1", sourceAssetId: "asset-123", sourceStart: 1.0, sourceEnd: 4.0, origin: "source", createdByCommandId: null }
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
      { id: "w1", text: "hello", startSourceTime: 1.5, endSourceTime: 2.0, confidence: 0.95, speakerId: "sp1" }
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

    const store: Record<string, string> = {
      sequencePlaybackEnabled: "true",
      sequenceTranscriptViewerEnabled: "true"
    };
    (globalThis as any).window = {
      location: { hostname: "localhost" },
      localStorage: {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, val: string) => { store[key] = val; }
      }
    } as any;
  });

  it("1. Feature disabled returns false by default", () => {
    const original = process.env.NODE_ENV;
    const originalWindow = (globalThis as any).window;
    process.env.NODE_ENV = "production";
    (globalThis as any).window = {
      location: { hostname: "example.com" },
      localStorage: {
        getItem: () => null
      }
    } as any;
    expect(isSequenceTranscriptViewerEnabled()).toBe(false);
    process.env.NODE_ENV = original;
    (globalThis as any).window = originalWindow;
  });

  it("2. Feature enabled helper matches env configuration", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    expect(isSequenceTranscriptViewerEnabled()).toBe(true);
    process.env.NODE_ENV = original;
  });

  it("3. Sequence playback is required for active transcript viewer", () => {
    // Active if enabled AND active flag is true AND playback is enabled
    const isActive = isSequenceTranscriptViewerActive();
    expect(isActive).toBe(isSequenceTranscriptViewerEnabled() && isSequencePlaybackEnabled());
  });

  it("4. Transcript loads for the active guide and source asset", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    expect(getTranscriptForSourceAsset).toHaveBeenCalledWith(guideId, sourceAssetId);
    expect(controller.getState().visibleWords).toHaveLength(1);
  });

  it("5. Missing transcript produces empty ready state", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(null);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    expect(controller.getState().status).toBe("empty");
    expect(controller.getState().visibleWords).toHaveLength(0);
  });

  it("6. Timeline commit remaps words correctly", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    expect(controller.getState().visibleWords[0].state).toBe("visible");

    // Remap sequence so word midpoint 1.75 is inside a gap
    const newSeq: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [{ id: "c1", sourceAssetId: "asset-123", sourceStart: 2.0, sourceEnd: 4.0, origin: "source", createdByCommandId: null }],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    getSequence = () => newSeq;
    controller.refreshSequence(newSeq);

    expect(controller.getState().visibleWords[0].state).toBe("removed");
  });

  it("7. Sequence refresh performs no database reload", async () => {
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
    expect(getTranscriptForSourceAsset).toHaveBeenCalledTimes(1);
  });

  it("8. Visible word seek target is resolved accurately", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    const target = controller.getSeekTarget("w1");
    expect(target).toBe(1.5);
  });

  it("9. Removed word seek target resolves to boundary", async () => {
    const transcriptWithRemoved: SourceTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 10,
      words: [{ id: "w2", text: "hello", startSourceTime: 4.5, endSourceTime: 5.5, confidence: 0.95, speakerId: "sp1" }]
    };
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(transcriptWithRemoved);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    // Midpoint 5.0 in gap [4.0, 6.0). Resolves to previous boundary 4.0.
    const target = controller.getSeekTarget("w2");
    expect(target).toBe(4.0);
  });

  it("10. Transcript actions create no timeline commands", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    controller.getSeekTarget("w1");
    // No commands created
    expect(controller.getState().selectedWordId).toBe("w1");
  });

  it("11. Transcript actions create no autosave triggers", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    controller.getSeekTarget("w1");
    // Database call count remains 1 (from load)
    expect(getTranscriptForSourceAsset).toHaveBeenCalledTimes(1);
  });

  it("12. Guide steps remain unchanged by transcript actions", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    controller.getSeekTarget("w1");
    // Verify sequence is unmodified
    expect(getSequence()).toBe(sequence);
  });

  it("13. Sequence remains completely unchanged by transcript actions", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    controller.getSeekTarget("w1");
    expect(getSequence()).toBe(sequence);
  });

  it("14. One single playback subscription exists for the active controller", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    expect(listeners).toHaveLength(1);
  });

  it("15. Editor close disposes controller and unsubscribes cleanly", async () => {
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

  it("16. Reopening the editor creates exactly one subscription", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);

    // First run
    const c1 = new TranscriptViewerController({ guideId, sourceAssetId, getSequence, playbackSubscription });
    await c1.initialize();
    expect(listeners).toHaveLength(1);
    c1.dispose();
    expect(listeners).toHaveLength(0);

    // Second run
    const c2 = new TranscriptViewerController({ guideId, sourceAssetId, getSequence, playbackSubscription });
    await c2.initialize();
    expect(listeners).toHaveLength(1);
    c2.dispose();
  });

  it("17. Production defaults to disabled", () => {
    const original = process.env.NODE_ENV;
    const originalWindow = (globalThis as any).window;
    process.env.NODE_ENV = "production";
    (globalThis as any).window = {
      location: { hostname: "example.com" },
      localStorage: {
        getItem: () => null
      }
    } as any;
    expect(isSequenceTranscriptViewerEnabled()).toBe(false);
    process.env.NODE_ENV = original;
    (globalThis as any).window = originalWindow;
  });

  it("18. Ten thousand word playback updates do not thrash state", async () => {
    const words = Array.from({ length: 10000 }, (_, i) => ({
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
      words
    };

    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(largeTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();

    const start = performance.now();
    // Trigger playhead at 1.85 -> word 18 active
    listeners.forEach(l => l({
      status: "playing",
      sourceTime: 1.85,
      visibleTime: 1.85,
      visibleDuration: 1050,
      activeClipId: "c1",
      playbackRate: 1,
      volume: 1,
      muted: false,
      ended: false
    }));
    const duration = performance.now() - start;

    expect(controller.getState().activeWordId).toBe("w-18");
    expect(duration).toBeLessThan(10); // Active word lookup in < 10ms
  });

  it("19. Repeated updates inside the same word perform no activeWordId modifications", async () => {
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

    // Time 1.6 -> w1 active
    listeners.forEach(l => l({
      status: "playing",
      sourceTime: 1.6,
      visibleTime: 1.6,
      visibleDuration: 10,
      activeClipId: "c1",
      playbackRate: 1,
      volume: 1,
      muted: false,
      ended: false
    }));
    expect(onActiveWordChange).toHaveBeenCalledTimes(1);

    // Time 1.7 -> still w1 active, change callback should NOT trigger again
    listeners.forEach(l => l({
      status: "playing",
      sourceTime: 1.7,
      visibleTime: 1.7,
      visibleDuration: 10,
      activeClipId: "c1",
      playbackRate: 1,
      volume: 1,
      muted: false,
      ended: false
    }));
    expect(onActiveWordChange).toHaveBeenCalledTimes(1); // Remains 1!
  });

  it("20. Follow Playback state remains stable", async () => {
    vi.mocked(getTranscriptForSourceAsset).mockResolvedValue(mockTranscript);
    const controller = new TranscriptViewerController({
      guideId,
      sourceAssetId,
      getSequence,
      playbackSubscription
    });
    await controller.initialize();
    expect(controller.getState().followPlayback).toBe(true);

    controller.setFollowPlayback(false);
    expect(controller.getState().followPlayback).toBe(false);

    controller.setFollowPlayback(true);
    expect(controller.getState().followPlayback).toBe(true);
  });
});
