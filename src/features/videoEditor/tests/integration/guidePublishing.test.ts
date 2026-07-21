// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCourse, updateCourse } from "../../../../api/courses.js";
import { supabase } from "../../../../api/supabase.js";
import { fswAlert } from "../../../../utils/dialog";
import { initSystemBuilder, renderSystemBuilder } from "../../../../views/SystemBuilder.js";

vi.mock("../../../../api/courses.js", () => ({
  createCourse: vi.fn(),
  updateCourse: vi.fn()
}));

vi.mock("../../../../api/guides.js", () => ({
  fetchSystemTags: vi.fn(async () => [])
}));

vi.mock("../../../../api/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } } })),
      getUser: vi.fn(async () => ({ data: { user: { id: "user-id" } } }))
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/thumbnail.jpg" } }))
      }))
    }
  }
}));

vi.mock("../../../../utils/dialog", () => ({
  fswAlert: vi.fn(async () => {}),
  fswConfirm: vi.fn(async () => true)
}));

vi.mock("../../../../utils/videoPlaybackController.js", () => ({
  getVisibleSegments: vi.fn(() => []),
  getVisibleDuration: vi.fn(() => 120),
  visibleToSourceTime: vi.fn((time: number) => ({ sourceTime: time })),
  sourceToVisibleTime: vi.fn((time: number) => ({ visibleTime: time, isRemoved: false })),
  getNextVisibleTime: vi.fn((time: number) => time),
  normalizeEdits: vi.fn((edits: unknown) => edits)
}));

vi.mock("../../config/playbackFeatureFlags.js", () => ({
  isSequencePlaybackEnabled: () => false,
  isSequenceTimelineEditingEnabled: () => false,
  isSequenceTranscriptViewerActive: () => false
}));

describe("Guide publishing integration", () => {
  const guide = {
    id: "guide-123",
    title: "Publishable guide",
    description: "A guide ready to publish",
    thumbnail_url: "https://example.com/existing.jpg",
    tags: ["training"],
    status: "draft",
    content_json: {
      is_system_simulation: true,
      type: "video_walkthrough",
      videoUrl: "https://example.com/video.mp4",
      renderStatus: "notRequired",
      videoEdits: { schemaVersion: 1, trimStart: 0, trimEnd: null, cuts: [] },
      steps: [
        {
          id: "step-1",
          createdOrder: 0,
          sourceTimestamp: 1,
          timestamp: 1,
          instruction: "Select the option",
          teachingText: "Choose the required option"
        }
      ]
    }
  };

  beforeEach(() => {
    document.body.innerHTML = renderSystemBuilder();
    vi.mocked(createCourse).mockReset();
    vi.mocked(updateCourse).mockReset();
    vi.mocked(fswAlert).mockClear();

    HTMLVideoElement.prototype.load = vi.fn();
    HTMLVideoElement.prototype.play = vi.fn(async () => {});
    HTMLVideoElement.prototype.pause = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn()
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AAAA");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(async () => ({ data: [], error: null })),
        single: vi.fn(async () => ({ data: null, error: null })),
        maybeSingle: vi.fn(async () => {
          if (table === "courses") {
            return { data: structuredClone(guide), error: null };
          }
          if (table === "video_editor_projects") {
            return { data: null, error: null };
          }
          if (table === "video_source_assets") {
            return { data: { id: "source-asset-123" }, error: null };
          }
          return { data: null, error: null };
        })
      };
      return query;
    }) as any);
  });

  afterEach(() => {
    (window as any).transcriptionUIController?.dispose();
    delete (window as any).transcriptionUIController;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  const initialiseBuilder = async () => {
    const onClose = vi.fn();
    initSystemBuilder(onClose, structuredClone(guide));

    const publishButton = document.getElementById("sys-save-btn") as HTMLButtonElement;
    await vi.waitFor(() => expect(publishButton.disabled).toBe(false));
    return publishButton;
  };

  it("publishes an existing draft by saving the live status", async () => {
    vi.mocked(updateCourse).mockImplementation(async (id, updates) => ({
      ...structuredClone(guide),
      ...updates,
      id
    }) as any);

    const publishButton = await initialiseBuilder();
    publishButton.click();

    await vi.waitFor(() => expect(publishButton.innerText).toBe("Success!"));

    const finalUpdate = vi.mocked(updateCourse).mock.calls.at(-1);
    expect(finalUpdate?.[0]).toBe(guide.id);
    expect(finalUpdate?.[1]).toMatchObject({ status: "live" });
    expect(fswAlert).not.toHaveBeenCalled();
  });

  it("retries with the authoritative publish when the preliminary step autosave fails", async () => {
    vi.mocked(updateCourse)
      .mockRejectedValueOnce(new Error("Step autosave unavailable"))
      .mockImplementation(async (id, updates) => ({
        ...structuredClone(guide),
        ...updates,
        id
      }) as any);

    const publishButton = await initialiseBuilder();
    publishButton.click();

    await vi.waitFor(() => expect(publishButton.innerText).toBe("Success!"));

    expect(updateCourse).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateCourse).mock.calls.at(-1)?.[1]).toMatchObject({ status: "live" });
    expect(fswAlert).not.toHaveBeenCalled();
  });

  it("restores the button and reports a final database failure", async () => {
    vi.mocked(updateCourse).mockRejectedValue(new Error("Database update failed"));

    const publishButton = await initialiseBuilder();
    publishButton.click();

    await vi.waitFor(() => expect(fswAlert).toHaveBeenCalledWith("Database update failed"));
    expect(publishButton.innerText).toBe("Publish Guide");
    expect(publishButton.disabled).toBe(false);
  });

  it("publishes when the active transcription controller is ready", async () => {
    vi.mocked(updateCourse).mockImplementation(async (id, updates) => ({
      ...structuredClone(guide),
      ...updates,
      id
    }) as any);

    const publishButton = await initialiseBuilder();
    const editorVideo = document.getElementById("sys-editor-video") as HTMLVideoElement;
    editorVideo.dispatchEvent(new Event("loadedmetadata"));

    await vi.waitFor(() => {
      const controller = (window as any).transcriptionUIController?.transcriptionJobController;
      expect(controller?.getState().status).toBe("ready");
    });

    publishButton.click();

    await vi.waitFor(() => expect(publishButton.innerText).toBe("Success!"));
    expect(vi.mocked(updateCourse).mock.calls.at(-1)?.[1]).toMatchObject({ status: "live" });
    expect(fswAlert).not.toHaveBeenCalled();
  });
});
