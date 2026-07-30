import { describe, it, expect } from "vitest";
import {
  migrateLegacyEditsToSequence,
  validateSequenceState
} from "../../services/playbackSequenceService";
import { PlaybackCoordinator } from "../../controllers/PlaybackCoordinator";
import { LegacyVideoEdits, VideoSequence, VideoEditorProject } from "../../domain/editorTypes";
import { PlaybackState } from "../../controllers/playbackTypes";

class MockMediaElement {
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

describe("PlaybackMigration Integration Tests", () => {
  it("1. Migrates legacy edits in memory successfully", () => {
    const legacyEdits: LegacyVideoEdits = {
      trimStart: 10,
      trimEnd: 90,
      cuts: [
        { start: 20, end: 30 },
        { start: 50, end: 60 }
      ]
    };

    const sequence = migrateLegacyEditsToSequence("asset-1", 100, legacyEdits);
    expect(sequence.schemaVersion).toBe(2);
    expect(sequence.sourceAssetId).toBe("asset-1");
    expect(sequence.clips.length).toBe(3);

    // Clip 1: 10 to 20
    expect(sequence.clips[0].sourceStart).toBe(10);
    expect(sequence.clips[0].sourceEnd).toBe(20);

    // Clip 2: 30 to 50
    expect(sequence.clips[1].sourceStart).toBe(30);
    expect(sequence.clips[1].sourceEnd).toBe(50);

    // Clip 3: 60 to 90
    expect(sequence.clips[2].sourceStart).toBe(60);
    expect(sequence.clips[2].sourceEnd).toBe(90);
  });

  it("2. Falls back to legacy playback on preparation failure", async () => {
    const media = new MockMediaElement() as any;
    const legacyEdits: LegacyVideoEdits = { trimStart: 10, trimEnd: 90 };

    // Create an invalid sequence retrieval that will fail validation (clip boundaries out of source duration)
    const getSequence = () => ({
      schemaVersion: 2 as const,
      sourceAssetId: "asset-1",
      clips: [{ id: "c-1", sourceAssetId: "asset-1", sourceStart: 0, sourceEnd: 200, origin: "source" as const, createdByCommandId: null }],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    });

    // Enable sequence playback in local storage
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sequencePlaybackEnabled", "true");
    }

    const coordinator = new PlaybackCoordinator({
      media,
      getLegacyEdits: () => legacyEdits,
      getSequence,
      getSourceDuration: () => 100 // source duration is 100, but clip goes to 200 (fails validation!)
    });

    await coordinator.load();

    // Verify it fell back to legacy mode cleanly
    expect(coordinator.getPlaybackMode()).toBe("legacy");
  });

  it("3. Structural compile-time check: PlaybackState is not assignable to VideoEditorProject updates", () => {
    // Compile-time check asserting that transient PlaybackState cannot be passed to persistent project payload
    type AssertNotAssignable<T, U> = T extends U ? never : true;

    // PlaybackState should not be accepted by Partial<VideoEditorProject> due to completely distinct statuses
    // and missing database specific keys (organisationId, guideId, sequence, etc.)
    const check: AssertNotAssignable<PlaybackState, Partial<VideoEditorProject>> = true;
    expect(check).toBe(true);
  });
});
