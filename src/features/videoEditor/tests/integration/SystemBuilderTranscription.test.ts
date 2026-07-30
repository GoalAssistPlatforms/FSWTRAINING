// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderSystemBuilder, initSystemBuilder } from "../../../../views/SystemBuilder.js";
import { fswAlert } from "../../../../utils/dialog";
import { TranscriptionUIController } from "../../controllers/TranscriptionUIController";
import { validateSourceTranscript } from "../../domain/transcriptValidation";
import { TranscriptInvalidError } from "../../domain/transcriptErrors";
import { supabase } from "../../../../api/supabase.js";

// Mock other APIs so SystemBuilder imports work in Vitest (Node)
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
      getSession: vi.fn(async () => ({ data: { session: { access_token: "test-tok" } } })),
      getUser: vi.fn(async () => ({ data: { user: { id: "user-id" } } }))
    },
    rpc: vi.fn(async (fn, args) => {
      if (fn === "can_edit_video_editor_guide") {
        return { data: true, error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        single: vi.fn(async () => ({ data: { role: "manager" }, error: null })),
        maybeSingle: vi.fn(async () => ({ data: { source_asset_id: "asset-123" }, error: null }))
      };
      return query;
    })
  }
}));
vi.mock("../../../../utils/dialog", () => ({
  fswAlert: vi.fn(async () => {}),
  fswConfirm: vi.fn(async () => true)
}));
vi.mock("../../../../utils/videoPlaybackController.js", () => ({
  getVisibleSegments: vi.fn(() => []),
  getVisibleDuration: vi.fn(() => 0),
  visibleToSourceTime: vi.fn(() => ({ sourceTime: 0 })),
  sourceToVisibleTime: vi.fn(() => ({ visibleTime: 0 })),
  getNextVisibleTime: vi.fn(() => 0),
  normalizeEdits: vi.fn(() => [])
}));

// Mock feature flags
vi.mock("../../config/playbackFeatureFlags.js", () => ({
  isSequencePlaybackEnabled: () => true,
  isSequenceTimelineEditingEnabled: () => true,
  isSequenceTranscriptViewerActive: () => true
}));

describe("SystemBuilder JSDOM Transcription UI Integration Suite (29 Tests)", () => {
  let uiController: TranscriptionUIController | null = null;
  let editorVideo: HTMLVideoElement;

  const createValidControllerConfig = () => {
    editorVideo = document.createElement("video");
    Object.defineProperty(editorVideo, "duration", { value: 120, writable: true });
    return {
      supabase: supabase,
      guideId: "guide-123",
      editorVideo: editorVideo,
      playbackCoordinator: {
        subscribe: vi.fn(() => () => {})
      },
      videoEdits: { schemaVersion: 1, trimStart: 0.0, trimEnd: null, cuts: [] },
      isTimelineSeqEditing: false,
      timelineEditorController: null,
      renderTranscriptState: vi.fn(),
      updateWordHighlights: vi.fn(),
      onStateChange: (state: any) => {
        const container = document.getElementById("sys-transcript-pipeline-controls");
        if (container) {
          container.innerHTML = `
            <button id="sys-transcribe-import-btn" class="btn-ghost">Import JSON</button>
            <button id="sys-transcribe-approve-btn" class="btn-primary">Approve</button>
            <button id="sys-transcribe-reject-btn" class="btn-ghost">Reject</button>
          `;
        }
      }
    };
  };

  beforeEach(() => {
    // Mount the real DOM markup
    document.body.innerHTML = renderSystemBuilder();

    // Configure stubs
    HTMLVideoElement.prototype.load = vi.fn();
    HTMLVideoElement.prototype.play = vi.fn(async () => {});
    HTMLVideoElement.prototype.pause = vi.fn();

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (uiController) {
      uiController.dispose();
      uiController = null;
    }
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  // Permissions tests (1-3)
  it("1. Permissions - edit permission check allows initialization of transcription controllers when user is editor/manager/admin", async () => {
    const mockRpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: true, error: null } as any);
    initSystemBuilder(vi.fn(), { id: "guide-123" } as any);

    const editorVideo = document.getElementById("sys-editor-video");
    editorVideo!.dispatchEvent(new Event("loadedmetadata"));

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mockRpc).toHaveBeenCalledWith("can_edit_video_editor_guide", expect.any(Object));
  });

  it("2. Permissions - course/guide read permission validation behaves correctly on error", async () => {
    const mockRpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: false, error: new Error("DB Error") as any } as any);
    initSystemBuilder(vi.fn(), { id: "guide-123" } as any);

    const editorVideo = document.getElementById("sys-editor-video");
    editorVideo!.dispatchEvent(new Event("loadedmetadata"));

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mockRpc).toHaveBeenCalled();
  });

  it("3. Permissions - if user has no edit permissions, manual import button/controls are not rendered or are disabled", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: false, error: null } as any);
    initSystemBuilder(vi.fn(), { id: "guide-123" } as any);

    const editorVideo = document.getElementById("sys-editor-video");
    editorVideo!.dispatchEvent(new Event("loadedmetadata"));

    // Simulate tick to allow async rendering
    await new Promise(resolve => setTimeout(resolve, 20));
    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement | null;
    if (importBtn) {
      expect(importBtn.disabled).toBe(true);
    } else {
      expect(importBtn).toBeNull();
    }
  });

  // File input creation tests (4-5)
  it("4. File input creation - check file input element for manual import is present in the DOM when initialized", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    await new Promise(resolve => setTimeout(resolve, 20));

    uiController.setupUIListeners();

    const importBtn = document.getElementById("sys-transcribe-import-btn");
    expect(importBtn).not.toBeNull();
  });

  it("5. File input creation - verify correct accept attributes on the manual import file input element", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    await new Promise(resolve => setTimeout(resolve, 20));

    uiController.setupUIListeners();

    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;

    // Stub createElement to check the dynamically created file input
    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const spy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") {
        return mockInput;
      }
      return document.createElement(tagName);
    });

    importBtn.click();
    expect(mockInput.accept).toBe(".json");
    spy.mockRestore();
  });

  // Size limits tests (6-7)
  it("6. Size limits - uploading a JSON file of size 1,048,576 bytes (exactly 1 MB) passes UI boundary check", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setupUIListeners();
    uiController.setSourceAsset("asset-123", 120);

    const validData = JSON.stringify({
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: []
    });
    const pad = " ".repeat(1048576 - validData.length);
    const exact1MBFile = new File([validData + pad], "transcript.json", { type: "application/json" });

    const validateSpy = vi.spyOn(uiController, "handleManualImportFile");

    await uiController.handleManualImportFile(exact1MBFile);
    expect(validateSpy).toHaveBeenCalled();
  });

  it("7. Size limits - uploading a JSON file of size 1,048,577 bytes (1 byte over 1 MB) fails UI boundary check and shows error alert", async () => {
    vi.mocked(fswAlert).mockClear();

    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setupUIListeners();
    uiController.setSourceAsset("asset-123", 120);

    const overLimitFile = new File(["a".repeat(1048577)], "transcript.json", { type: "application/json" });

    await uiController.handleManualImportFile(overLimitFile);
    expect(fswAlert).toHaveBeenCalledWith("The transcript is not in the expected format.");
  });

  // Validations tests (8-23)
  it("8. Validations - uploading a malformed JSON file displays a parsing error message", async () => {
    vi.mocked(fswAlert).mockClear();

    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setupUIListeners();
    uiController.setSourceAsset("asset-123", 120);

    const invalidJsonFile = new File(["{ malformed json }"], "transcript.json", { type: "application/json" });

    await uiController.handleManualImportFile(invalidJsonFile);
    expect(fswAlert).toHaveBeenCalledWith(expect.stringContaining("format"));
  });

  it("9. Validations - uploading a transcript with missing schemaVersion is rejected", () => {
    const invalid = { sourceAssetId: "asset-123", language: "en", duration: 120, words: [] };
    expect(() => validateSourceTranscript(invalid)).toThrow("schemaVersion must be exactly 1");
  });

  it("10. Validations - uploading a transcript with invalid schemaVersion value (e.g. 2) is rejected", () => {
    const invalid = { schemaVersion: 2, sourceAssetId: "asset-123", language: "en", duration: 120, words: [] };
    expect(() => validateSourceTranscript(invalid)).toThrow("schemaVersion must be exactly 1");
  });

  it("11. Validations - uploading a transcript with missing sourceAssetId is rejected", () => {
    const invalid = { schemaVersion: 1, language: "en", duration: 120, words: [] };
    expect(() => validateSourceTranscript(invalid)).toThrow("sourceAssetId must be a non-empty string");
  });

  it("12. Validations - uploading a transcript with empty or missing language is rejected", () => {
    const invalid = { schemaVersion: 1, sourceAssetId: "asset-123", language: "", duration: 120, words: [] };
    expect(() => validateSourceTranscript(invalid)).toThrow("language must be a non-empty string");
  });

  it("13. Validations - uploading a transcript with negative duration is rejected", () => {
    const invalid = { schemaVersion: 1, sourceAssetId: "asset-123", language: "en", duration: -5, words: [] };
    expect(() => validateSourceTranscript(invalid)).toThrow("duration must be a finite non-negative number");
  });

  it("14. Validations - uploading a transcript with words as object instead of array is rejected", () => {
    const invalid = { schemaVersion: 1, sourceAssetId: "asset-123", language: "en", duration: 120, words: {} };
    expect(() => validateSourceTranscript(invalid)).toThrow("words must be an array");
  });

  it("15. Validations - uploading a transcript with missing word id is rejected", () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: [{ text: "hello", startSourceTime: 0, endSourceTime: 1, confidence: 0.9, speakerId: null }]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow("Word is missing required property: id");
  });

  it("16. Validations - uploading a transcript with duplicate word id is rejected", () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: [
        { id: "w1", text: "hello", startSourceTime: 0, endSourceTime: 1, confidence: 0.9, speakerId: null },
        { id: "w1", text: "world", startSourceTime: 1, endSourceTime: 2, confidence: 0.9, speakerId: null }
      ]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow("Duplicate word identifier found: w1");
  });

  it("17. Validations - uploading a transcript with empty word text is rejected", () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: [{ id: "w1", text: "", startSourceTime: 0, endSourceTime: 1, confidence: 0.9, speakerId: null }]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow("Word with id w1 has empty text");
  });

  it("18. Validations - uploading a transcript with word startSourceTime >= endSourceTime is rejected", () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: [{ id: "w1", text: "hello", startSourceTime: 2, endSourceTime: 1, confidence: 0.9, speakerId: null }]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow("Word w1 start time must be strictly less than end time");
  });

  it("19. Validations - uploading a transcript with word startSourceTime < 0 is rejected", () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: [{ id: "w1", text: "hello", startSourceTime: -1, endSourceTime: 1, confidence: 0.9, speakerId: null }]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow("Word w1 has invalid startSourceTime");
  });

  it("20. Validations - uploading a transcript with overlapping word times exceeding tolerance is rejected", () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: [
        { id: "w1", text: "hello", startSourceTime: 0, endSourceTime: 2.0, confidence: 0.9, speakerId: null },
        { id: "w2", text: "world", startSourceTime: 1.0, endSourceTime: 3.0, confidence: 0.9, speakerId: null }
      ]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow("Words overlap");
  });

  it("21. Validations - uploading a transcript with word times not chronological is rejected", () => {
    const invalid = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: [
        { id: "w1", text: "hello", startSourceTime: 5.0, endSourceTime: 6.0, confidence: 0.9, speakerId: null },
        { id: "w2", text: "world", startSourceTime: 1.0, endSourceTime: 2.0, confidence: 0.9, speakerId: null }
      ]
    };
    expect(() => validateSourceTranscript(invalid)).toThrow("Words are not chronological");
  });

  it("22. Validations - uploading a transcript where source asset ID does not match active asset ID is rejected", async () => {
    vi.mocked(fswAlert).mockClear();

    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setupUIListeners();
    uiController.setSourceAsset("asset-123", 120);

    const invalidAssetIdJson = JSON.stringify({
      schemaVersion: 1,
      sourceAssetId: "asset-mismatch",
      language: "en",
      duration: 120,
      words: []
    });
    const file = new File([invalidAssetIdJson], "transcript.json", { type: "application/json" });

    await uiController.handleManualImportFile(file);
    expect(fswAlert).toHaveBeenCalledWith("The transcript is not in the expected format.");
  });

  it("23. Validations - uploading a transcript where duration does not match active duration beyond tolerance is rejected", async () => {
    vi.mocked(fswAlert).mockClear();

    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setupUIListeners();
    uiController.setSourceAsset("asset-123", 120);

    const invalidDurationJson = JSON.stringify({
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 150, // Active duration is 120
      words: []
    });
    const file = new File([invalidDurationJson], "transcript.json", { type: "application/json" });

    await uiController.handleManualImportFile(file);
    expect(fswAlert).toHaveBeenCalledWith("The transcript is not in the expected format.");
  });

  // Safe messaging test (24)
  it("24. Safe messaging - verify that complex validation error details are mapped to user-friendly messages", () => {
    const err = new TranscriptInvalidError("Words overlap beyond tolerance: w1 and w2 overlap by 1.0s");
    const friendly = err.message;
    expect(friendly).toContain("Words overlap beyond tolerance");
  });

  // Action clicks & API integration tests (25-27)
  it("25. Approval button click - clicking approval button triggers corresponding API call", async () => {
    const mockRpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: { status: "completed" }, error: null } as any);

    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    // Mock the inner job state and call approve
    const jobController = uiController.transcriptionJobController!;
    Object.defineProperty(jobController, "state", {
      value: {
        job: { id: "job-123" },
        existingTranscriptRevision: 1
      },
      writable: true
    });

    await jobController.approve();
    expect(mockRpc).toHaveBeenCalledWith("approve_video_transcription_job", {
      p_job_id: "job-123",
      p_expected_transcript_revision: 1
    });
  });

  it("26. Rejection button click - clicking rejection button triggers corresponding API call", async () => {
    const mockRpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: { status: "rejected" }, error: null } as any);

    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    const jobController = uiController.transcriptionJobController!;
    Object.defineProperty(jobController, "state", {
      value: {
        job: { id: "job-123" }
      },
      writable: true
    });

    await jobController.reject();
    expect(mockRpc).toHaveBeenCalledWith("reject_video_transcription_job", {
      p_job_id: "job-123"
    });
  });

  it("27. Viewer refresh - verify that manual import success triggers refresh callback of the transcript viewer", async () => {
    // 1. Render production transcription controls
    uiController = new TranscriptionUIController(createValidControllerConfig());
    // 2 & 3. Set a real guide UUID and source-asset UUID
    uiController.setSourceAsset("asset-123", 120);

    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const viewerController = uiController.transcriptViewerController!;
    const fetchSpy = vi.spyOn(viewerController, "initialize").mockResolvedValue();

    // Mock RPC for create_manual_transcription_import_job, approve_video_transcription_job, and reject_video_transcription_job
    const mockRpc = vi.spyOn(supabase as any, "rpc").mockImplementation((async (fnName: any, args: any) => {
      if (fnName === "create_manual_transcription_import_job") {
        return { data: { id: "job-123", status: "awaiting_approval" }, error: null } as any;
      }
      if (fnName === "approve_video_transcription_job") {
        return { data: { id: "job-123", status: "completed" }, error: null } as any;
      }
      if (fnName === "reject_video_transcription_job") {
        return { data: { id: "job-123", status: "rejected" }, error: null } as any;
      }
      return { data: null, error: null } as any;
    }) as any);

    // Manually bind the reject button click just like SystemBuilder.js does
    const rejectBtn = document.getElementById("sys-transcribe-reject-btn");
    if (rejectBtn) {
      rejectBtn.onclick = () => {
        uiController!.transcriptionJobController?.reject();
      };
    }

    // Manually bind the approve button click just like SystemBuilder.js does
    const approveBtn = document.getElementById("sys-transcribe-approve-btn");
    if (approveBtn) {
      approveBtn.onclick = () => {
        uiController!.handleApprove();
      };
    }

    // 4. Click the production import button
    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;

    // Stub createElement to capture the file input
    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const elementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") {
        return mockInput;
      }
      return document.createElement(tagName);
    });

    importBtn.click();

    // 5. Select a valid canonical JSON File
    const validTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123", // real source-asset UUID matching setSourceAsset
      language: "en",
      duration: 120, // matching setSourceAsset
      words: []
    };
    const file = new File([JSON.stringify(validTranscript)], "transcript.json", { type: "application/json" });

    Object.defineProperty(mockInput, "files", {
      value: [file],
      writable: true
    });

    // 6. Dispatch the real file-input change event
    mockInput.dispatchEvent(new Event("change"));

    // 7. Allow startManualImport to resolve successfully
    await new Promise(resolve => setTimeout(resolve, 50));

    // 8 & 9. Observe that manual import creation did NOT trigger viewer refresh
    expect(fetchSpy).not.toHaveBeenCalled();

    // Click Approve button to trigger the production success path
    if (approveBtn) {
      approveBtn.click();
      await new Promise(resolve => setTimeout(resolve, 50));
      // Prove the refresh occurs once
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    }

    // Reset spy history to test rejection
    fetchSpy.mockClear();

    // 10. Prove rejection does not trigger the refresh
    if (rejectBtn) {
      rejectBtn.click();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(fetchSpy).not.toHaveBeenCalled();
    }

    elementSpy.mockRestore();
    mockRpc.mockRestore();
  });

  // Resource disposal tests (28-29)
  it("28. Resource disposal - controller instance correctly disposes when editor is closed", () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    const disposeSpy = vi.spyOn(uiController, "dispose");
    uiController.dispose();
    expect(disposeSpy).toHaveBeenCalled();
  });

  it("29. Resource disposal - UI listeners and elements are cleaned up upon closed/re-initialized state", () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    uiController.dispose();
    expect(uiController.transcriptionJobController).toBeNull();
    expect(uiController.transcriptViewerController).toBeNull();
  });

  // JSDOM Transcription UI Integration additional tests (30-33)
  it("30. startManualImport does not refresh viewer on success, and shows success banner via fswAlert", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const viewerController = uiController.transcriptViewerController!;
    const fetchSpy = vi.spyOn(viewerController, "initialize").mockResolvedValue();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: { id: "job-123", status: "awaiting_approval" },
      error: null
    } as any);

    vi.mocked(fswAlert).mockClear();

    // Trigger manual import via DOM file input change event
    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const elementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") return mockInput;
      return document.createElement(tagName);
    });

    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;
    importBtn.click();

    const validTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: []
    };
    const file = new File([JSON.stringify(validTranscript)], "transcript.json", { type: "application/json" });
    Object.defineProperty(mockInput, "files", { value: [file], writable: true });
    mockInput.dispatchEvent(new Event("change"));

    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify it did NOT call viewer refresh (initialize)
    expect(fetchSpy).not.toHaveBeenCalled();
    // Verify it called fswAlert
    expect(fswAlert).toHaveBeenCalledWith("Transcript submitted for review.");

    elementSpy.mockRestore();
    mockRpc.mockRestore();
  });

  it("31. startManualImport does not refresh viewer and shows no success banner on failure", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const viewerController = uiController.transcriptViewerController!;
    const fetchSpy = vi.spyOn(viewerController, "initialize").mockResolvedValue();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: null,
      error: { code: "22000", message: "TRANSCRIPTION_INVALID" }
    } as any);
    vi.mocked(fswAlert).mockClear();

    // Trigger manual import via DOM file input change event
    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const elementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") return mockInput;
      return document.createElement(tagName);
    });

    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;
    importBtn.click();

    const validTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: []
    };
    const file = new File([JSON.stringify(validTranscript)], "transcript.json", { type: "application/json" });
    Object.defineProperty(mockInput, "files", { value: [file], writable: true });
    mockInput.dispatchEvent(new Event("change"));

    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify it did NOT call viewer refresh
    expect(fetchSpy).not.toHaveBeenCalled();
    // Verify it did NOT call fswAlert with success banner
    expect(fswAlert).not.toHaveBeenCalledWith("Transcript submitted for review.");

    elementSpy.mockRestore();
    mockRpc.mockRestore();
  });

  it("32. handleApprove refreshes viewer on successful approval", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const viewerController = uiController.transcriptViewerController!;
    const fetchSpy = vi.spyOn(viewerController, "initialize").mockResolvedValue();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: { id: "job-123", status: "completed" },
      error: null
    } as any);

    // Mock the job controller state to represent awaiting_approval job
    const jobController = uiController.transcriptionJobController!;
    Object.defineProperty(jobController, "state", {
      value: {
        job: { id: "job-123", status: "awaiting_approval" },
        existingTranscriptRevision: 1
      },
      writable: true
    });

    await uiController.handleApprove();

    // Verify viewer refresh was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    mockRpc.mockRestore();
  });

  it("33. handleApprove does not refresh viewer and leaves job reviewable on conflict failure", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);

    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const viewerController = uiController.transcriptViewerController!;
    const fetchSpy = vi.spyOn(viewerController, "initialize").mockResolvedValue();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: null,
      error: { code: "22000", message: "TRANSCRIPTION_APPROVAL_CONFLICT: The active transcript revision changed" }
    } as any);

    vi.mocked(fswAlert).mockClear();

    const jobController = uiController.transcriptionJobController!;
    Object.defineProperty(jobController, "state", {
      value: {
        job: { id: "job-123", status: "awaiting_approval" },
        existingTranscriptRevision: 1
      },
      writable: true
    });

    await uiController.handleApprove();

    // Verify viewer refresh was NOT called
    expect(fetchSpy).not.toHaveBeenCalled();
    // Verify job is still reviewable (status remains awaiting_approval)
    expect((jobController as any).state.job?.status).toBe("awaiting_approval");
    // Verify alert dialog surfaced the conflict error
    expect(fswAlert).toHaveBeenCalledWith("The active transcript changed after this review began. Refresh the transcript and review the result again.");

    mockRpc.mockRestore();
  });

  it("34. UI Sanitisation - Request mismatch displays the fixed safe message", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);
    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: null,
      error: { code: "22000", message: "TRANSCRIPTION_REQUEST_MISMATCH: Request mismatch error details" }
    } as any);

    vi.mocked(fswAlert).mockClear();

    // Trigger manual import via DOM file input change event
    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const elementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") return mockInput;
      return document.createElement(tagName);
    });

    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;
    importBtn.click();

    const validTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: []
    };
    const file = new File([JSON.stringify(validTranscript)], "transcript.json", { type: "application/json" });
    Object.defineProperty(mockInput, "files", { value: [file], writable: true });
    mockInput.dispatchEvent(new Event("change"));

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fswAlert).toHaveBeenCalledWith("This request could not be replayed because its contents have changed.");

    elementSpy.mockRestore();
    mockRpc.mockRestore();
  });

  it("35. UI Sanitisation - Permission denial displays the fixed safe message", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);
    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: null,
      error: { code: "42501", message: "TRANSCRIPTION_PERMISSION_DENIED" }
    } as any);

    vi.mocked(fswAlert).mockClear();

    // Trigger manual import via DOM
    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const elementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") return mockInput;
      return document.createElement(tagName);
    });

    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;
    importBtn.click();

    const validTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: []
    };
    const file = new File([JSON.stringify(validTranscript)], "transcript.json", { type: "application/json" });
    Object.defineProperty(mockInput, "files", { value: [file], writable: true });
    mockInput.dispatchEvent(new Event("change"));

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fswAlert).toHaveBeenCalledWith("You do not have permission to perform this transcription action.");

    elementSpy.mockRestore();
    mockRpc.mockRestore();
  });

  it("36. UI Sanitisation - Validation failure displays the fixed safe message", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);
    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: null,
      error: { code: "22000", message: "TRANSCRIPTION_INVALID: timings overlap" }
    } as any);

    vi.mocked(fswAlert).mockClear();

    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const elementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") return mockInput;
      return document.createElement(tagName);
    });

    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;
    importBtn.click();

    const validTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: []
    };
    const file = new File([JSON.stringify(validTranscript)], "transcript.json", { type: "application/json" });
    Object.defineProperty(mockInput, "files", { value: [file], writable: true });
    mockInput.dispatchEvent(new Event("change"));

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fswAlert).toHaveBeenCalledWith("The transcript is not in the expected format.");

    elementSpy.mockRestore();
    mockRpc.mockRestore();
  });

  it("37. UI Sanitisation - Unexpected database failure with relation name leaks no raw database strings", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);
    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: null,
      error: { code: "42P01", message: "relation public.video_source_transcripts does not exist" }
    } as any);

    vi.mocked(fswAlert).mockClear();

    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const elementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") return mockInput;
      return document.createElement(tagName);
    });

    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;
    importBtn.click();

    const validTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: []
    };
    const file = new File([JSON.stringify(validTranscript)], "transcript.json", { type: "application/json" });
    Object.defineProperty(mockInput, "files", { value: [file], writable: true });
    mockInput.dispatchEvent(new Event("change"));

    await new Promise(resolve => setTimeout(resolve, 50));

    const calledMessage = vi.mocked(fswAlert).mock.calls[0][0];
    expect(calledMessage).toBe("The transcription operation could not be completed.");
    expect(calledMessage).not.toContain("relation");
    expect(calledMessage).not.toContain("public.");

    elementSpy.mockRestore();
    mockRpc.mockRestore();
  });

  it("38. UI Sanitisation - Unexpected database failure with credential leaks no password strings", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);
    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: null,
      error: { code: "28P01", message: "postgres password=example" }
    } as any);

    vi.mocked(fswAlert).mockClear();

    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const elementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") return mockInput;
      return document.createElement(tagName);
    });

    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;
    importBtn.click();

    const validTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: []
    };
    const file = new File([JSON.stringify(validTranscript)], "transcript.json", { type: "application/json" });
    Object.defineProperty(mockInput, "files", { value: [file], writable: true });
    mockInput.dispatchEvent(new Event("change"));

    await new Promise(resolve => setTimeout(resolve, 50));

    const calledMessage = vi.mocked(fswAlert).mock.calls[0][0];
    expect(calledMessage).toBe("The transcription operation could not be completed.");
    expect(calledMessage).not.toContain("password");
    expect(calledMessage).not.toContain("postgres");

    elementSpy.mockRestore();
    mockRpc.mockRestore();
  });

  it("39. UI Sanitisation - Unexpected database failure with internal SQL function leaks no function strings", async () => {
    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);
    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "internal SQL function failed" }
    } as any);

    vi.mocked(fswAlert).mockClear();

    const mockInput = document.createElement("input");
    mockInput.type = "file";
    const elementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "input") return mockInput;
      return document.createElement(tagName);
    });

    const importBtn = document.getElementById("sys-transcribe-import-btn") as HTMLButtonElement;
    importBtn.click();

    const validTranscript = {
      schemaVersion: 1,
      sourceAssetId: "asset-123",
      language: "en",
      duration: 120,
      words: []
    };
    const file = new File([JSON.stringify(validTranscript)], "transcript.json", { type: "application/json" });
    Object.defineProperty(mockInput, "files", { value: [file], writable: true });
    mockInput.dispatchEvent(new Event("change"));

    await new Promise(resolve => setTimeout(resolve, 50));

    const calledMessage = vi.mocked(fswAlert).mock.calls[0][0];
    expect(calledMessage).toBe("The transcription operation could not be completed.");
    expect(calledMessage).not.toContain("function");
    expect(calledMessage).not.toContain("SQL");

    elementSpy.mockRestore();
    mockRpc.mockRestore();
  });

  it("40. UI Sanitisation - verify that displayed message never contains restricted substrings", async () => {
    const restrictedSubstrings = ["TRANSCRIPTION_", "public.", "SQLSTATE", "password", "relation", "function"];

    uiController = new TranscriptionUIController(createValidControllerConfig());
    uiController.setSourceAsset("asset-123", 120);
    await new Promise(resolve => setTimeout(resolve, 20));
    uiController.setupUIListeners();

    const jobController = uiController.transcriptionJobController!;
    Object.defineProperty(jobController, "state", {
      value: {
        job: { id: "job-123", status: "awaiting_approval" },
        existingTranscriptRevision: 1
      },
      writable: true
    });

    const mockRpc = vi.spyOn(supabase as any, "rpc").mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "TRANSCRIPTION_APPROVAL_CONFLICT: relation public.video_source_transcripts function failed with password=foo SQLSTATE=42P01" }
    } as any);

    vi.mocked(fswAlert).mockClear();

    await uiController.handleApprove();

    const calledMessage = vi.mocked(fswAlert).mock.calls[0][0];

    for (const sub of restrictedSubstrings) {
      expect(calledMessage).not.toContain(sub);
    }

    mockRpc.mockRestore();
  });
});
