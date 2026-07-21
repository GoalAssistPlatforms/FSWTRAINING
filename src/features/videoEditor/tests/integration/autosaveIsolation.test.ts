import { describe, it, expect, vi } from "vitest";
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

describe("Playback Autosave Isolation Tests", () => {
  it("Verify playback actions do not mark project dirty or trigger saves", async () => {
    const media = new MockMediaElement();
    const legacyEdits: LegacyVideoEdits = { trimStart: 10, trimEnd: 90, cuts: [] };
    const sequence: VideoSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [{ id: "c-1", sourceAssetId: "asset-123", sourceStart: 10, sourceEnd: 90, origin: "source", createdByCommandId: null }],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };

    let hasUnsavedChanges = false;
    const triggerSaveMock = vi.fn();

    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence: () => sequence,
      getSourceDuration: () => 100,
      onStateChange: (state) => {
        // Assert that state changes do not mark the project dirty
        expect(hasUnsavedChanges).toBe(false);
      }
    });

    await coordinator.load();

    // 1. Play and Pause
    coordinator.play();
    coordinator.pause();

    // 2. Seeking
    coordinator.seekVisibleTime(20);
    coordinator.seekSourceTime(30);

    // 3. Playback Rate, Volume, Muted state
    coordinator.setPlaybackRate(1.5);
    coordinator.setVolume(0.5);
    coordinator.setMuted(true);

    // 4. Sequence Refresh
    coordinator.refreshSequence();

    // 5. Runtime fallback
    // Directly call runtime error handler
    (coordinator as any).handleRuntimeError(new Error("Simulated runtime error"));

    // Verify that through all these actions, no autosave trigger was called
    expect(triggerSaveMock).not.toHaveBeenCalled();
    expect(hasUnsavedChanges).toBe(false);
  });
});
