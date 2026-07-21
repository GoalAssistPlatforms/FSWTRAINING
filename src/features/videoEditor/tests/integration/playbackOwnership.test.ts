import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PlaybackCoordinator } from "../../controllers/PlaybackCoordinator";
import { LegacyVideoEdits, VideoSequence } from "../../domain/editorTypes";
import { IMediaElement } from "../../controllers/playbackTypes";

class MockMediaElement implements IMediaElement {
  public currentTime = 0;
  public duration = 120;
  public playbackRate = 1;
  public volume = 1;
  public muted = false;
  public paused = true;

  public listeners: Record<string, Function[]> = {};
  public addLog: string[] = [];
  public removeLog: string[] = [];

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

  public play() { this.paused = false; this.trigger("play"); }
  public pause() { this.paused = true; this.trigger("pause"); }

  public trigger(type: string) {
    if (this.listeners[type]) {
      const current = [...this.listeners[type]];
      for (const l of current) l();
    }
  }

  public getListenersCount(type: string): number {
    return this.listeners[type]?.length || 0;
  }

  public clearLogs() {
    this.addLog = [];
    this.removeLog = [];
  }
}

describe("Playback Ownership and Listener Exclusivity Tests", () => {
  let media: MockMediaElement;
  let legacyEdits: LegacyVideoEdits;
  let validSequence: VideoSequence;
  let getSequence: () => VideoSequence;
  let getSourceDuration: () => number;
  let sequencePlaybackEnabledVal = "false";

  beforeEach(() => {
    media = new MockMediaElement();
    legacyEdits = { trimStart: 0, trimEnd: null, cuts: [] };
    validSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "clip-1", sourceAssetId: "asset-123", sourceStart: 10, sourceEnd: 30, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    getSequence = () => validSequence;
    getSourceDuration = () => 120;

    // Define mock window
    sequencePlaybackEnabledVal = "false";
    (globalThis as any).window = {
      localStorage: {
        getItem: (key: string) => key === "sequencePlaybackEnabled" ? sequencePlaybackEnabledVal : null,
        setItem: (key: string, val: string) => { if (key === "sequencePlaybackEnabled") sequencePlaybackEnabledVal = val; },
        removeItem: (key: string) => { if (key === "sequencePlaybackEnabled") sequencePlaybackEnabledVal = "false"; }
      },
      location: {
        hostname: "localhost"
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it("1. Legacy mode attaches only legacy listeners", async () => {
    sequencePlaybackEnabledVal = "false";

    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence,
      getSourceDuration
    });

    await coordinator.load();
    expect(coordinator.getPlaybackMode()).toBe("legacy");

    // Verify legacy listeners are registered (exactly 1 per event type)
    expect(media.getListenersCount("timeupdate")).toBe(1);
    expect(media.getListenersCount("play")).toBe(1);
  });

  it("2. Sequence mode attaches only sequence listeners", async () => {
    sequencePlaybackEnabledVal = "true";

    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence,
      getSourceDuration
    });

    await coordinator.load();
    expect(coordinator.getPlaybackMode()).toBe("sequence");
    expect(media.getListenersCount("timeupdate")).toBe(1);
    expect(media.getListenersCount("play")).toBe(1);
  });

  it("3. Enabling sequence mode disposes legacy ownership first", async () => {
    sequencePlaybackEnabledVal = "false";

    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence,
      getSourceDuration
    });

    // Load in legacy mode first
    await coordinator.load();
    expect(coordinator.getPlaybackMode()).toBe("legacy");
    media.clearLogs();

    // Enable sequence mode and load again
    sequencePlaybackEnabledVal = "true";
    await coordinator.load();
    expect(coordinator.getPlaybackMode()).toBe("sequence");

    // Check that removeEventListener was called for the legacy events before adding sequence events
    expect(media.removeLog).toContain("timeupdate");
    expect(media.getListenersCount("timeupdate")).toBe(1);
  });

  it("4. Falling back disposes sequence ownership first", async () => {
    sequencePlaybackEnabledVal = "true";

    // Force validation failure to trigger preparation fallback
    const getInvalidSequence = () => ({
      schemaVersion: 2 as const,
      sourceAssetId: "asset-123",
      clips: [{ id: "c-1", sourceAssetId: "asset-123", sourceStart: 0, sourceEnd: 200, origin: "source" as const, createdByCommandId: null }],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    });

    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: getInvalidSequence,
      getSourceDuration: () => 100 // clip goes to 200, so it fails validation
    });

    await coordinator.load();
    expect(coordinator.getPlaybackMode()).toBe("legacy");

    // Check that listeners are not duplicated and exist exactly once for legacy
    expect(media.getListenersCount("timeupdate")).toBe(1);
  });

  it("5. Reinitialisation does not duplicate listeners", async () => {
    sequencePlaybackEnabledVal = "true";
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence,
      getSourceDuration
    });

    await coordinator.load();
    await coordinator.load();
    await coordinator.load();

    expect(media.getListenersCount("timeupdate")).toBe(1);
    expect(media.getListenersCount("play")).toBe(1);
  });

  it("6. Closing the editor removes all listeners", async () => {
    sequencePlaybackEnabledVal = "true";
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence,
      getSourceDuration
    });

    await coordinator.load();
    expect(media.getListenersCount("timeupdate")).toBe(1);

    coordinator.dispose();
    expect(media.getListenersCount("timeupdate")).toBe(0);
    expect(media.getListenersCount("play")).toBe(0);
  });

  it("7. Reopening the editor attaches exactly one listener set", async () => {
    sequencePlaybackEnabledVal = "true";
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence,
      getSourceDuration
    });

    // Load first time
    await coordinator.load();
    expect(media.getListenersCount("timeupdate")).toBe(1);

    // Dispose (simulate close)
    coordinator.dispose();
    expect(media.getListenersCount("timeupdate")).toBe(0);

    // Create a new coordinator and load again (simulate reopen)
    const coordinator2 = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence,
      getSourceDuration
    });
    await coordinator2.load();
    expect(media.getListenersCount("timeupdate")).toBe(1);
  });

  it("8. A runtime failure does not leave both implementations active", async () => {
    sequencePlaybackEnabledVal = "true";

    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence,
      getSourceDuration
    });

    await coordinator.load();
    expect(coordinator.getPlaybackMode()).toBe("sequence");

    // Simulate runtime error in the controller
    media.clearLogs();

    // Trigger runtime fallback
    (coordinator as any).handleRuntimeError(new Error("Simulated runtime failure"));

    expect(coordinator.getPlaybackMode()).toBe("legacy");

    // Check that listeners are removed first, and only 1 active listener set remains
    expect(media.removeLog).toContain("timeupdate");
    expect(media.getListenersCount("timeupdate")).toBe(1);
  });
});
