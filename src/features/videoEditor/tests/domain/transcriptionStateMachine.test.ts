import { describe, it, expect } from "vitest";
import { isValidTransition, validateTransition } from "../../domain/transcriptionStateMachine";
import { TranscriptionJobStatus } from "../../domain/transcriptionTypes";

describe("Transcription State Machine Transitions", () => {
  const allStates: TranscriptionJobStatus[] = [
    "queued",
    "extracting_audio",
    "transcribing",
    "validating",
    "awaiting_approval",
    "completed",
    "rejected",
    "failed",
    "cancelled"
  ];

  it("permits valid transitions", () => {
    expect(isValidTransition("queued", "extracting_audio")).toBe(true);
    expect(isValidTransition("queued", "cancelled")).toBe(true);
    expect(isValidTransition("queued", "failed")).toBe(true);

    expect(isValidTransition("extracting_audio", "transcribing")).toBe(true);
    expect(isValidTransition("extracting_audio", "cancelled")).toBe(true);
    expect(isValidTransition("extracting_audio", "failed")).toBe(true);

    expect(isValidTransition("transcribing", "validating")).toBe(true);
    expect(isValidTransition("transcribing", "cancelled")).toBe(true);
    expect(isValidTransition("transcribing", "failed")).toBe(true);

    expect(isValidTransition("validating", "awaiting_approval")).toBe(true);
    expect(isValidTransition("validating", "failed")).toBe(true);

    expect(isValidTransition("awaiting_approval", "completed")).toBe(true);
    expect(isValidTransition("awaiting_approval", "rejected")).toBe(true);

    expect(isValidTransition("failed", "queued")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    // completed, rejected, cancelled are terminal
    expect(isValidTransition("completed", "queued")).toBe(false);
    expect(isValidTransition("rejected", "queued")).toBe(false);
    expect(isValidTransition("cancelled", "queued")).toBe(false);

    // awaiting_approval cannot return to processing
    expect(isValidTransition("awaiting_approval", "transcribing")).toBe(false);
    expect(isValidTransition("awaiting_approval", "queued")).toBe(false);

    // failed cannot go straight to transcribing
    expect(isValidTransition("failed", "transcribing")).toBe(false);
  });

  it("validateTransition helper throws on invalid", () => {
    expect(() => validateTransition("queued", "extracting_audio")).not.toThrow();
    expect(() => validateTransition("queued", "queued")).not.toThrow(); // idempotent same state allowed
    expect(() => validateTransition("completed", "queued")).toThrow();
  });
});
