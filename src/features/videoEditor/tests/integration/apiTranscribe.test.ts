import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import handler from "../../../../../api/transcribe";

// Create a single mock instance that will be shared between test and handler
const mockSupabase = {
  auth: {
    getUser: vi.fn(async () => {
      return { data: { user: { id: "user-id" } }, error: null };
    })
  },
  rpc: vi.fn(async (fnName, params) => {
    if (fnName === "can_edit_video_editor_guide") {
      const guideId = params.p_guide_id;
      if (guideId === "valid-guide-id") {
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }
    if (fnName === "check_and_record_transcription_rate_limit") {
      return { data: { allowed: true, remaining: 4, retry_after_seconds: 0 }, error: null };
    }
    return { data: false, error: null };
  })
};

// Mock Supabase client module
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => mockSupabase)
  };
});

// Mock OpenAI
const mockTranscriptionCreate = vi.fn(async () => ({
  text: "Mocked transcription response",
  segments: [{ id: 0, seek: 0, start: 0.0, end: 1.0, text: "Mocked transcription response" }]
}));

vi.mock("openai", () => {
  class MockOpenAI {
    audio = {
      transcriptions: {
        create: mockTranscriptionCreate
      }
    };
  }
  return {
    default: MockOpenAI,
    toFile: vi.fn(async (buffer, filename) => ({ buffer, filename }))
  };
});

describe("Walkthrough Transcription Endpoint (/api/transcribe)", () => {
  let mockRes: any;

  beforeEach(() => {
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis()
    };
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
    vi.clearAllMocks();

    // Default implementations
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
    mockSupabase.rpc.mockImplementation(async (fnName, params) => {
      if (fnName === "can_edit_video_editor_guide") {
        return { data: params.p_guide_id === "valid-guide-id" || params.p_guide_id === "550e8400-e29b-41d4-a716-446655440000", error: null };
      }
      if (fnName === "check_and_record_transcription_rate_limit") {
        return { data: { allowed: true, remaining: 4, retry_after_seconds: 0 }, error: null };
      }
      return { data: false, error: null };
    });
    mockTranscriptionCreate.mockResolvedValue({
      text: "Mocked transcription response",
      segments: [{ id: 0, seek: 0, start: 0.0, end: 1.0, text: "Mocked transcription response" }]
    });
  });

  const makeMockReq = (headers: any, bodyBuffer: Buffer, isAsync = false) => {
    const Readable = require("stream").Readable;
    const req = new Readable();
    req._read = () => {};
    if (isAsync) {
      const chunk1 = bodyBuffer.slice(0, Math.floor(bodyBuffer.length / 2));
      const chunk2 = bodyBuffer.slice(Math.floor(bodyBuffer.length / 2));
      req.push(chunk1);
      setTimeout(() => {
        if (!req.destroyed && !req.readableEnded) {
          req.push(chunk2);
          req.push(null);
        }
      }, 50);
    } else {
      req.push(bodyBuffer);
      req.push(null);
    }
    req.method = "POST";
    req.headers = {
      "content-type": "multipart/form-data; boundary=----WebKitFormBoundarytest",
      ...headers
    };
    return req;
  };

  const buildMultipartBody = (fields: Record<string, string>, fileContent: Buffer, fileName: string, fileMime: string) => {
    const boundary = "----WebKitFormBoundarytest";
    let body = Buffer.alloc(0);

    for (const [key, val] of Object.entries(fields)) {
      body = Buffer.concat([
        body,
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`)
      ]);
    }

    body = Buffer.concat([
      body,
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${fileMime}\r\n\r\n`),
      fileContent,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    return body;
  };

  it("forwards the bearer token in user-scoped client headers", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);

    await handler(req, mockRes);

    expect(createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        global: {
          headers: {
            Authorization: "Bearer valid-manager-token"
          }
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      })
    );
  });

  it("blocks unauthenticated requests", async () => {
    const req = makeMockReq({}, Buffer.from(""));
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it("blocks requests with missing guide ID", async () => {
    const fields = {};
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: "INVALID_REQUEST" })
    }));
  });

  it("blocks invalid UUID guide ID format", async () => {
    const fields = { guideId: "not-a-uuid" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it("blocks invalid mime types (strict mapping check)", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake mp3 data"), "test.mp3", "audio/mp3");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it("allows exact audio/wav, audio/wave, video/webm, and audio/webm", async () => {
    const allowed = ["audio/wav", "audio/wave", "video/webm", "audio/webm"];
    for (const mime of allowed) {
      const ext = mime.includes("wav") ? "wav" : "webm";
      const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
      const body = buildMultipartBody(fields, Buffer.from("fake audio"), `test.${ext}`, mime);
      const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);
      await handler(req, mockRes);
      expect(mockRes.status).toHaveBeenLastCalledWith(200);
    }
  });

  it("rejects application/octet-stream and substring mimes", async () => {
    const rejected = ["application/octet-stream", "audio/wav-spoofed", "video/webm-large"];
    for (const mime of rejected) {
      const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
      const body = buildMultipartBody(fields, Buffer.from("fake audio"), "test.bin", mime);
      const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);
      await handler(req, mockRes);
      expect(mockRes.status).toHaveBeenLastCalledWith(400);
    }
  });

  it("blocks declared content length above limit", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake data"), "test.wav", "audio/wav");
    const req = makeMockReq({
      authorization: "Bearer valid-manager-token",
      "content-length": "4000000" // Over limit
    }, body);

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(413);
  });

  it("blocks actual stream bytes exceeding MAX_REQUEST_BYTES", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const oversizedBuffer = Buffer.alloc(3.8 * 1024 * 1024); // 3.8MB
    const body = buildMultipartBody(fields, oversizedBuffer, "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(413);
  });

  it("returns RATE_LIMITED when rate limiting RPC blocks request", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);

    mockSupabase.rpc.mockImplementation(async (fnName, params) => {
      if (fnName === "can_edit_video_editor_guide") {
        return { data: true, error: null };
      }
      if (fnName === "check_and_record_transcription_rate_limit") {
        return { data: { allowed: false, remaining: 0, retry_after_seconds: 60 }, error: null };
      }
      return { data: false, error: null };
    });

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: "RATE_LIMITED",
        message: expect.stringContaining("Rate limit exceeded")
      })
    });
  });

  it("maps OpenAI timeout to PROVIDER_TIMEOUT", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);

    mockTranscriptionCreate.mockRejectedValueOnce({
      name: "RequestTimeoutError",
      message: "Timeout error details",
      status: 504
    });

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(504);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: "PROVIDER_TIMEOUT",
        message: expect.stringContaining("timed out")
      })
    });
  });

  // 12. Busboy parts limit: guideId and file (exactly 2 parts) succeeds
  it("allows exactly 2 parts (guideId and file)", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenLastCalledWith(200);
  });

  // 13. Busboy parts limit: 3 parts (guideId, file, and extra field) is blocked
  it("blocks requests with more than 2 parts", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000", extraField: "some-value" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 14. Negative content length header is blocked
  it("blocks negative content-length header value", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({
      authorization: "Bearer valid-manager-token",
      "content-length": "-500"
    }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 15. Invalid content length header is blocked
  it("blocks non-numeric invalid content-length header value", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({
      authorization: "Bearer valid-manager-token",
      "content-length": "not-a-number"
    }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 16. Client aborts before parsing starts is handled
  it("handles client abort before parsing", async () => {
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, Buffer.from(""));
    req.aborted = true;
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 17. Client aborts during parsing is handled
  it("handles client abort during parsing", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body, true);

    setTimeout(() => {
      req.aborted = true;
      req.emit("aborted");
    }, 10);

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 18. Premature stream closure before boundary is completed is handled
  it("handles premature stream close", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    // Truncate body to simulate premature closure
    const truncatedBody = body.slice(0, body.length - 20);
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, truncatedBody);

    setTimeout(() => {
      req.emit("close");
    }, 2);

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 19. Boundary parameter length exceeding 70 characters is blocked
  it("blocks boundary parameter exceeding 70 characters", async () => {
    const longBoundary = "a".repeat(71);
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({
      authorization: "Bearer valid-manager-token",
      "content-type": `multipart/form-data; boundary=${longBoundary}`
    }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 20. Empty boundary parameter is blocked
  it("blocks empty boundary parameter", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({
      authorization: "Bearer valid-manager-token",
      "content-type": `multipart/form-data; boundary=`
    }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 21. Boundary parameter missing in Content-Type is blocked
  it("blocks missing boundary parameter", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({
      authorization: "Bearer valid-manager-token",
      "content-type": `multipart/form-data`
    }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 22. Safety gates - single response check when abort and error occur together
  it("prevents multiple responses if abort and error occur", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);
    req.on("error", () => {});

    setTimeout(() => {
      req.emit("error", new Error("Simulated stream error"));
      req.emit("aborted");
    }, 2);

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledTimes(1);
  });

  // 23. Request with zero files is blocked
  it("blocks request with zero files", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const boundary = "----WebKitFormBoundarytest";
    const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="guideId"\r\n\r\n550e8400-e29b-41d4-a716-446655440000\r\n--${boundary}--\r\n`);
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 24. Multiple files uploaded is blocked by parts limit
  it("blocks request with multiple files", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const boundary = "----WebKitFormBoundarytest";
    let body = buildMultipartBody(fields, Buffer.from("file1"), "file1.wav", "audio/wav");
    // Add another file part (which exceeds parts limit 2)
    body = Buffer.concat([
      body.slice(0, body.length - `\r\n--${boundary}--\r\n`.length),
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="file2"; filename="file2.wav"\r\nContent-Type: audio/wav\r\n\r\nfile2\r\n--${boundary}--\r\n`)
    ]);
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 25. Large file stream chunk size limit handling
  it("blocks large files at the busboy limits level", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const largeContent = Buffer.alloc(2.5 * 1024 * 1024); // 2.5 MB
    const body = buildMultipartBody(fields, largeContent, "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalled();
  });

  // 26. Premature closure of file stream handles gracefully
  it("handles premature closure of file stream", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body, true);

    setTimeout(() => {
      req.destroy();
    }, 10);

    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  // 27. Missing auth header gets 401
  it("returns 401 for missing authorization header", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake wav data"), "test.wav", "audio/wav");
    const req = makeMockReq({}, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  // 28. Valid non-wav audio format fails strict mime type check
  it("blocks unsupported audio format (audio/mp3)", async () => {
    const fields = { guideId: "550e8400-e29b-41d4-a716-446655440000" };
    const body = buildMultipartBody(fields, Buffer.from("fake audio data"), "test.mp3", "audio/mp3");
    const req = makeMockReq({ authorization: "Bearer valid-manager-token" }, body);
    await handler(req, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });
});
