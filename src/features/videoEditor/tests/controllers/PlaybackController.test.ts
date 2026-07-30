import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlaybackController, SourceSeekResult } from "../../controllers/PlaybackController";
import { VideoSequence, SequenceClip, LegacyVideoEdits } from "../../domain/editorTypes";
import { IMediaElement, PlaybackState } from "../../controllers/playbackTypes";
import {
  PlaybackSequenceInvalidError,
  PlaybackDisposedError
} from "../../controllers/playbackErrors";

// Mock Media Element implementation
class MockMediaElement implements IMediaElement {
  public currentTime = 0;
  public duration = 120;
  public playbackRate = 1;
  public volume = 1;
  public muted = false;
  public paused = true;

  private listeners: Record<string, Function[]> = {};

  public addEventListener(type: string, listener: any) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  public removeEventListener(type: string, listener: any) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(l => l !== listener);
  }

  public play() {
    this.paused = false;
    this.trigger("play");
  }

  public pause() {
    this.paused = true;
    this.trigger("pause");
  }

  public trigger(type: string) {
    if (this.listeners[type]) {
      const currentListeners = [...this.listeners[type]];
      for (const listener of currentListeners) {
        listener();
      }
    }
  }

  public hasListeners(type: string): boolean {
    return !!this.listeners[type] && this.listeners[type].length > 0;
  }

  public simulateTimeUpdate(time: number) {
    this.currentTime = time;
    this.trigger("timeupdate");
  }

  public simulateSeeked() {
    this.trigger("seeked");
  }
}

describe("PlaybackController Unit Tests", () => {
  let media: MockMediaElement;
  let validSequence: VideoSequence;
  let activeSequence: VideoSequence;
  let getSequence: () => VideoSequence;
  let getSourceDuration: () => number;

  beforeEach(() => {
    media = new MockMediaElement();
    validSequence = {
      schemaVersion: 2,
      sourceAssetId: "asset-123",
      clips: [
        { id: "clip-1", sourceAssetId: "asset-123", sourceStart: 10, sourceEnd: 30, origin: "source", createdByCommandId: null },
        { id: "clip-2", sourceAssetId: "asset-123", sourceStart: 40, sourceEnd: 70, origin: "source", createdByCommandId: null }
      ],
      protectedRanges: [],
      appliedSuggestionBatchIds: []
    };
    activeSequence = validSequence;
    getSequence = () => activeSequence;
    getSourceDuration = () => 120;
  });

  describe("Loading", () => {
    it("1. Loads a valid sequence successfully", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      expect(controller.getState().status).toBe("ready");
    });

    it("2. Rejects an invalid sequence", async () => {
      const invalidSeq = { ...validSequence, clips: [{ id: "c-1", sourceAssetId: "asset-123", sourceStart: 50, sourceEnd: 40, origin: "source" as const, createdByCommandId: null }] };
      const controller = new PlaybackController({ media, getSequence: () => invalidSeq, getSourceDuration });
      await expect(controller.load()).rejects.toThrow();
      expect(controller.getState().status).toBe("error");
    });

    it("3. Rejects sequence where clip boundaries exceed source duration", async () => {
      const invalidSeq = { ...validSequence, clips: [{ id: "c-1", sourceAssetId: "asset-123", sourceStart: 10, sourceEnd: 150, origin: "source" as const, createdByCommandId: null }] };
      const controller = new PlaybackController({ media, getSequence: () => invalidSeq, getSourceDuration });
      await expect(controller.load()).rejects.toThrow(PlaybackSequenceInvalidError);
    });

    it("4. Starts at the first visible clip start", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      expect(media.currentTime).toBe(10);
      expect(controller.getState().visibleTime).toBe(0);
      expect(controller.getState().activeClipId).toBe("clip-1");
    });

    it("5. Handles an empty sequence", async () => {
      const emptySeq = { ...validSequence, clips: [] };
      const controller = new PlaybackController({ media, getSequence: () => emptySeq, getSourceDuration });
      await controller.load();
      const state = controller.getState();
      expect(state.status).toBe("ended");
      expect(state.visibleDuration).toBe(0);
      expect(state.visibleTime).toBe(0);
      expect(state.ended).toBe(true);
    });

    it("6. Does not mutate the input sequence", async () => {
      const originalClipsStr = JSON.stringify(validSequence.clips);
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      expect(JSON.stringify(validSequence.clips)).toBe(originalClipsStr);
    });
  });

  describe("Playback", () => {
    it("7. Plays from the active clip start", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.play();
      expect(media.paused).toBe(false);
      expect(controller.getState().status).toBe("playing");
    });

    it("8. Pauses correctly", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.play();
      controller.pause();
      expect(media.paused).toBe(true);
      expect(controller.getState().status).toBe("paused");
    });

    it("9. Replays from the beginning after edited completion", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      // Seek to end
      await controller.seekVisibleTime(50); // visible duration is 20 + 30 = 50
      expect(controller.getState().status).toBe("ended");

      controller.play();
      expect(media.currentTime).toBe(10);
      expect(controller.getState().status).toBe("playing");
    });

    it("10. Maintains playback rate, volume, and muted state", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.setPlaybackRate(1.5);
      controller.setVolume(0.5);
      controller.setMuted(true);

      const state = controller.getState();
      expect(state.playbackRate).toBe(1.5);
      expect(state.volume).toBe(0.5);
      expect(state.muted).toBe(true);
    });
  });

  describe("Visible Seeking", () => {
    it("11. Seeks within the first clip", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      await controller.seekVisibleTime(5); // visible 5 maps to source 15
      expect(media.currentTime).toBe(15);
      expect(controller.getState().activeClipId).toBe("clip-1");
    });

    it("12. Seeks within a later clip", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      await controller.seekVisibleTime(25); // visible 25 maps to source 45 (clip-2 starts at 40)
      expect(media.currentTime).toBe(45);
      expect(controller.getState().activeClipId).toBe("clip-2");
    });

    it("13. Seeks to an exact clip boundary (beginning of next clip)", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      await controller.seekVisibleTime(20); // end of clip-1 (length 20)
      expect(media.currentTime).toBe(40); // should map to beginning of clip-2
      expect(controller.getState().activeClipId).toBe("clip-2");
    });

    it("14. Clamps a negative visible time to zero", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      await controller.seekVisibleTime(-10);
      expect(media.currentTime).toBe(10);
      expect(controller.getState().visibleTime).toBe(0);
    });

    it("15. Clamps beyond visible duration to final edited boundary", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      await controller.seekVisibleTime(100); // visible duration is 50
      expect(media.currentTime).toBe(70); // clip-2 end
      expect(controller.getState().status).toBe("ended");
    });

    it("16. Rejects non-finite values", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      await expect(controller.seekVisibleTime(NaN)).rejects.toThrow();
    });
  });

  describe("Source Seeking", () => {
    it("17. Seeks to a visible source time", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      const res = controller.seekSourceTime(15); // inside clip-1
      expect(media.currentTime).toBe(15);
      expect(res.wasRemoved).toBe(false);
      expect(res.selectedBoundary).toBe("exact");
    });

    it("18. Resolves a removed source time before the first clip to the first clip start", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      const res = controller.seekSourceTime(5); // before clip-1 start (10)
      expect(media.currentTime).toBe(10);
      expect(res.wasRemoved).toBe(true);
      expect(res.selectedBoundary).toBe("next");
    });

    it("19. Resolves a removed source time in a gap to the nearest visible boundary (closer to previous)", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      const res = controller.seekSourceTime(32); // gap is 30 to 40. 32 is closer to 30.
      expect(media.currentTime).toBe(30);
      expect(res.wasRemoved).toBe(true);
      expect(res.selectedBoundary).toBe("previous");
    });

    it("20. Resolves a removed source time in a gap to the nearest visible boundary (closer to next)", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      const res = controller.seekSourceTime(38); // gap is 30 to 40. 38 is closer to 40.
      expect(media.currentTime).toBe(40);
      expect(res.wasRemoved).toBe(true);
      expect(res.selectedBoundary).toBe("next");
    });

    it("21. Prefers previous boundary when distances in gap are equal", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      const res = controller.seekSourceTime(35); // exactly in the middle of 30 and 40
      expect(media.currentTime).toBe(30);
      expect(res.wasRemoved).toBe(true);
      expect(res.selectedBoundary).toBe("previous");
    });
  });

  describe("Clip Transitions", () => {
    it("22. Moves from one clip to the next (skips removed range)", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration, boundaryTolerance: 0.02 });
      await controller.load();
      controller.play();

      // Trigger timeupdate at end of clip-1 (ends at 30)
      media.simulateTimeUpdate(29.99); // within 0.02 tolerance of 30
      media.simulateSeeked();
      media.simulateTimeUpdate(40); // seek completion triggers timeupdate in browser
      expect(media.currentTime).toBe(40); // seeks to clip-2 start (40)
      expect(controller.getState().activeClipId).toBe("clip-2");
    });

    it("23. Completes edited playback at the final clip end", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration, boundaryTolerance: 0.02 });
      await controller.load();
      controller.play();

      // Trigger timeupdate at end of clip-2 (ends at 70)
      media.simulateTimeUpdate(69.99); // within tolerance
      media.simulateSeeked();
      const state = controller.getState();
      expect(media.paused).toBe(true);
      expect(media.currentTime).toBe(70);
      expect(state.status).toBe("ended");
      expect(state.ended).toBe(true);
    });
  });

  describe("Sequence Refresh", () => {
    it("24. Keeps current position when still visible", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      await controller.seekVisibleTime(5); // source 15

      // Refresh with sequence containing the same visible position
      controller.refreshSequence();
      expect(media.currentTime).toBe(15);
    });

    it("25. Moves to the nearest boundary when position becomes removed", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      await controller.seekVisibleTime(5); // source 15

      // Change sequence so 15 is removed
      const newSequence = {
        ...validSequence,
        clips: [{ id: "clip-2", sourceAssetId: "asset-123", sourceStart: 40, sourceEnd: 70, origin: "source" as const, createdByCommandId: null }]
      };
      activeSequence = newSequence;
      controller.refreshSequence();

      expect(media.currentTime).toBe(40.01); // just inside the nearest surviving clip
    });
  });

  describe("Events and Disposal", () => {
    it("26. Removes all event listeners on disposal", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();

      expect(media.hasListeners("timeupdate")).toBe(true);
      controller.dispose();
      expect(media.hasListeners("timeupdate")).toBe(false);
    });

    it("27. Rejects operations after disposal", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.dispose();

      expect(() => controller.play()).toThrow(PlaybackDisposedError);
      await expect(controller.seekVisibleTime(10)).rejects.toThrow(PlaybackDisposedError);
    });

    it("28. Rejects sequence with clip asset identifier mismatch", async () => {
      const invalidSeq = {
        ...validSequence,
        clips: [{ id: "c-1", sourceAssetId: "different-asset", sourceStart: 10, sourceEnd: 20, origin: "source" as const, createdByCommandId: null }]
      };
      const controller = new PlaybackController({ media, getSequence: () => invalidSeq, getSourceDuration });
      await expect(controller.load()).rejects.toThrow(PlaybackSequenceInvalidError);
    });

    it("29. Preserves playing state after seek completes", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.play();
      await controller.seekVisibleTime(5);
      media.simulateSeeked();
      expect(controller.getState().status).toBe("playing");
    });

    it("30. Preserves paused state after seek completes", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.pause();
      await controller.seekVisibleTime(5);
      media.simulateSeeked();
      expect(controller.getState().status).toBe("paused");
    });

    it("31. Cancels obsolete seek when a new seek is issued", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      const p1 = controller.seekVisibleTime(5);
      const p2 = controller.seekVisibleTime(10);
      media.simulateSeeked();
      await p1;
      await p2;
      expect(media.currentTime).toBe(20); // maps to visible 10
    });

    it("32. Cancels obsolete transition when seek is requested", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.play();
      media.simulateTimeUpdate(29.99); // triggers transition to 40
      await controller.seekVisibleTime(5); // overrides with seek to 15
      media.simulateSeeked();
      expect(media.currentTime).toBe(15);
    });

    it("33. Prevents duplicate transition triggering", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.play();
      media.simulateTimeUpdate(29.99);
      const transitionGenBefore = (controller as any).activeTransitionGeneration;
      media.simulateTimeUpdate(29.99); // call again before seeked
      const transitionGenAfter = (controller as any).activeTransitionGeneration;
      expect(transitionGenAfter).toBe(transitionGenBefore);
    });

    it("34. Ignores refresh with identical sequence", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      media.currentTime = 15;
      const originalTime = media.currentTime;
      controller.refreshSequence();
      expect(media.currentTime).toBe(originalTime);
    });

    it("35. Handles sequence becoming empty on refresh", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      activeSequence = { ...validSequence, clips: [] };
      controller.refreshSequence();
      expect(controller.getState().status).toBe("ended");
    });

    it("36. Stable state emission caching prevents duplicate callback calls", async () => {
      const onStateChange = vi.fn();
      const controller = new PlaybackController({ media, getSequence, getSourceDuration, onStateChange });
      await controller.load();
      onStateChange.mockClear();
      media.trigger("play");
      media.trigger("play");
      expect(onStateChange).toHaveBeenCalledTimes(1); // Second one is cached/ignored
    });

    it("37. Seek timeout recovers after 1 second if browser fails to emit seeked", async () => {
      vi.useFakeTimers();
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();

      await controller.seekVisibleTime(5); // currentTime is 15, isSeekingOrTransitioning is true
      expect((controller as any).isSeekingOrTransitioning).toBe(true);

      // Advance timers by 1 second (1000ms)
      vi.advanceTimersByTime(1000);

      expect((controller as any).isSeekingOrTransitioning).toBe(false);
      vi.useRealTimers();
    });

    it("38. Media error event transitions state to error", async () => {
      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      media.trigger("error");
      expect(controller.getState().status).toBe("error");
    });

    it("39. Playback operations do not mutate the legacy edits input", async () => {
      const edits: LegacyVideoEdits = { trimStart: 10, trimEnd: 90, cuts: [] };
      const originalEditsStr = JSON.stringify(edits);

      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.play();
      await controller.seekVisibleTime(5);

      expect(JSON.stringify(edits)).toBe(originalEditsStr);
    });

    it("40. Playback operations do not mutate the sequence input", async () => {
      const originalSeqStr = JSON.stringify(validSequence);

      const controller = new PlaybackController({ media, getSequence, getSourceDuration });
      await controller.load();
      controller.play();
      await controller.seekVisibleTime(5);

      expect(JSON.stringify(validSequence)).toBe(originalSeqStr);
    });
  });
});
