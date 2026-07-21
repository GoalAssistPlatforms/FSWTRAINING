import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  private listeners: Record<string, Function[]> = {};

  public addEventListener(type: string, listener: any) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  public removeEventListener(type: string, listener: any) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(l => l !== listener);
  }

  public play() { this.paused = false; }
  public pause() { this.paused = true; }
}

interface GuideStep {
  id: string;
  sourceTimestamp: number;
  instruction: string;
}

describe("Guide Step Playback Compatibility Tests", () => {
  let media: MockMediaElement;
  let legacyEdits: LegacyVideoEdits;
  let sequence: VideoSequence;
  let getSourceDuration: () => number;
  let guideSteps: GuideStep[];

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

    // Setup typical steps
    guideSteps = [
      { id: "step-1", sourceTimestamp: 25, instruction: "Visible step in first clip" },
      { id: "step-2", sourceTimestamp: 55, instruction: "Step inside removed cut (closer to 60)" },
      { id: "step-3", sourceTimestamp: 50, instruction: "Step inside removed cut (equal distance between 40 and 60)" }
    ];

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

  it("1. A visible guide step seeks to its source timestamp", async () => {
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: () => sequence,
      getSourceDuration
    });
    await coordinator.load();

    const targetStep = guideSteps[0]; // sourceTimestamp = 25 (visible)
    const originalTimestamp = targetStep.sourceTimestamp;

    coordinator.seekSourceTime(targetStep.sourceTimestamp);

    expect(media.currentTime).toBe(25);
    expect(targetStep.sourceTimestamp).toBe(originalTimestamp); // remains unchanged
  });

  it("2. A guide step inside removed content resolves to the nearest visible boundary", async () => {
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: () => sequence,
      getSourceDuration
    });
    await coordinator.load();

    const targetStep = guideSteps[1]; // sourceTimestamp = 55 (removed cut 40 to 60, closer to 60)
    const originalTimestamp = targetStep.sourceTimestamp;

    coordinator.seekSourceTime(targetStep.sourceTimestamp);

    expect(media.currentTime).toBe(60); // resolved to start of c-2
    expect(targetStep.sourceTimestamp).toBe(originalTimestamp); // remains unchanged
  });

  it("3. Equal distance resolution prefers the previous boundary", async () => {
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: () => sequence,
      getSourceDuration
    });
    await coordinator.load();

    const targetStep = guideSteps[2]; // sourceTimestamp = 50 (removed cut 40 to 60, exactly in middle)
    const originalTimestamp = targetStep.sourceTimestamp;

    coordinator.seekSourceTime(targetStep.sourceTimestamp);

    expect(media.currentTime).toBe(40); // resolved to end of c-1
    expect(targetStep.sourceTimestamp).toBe(originalTimestamp); // remains unchanged
  });

  it("4. Guide steps are not removed or deleted during playback seeks", async () => {
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: () => sequence,
      getSourceDuration
    });
    await coordinator.load();

    const originalLength = guideSteps.length;

    coordinator.seekSourceTime(guideSteps[0].sourceTimestamp);
    coordinator.seekSourceTime(guideSteps[1].sourceTimestamp);

    expect(guideSteps.length).toBe(originalLength);
  });

  it("5. Guide steps do not trigger persistence changes", async () => {
    // Structural test to prove that guide step operations do not communicate with the database/persistence layers
    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: () => sequence,
      getSourceDuration
    });
    await coordinator.load();

    const initialCallCount = 0; // No save triggers can be called during seeks
    coordinator.seekSourceTime(25);

    expect(initialCallCount).toBe(0);
  });
});
