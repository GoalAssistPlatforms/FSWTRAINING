import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlaybackCoordinator } from "../../controllers/PlaybackCoordinator";
import { LegacyVideoEdits, VideoSequence } from "../../domain/editorTypes";
import { IMediaElement } from "../../controllers/playbackTypes";

class MockMediaElement implements IMediaElement {
  public currentTime = 0;
  public duration = 100;
  public playbackRate = 1;
  public volume = 1;
  public muted = false;
  public paused = true;

  public listeners: Record<string, Function[]> = {};
  public addLog: string[] = [];
  public removeLog: string[] = [];
  public pauseCalled = false;

  public addEventListener(type: string, listener: any) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
    this.addLog.push(type);
  }

  public removeEventListener(type: string, listener: any) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(l => l !== listener);
    this.removeLog.push(type);
  }

  public play() { this.paused = false; }
  public pause() {
    this.paused = true;
    this.pauseCalled = true;
  }

  public clearLogs() {
    this.addLog = [];
    this.removeLog = [];
  }
}

describe("Playback Fallback Integration Tests", () => {
  let media: MockMediaElement;
  let legacyEdits: LegacyVideoEdits;
  let sequence: VideoSequence;
  let getSourceDuration: () => number;

  beforeEach(() => {
    media = new MockMediaElement();
    legacyEdits = {
      trimStart: 10,
      trimEnd: 90,
      cuts: [{ start: 40, end: 60 }]
    };
    sequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "c-1", sourceAssetId: "asset-123", sourceStart: 10, sourceEnd: 40, origin: "source", createdByCommandId: null },
        { id: "c-2", sourceAssetId: "asset-123", sourceStart: 60, sourceEnd: 90, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    getSourceDuration = () => 100;

    // Mock window to enable sequence mode
    (globalThis as any).window = {
      localStorage: {
        getItem: (key: string) => key === "sequencePlaybackEnabled" ? "true" : null,
        setItem: () => {},
        removeItem: () => {}
      },
      location: {
        hostname: "localhost"
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it("1. Preparation Fallback: falls back to legacy mode when sequence loading throws validation error", async () => {
    // Sequence clip end (150) exceeds source duration (100) -> fails validation on load()
    const invalidSequence = {
      ...sequence,
      clips: [{ id: "c-1", sourceAssetId: "asset-123", sourceStart: 10, sourceEnd: 150, origin: "source" as const, createdByCommandId: null }]
    };

    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: () => invalidSequence,
      getSourceDuration
    });

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await coordinator.load();

    expect(coordinator.getPlaybackMode()).toBe("legacy");
    expect(consoleWarnSpy).toHaveBeenCalled(); // diagnostic log produced
    consoleWarnSpy.mockRestore();
  });

  it("2. Runtime Fallback: pauses, captures position, disposes sequence, attaches legacy, restores position, logs warning, and continues playback", async () => {
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: () => sequence,
      getSourceDuration
    });

    await coordinator.load();
    expect(coordinator.getPlaybackMode()).toBe("sequence");

    // Simulate playback state before error
    coordinator.play();
    media.currentTime = 35; // inside clip 1
    media.pauseCalled = false;
    media.clearLogs();

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Trigger runtime error
    (coordinator as any).handleRuntimeError(new Error("Playback decoder stall"));

    // Assertions:
    // 1. Media is paused
    expect(media.paused).toBe(true);
    expect(media.pauseCalled).toBe(true);

    // 2. Playback mode transitioned to legacy
    expect(coordinator.getPlaybackMode()).toBe("legacy");

    // 3. Sequence listeners were removed
    expect(media.removeLog).toContain("timeupdate");

    // 4. Legacy controller attached (adds listeners again)
    expect(media.addLog).toContain("timeupdate");

    // 5. Restored position: 35 is visible under legacy edits, so it should seek back to 35
    expect(media.currentTime).toBe(35);

    // 6. Diagnostic log produced
    expect(consoleErrorSpy).toHaveBeenCalled();

    // 7. No project edits changed
    expect(legacyEdits.trimStart).toBe(10);
    expect(legacyEdits.cuts?.length).toBe(1);

    // 8. Playback can continue after fallback
    coordinator.play();
    expect(media.paused).toBe(false);

    consoleErrorSpy.mockRestore();
  });
});
