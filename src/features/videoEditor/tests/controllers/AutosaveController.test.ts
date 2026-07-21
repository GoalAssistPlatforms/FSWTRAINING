import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { AutosaveController } from "../../controllers/AutosaveController";
import { VideoSequence } from "../../domain/editorTypes";
import {
  ProjectRevisionConflictError,
  ProjectAccessError,
  ProjectValidationError,
  ProjectCreationConflictError,
  ProjectIdempotencyMismatchError
} from "../../persistence/projectPersistenceErrors";

describe("AutosaveController Tests", () => {
  const initialSeq: VideoSequence = {
    schemaVersion: 2,
    sourceAssetId: "asset_uuid",
    clips: [{ id: "1", sourceAssetId: "asset_uuid", sourceStart: 0, sourceEnd: 60, origin: "source", createdByCommandId: null }],
    protectedRanges: [],
    appliedSuggestionBatchIds: []
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save before becoming dirty", async () => {
    const saveFn = vi.fn().mockResolvedValue({ projectId: "p_1", revision: 1 });
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    expect(controller.getStatus()).toBe("idle");
    vi.advanceTimersByTime(2000);
    expect(saveFn).not.toHaveBeenCalled();
  });

  it("saves one second after a persistent change", async () => {
    const saveFn = vi.fn().mockResolvedValue({ projectId: "p_1", revision: 1 });
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test", payload: {}, inversePayload: {} });
    expect(controller.getStatus()).toBe("dirty");

    vi.advanceTimersByTime(999);
    expect(saveFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2); // cross the 1000ms threshold
    expect(controller.getStatus()).toBe("saving");

    // Wait for the save promise to resolve
    await vi.runAllTimersAsync();
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toBe("idle");
    expect(controller.getRevision()).toBe(1);
  });

  it("resets the debounce timer after another change", async () => {
    const saveFn = vi.fn().mockResolvedValue({ projectId: "p_1", revision: 1 });
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test1", payload: {}, inversePayload: {} });
    vi.advanceTimersByTime(500);

    // Make another change
    controller.updateState(initialSeq, { type: "test2", payload: {}, inversePayload: {} });
    vi.advanceTimersByTime(600);
    expect(saveFn).not.toHaveBeenCalled(); // timer was reset, needs 1000ms from the second change

    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("immediate flush bypasses the debounce delay", async () => {
    const saveFn = vi.fn().mockResolvedValue({ projectId: "p_1", revision: 1 });
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test", payload: {}, inversePayload: {} });
    controller.flush();
    expect(controller.getStatus()).toBe("saving");
    await vi.runAllTimersAsync();
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("permits only one active save and queues subsequent changes", async () => {
    let resolveSave: any;
    const savePromise = new Promise<any>((resolve) => {
      resolveSave = resolve;
    });
    const saveFn = vi.fn()
      .mockReturnValueOnce(savePromise)
      .mockResolvedValueOnce({ projectId: "p_1", revision: 2 });

    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    // 1st change trigger
    controller.updateState(initialSeq, { type: "cmd_A", payload: {}, inversePayload: {} });
    controller.flush();
    expect(controller.getStatus()).toBe("saving");

    // Make 2nd change during saving
    controller.updateState(initialSeq, { type: "cmd_B", payload: {}, inversePayload: {} });

    // 2nd save is queued but not run until active resolves
    expect(saveFn).toHaveBeenCalledTimes(1);

    // Resolve 1st save
    resolveSave({ projectId: "p_1", revision: 1 });
    await vi.runAllTimersAsync();

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(controller.getStatus()).toBe("idle");
    expect(controller.getRevision()).toBe(2);
  });

  it("revision conflict stops automatic saving and preserves state", async () => {
    const saveFn = vi.fn().mockRejectedValue(new ProjectRevisionConflictError("Conflict", "p_1", 0, 1));
    const onConflict = vi.fn();
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn,
      onConflict
    });

    controller.updateState(initialSeq, { type: "cmd_conflict", payload: {}, inversePayload: {} });
    controller.flush();
    await vi.runAllTimersAsync();

    expect(controller.getStatus()).toBe("conflict");
    expect(onConflict).toHaveBeenCalledWith(1);
    expect(controller.getPendingCommands()).toHaveLength(1); // preserves state

    // Further updates do nothing while in conflict state
    controller.updateState(initialSeq);
    expect(controller.getStatus()).toBe("conflict");
  });

  it("temporary network failures trigger retries with progressive delay", async () => {
    const saveFn = vi.fn().mockRejectedValueOnce(new Error("Network Error")); // 1st try fails
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test", payload: {}, inversePayload: {} });
    controller.flush();

    // Wait for the first try to reject
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getStatus()).toBe("retrying");

    // 1st retry (after 1000ms)
    saveFn.mockRejectedValueOnce(new Error("Network Error"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.getStatus()).toBe("retrying");

    // 2nd retry (after 2000ms)
    saveFn.mockRejectedValueOnce(new Error("Network Error"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.getStatus()).toBe("retrying");

    // 3rd retry (after 4000ms)
    saveFn.mockResolvedValueOnce({ projectId: "p_1", revision: 1 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(controller.getStatus()).toBe("idle");
    expect(controller.getRevision()).toBe(1);
  });

  it("validation and permission failures are not retried", async () => {
    const saveFn = vi.fn().mockRejectedValue(new ProjectValidationError("Validation Failed"));
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test", payload: {}, inversePayload: {} });
    controller.flush();
    await vi.runAllTimersAsync();

    expect(controller.getStatus()).toBe("error"); // terminal states map to conflict or error
    expect(saveFn).toHaveBeenCalledTimes(1); // not retried
  });

  it("manual retry works after terminal temporary failure", async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error("Network Error"));
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test", payload: {}, inversePayload: {} });
    controller.flush();

    // Fail all three retries
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(5000);
      await vi.runAllTimersAsync();
    }

    expect(controller.getStatus()).toBe("error");

    // Manual retry works
    saveFn.mockResolvedValueOnce({ projectId: "p_1", revision: 1 });
    controller.manualRetry();
    expect(controller.getStatus()).toBe("saving");
    await vi.runAllTimersAsync();
    expect(controller.getStatus()).toBe("idle");
    expect(controller.getRevision()).toBe(1);
  });

  it("disposal cancels timers", async () => {
    const saveFn = vi.fn().mockResolvedValue({ projectId: "p_1", revision: 1 });
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test", payload: {}, inversePayload: {} });
    controller.dispose();

    vi.advanceTimersByTime(2000);
    expect(saveFn).not.toHaveBeenCalled();
  });

  it("only captured commands are cleared on success and new commands remain pending", async () => {
    let resolveSave: any;
    const saveFn = vi.fn().mockImplementation(() => new Promise(res => { resolveSave = res; }));
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    const cmd1 = { type: "cmd1", payload: {}, inversePayload: {} };
    controller.updateState(initialSeq, cmd1);
    controller.flush();

    const cmd2 = { type: "cmd2", payload: {}, inversePayload: {} };
    controller.updateState(initialSeq, cmd2);

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn.mock.calls[0][3]).toEqual([cmd1]);

    resolveSave({ projectId: "p_1", revision: 1 });
    await vi.runAllTimersAsync();

    expect(controller.getStatus()).toBe("saving");
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(saveFn.mock.calls[1][3]).toEqual([cmd2]);
  });

  it("permission errors are not retried", async () => {
    const saveFn = vi.fn().mockRejectedValue(new ProjectAccessError("Access Denied", null));
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test", payload: {}, inversePayload: {} });
    controller.flush();
    await vi.runAllTimersAsync();

    expect(controller.getStatus()).toBe("error");
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("empty command batches save sequence changes", async () => {
    const saveFn = vi.fn().mockResolvedValue({ projectId: "p_1", revision: 1 });
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    const updatedSeq = { ...initialSeq, clips: [] };
    controller.updateState(updatedSeq);
    controller.flush();
    await vi.runAllTimersAsync();

    expect(saveFn).toHaveBeenCalledWith("p_1", 0, updatedSeq, []);
  });

  it("does not save when sequence is identical", async () => {
    const saveFn = vi.fn().mockResolvedValue({ projectId: "p_1", revision: 1 });
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq);
    vi.advanceTimersByTime(2000);
    expect(saveFn).not.toHaveBeenCalled();
  });

  it("input sequences and commands are not mutated by the controller", async () => {
    const saveFn = vi.fn().mockResolvedValue({ projectId: "p_1", revision: 1 });
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    const cmd = { type: "cmd", payload: { val: 1 }, inversePayload: {} };
    const cmdCopy = JSON.parse(JSON.stringify(cmd));
    const seqCopy = JSON.parse(JSON.stringify(initialSeq));

    controller.updateState(initialSeq, cmd);
    controller.flush();
    await vi.runAllTimersAsync();

    expect(cmd).toEqual(cmdCopy);
    expect(initialSeq).toEqual(seqCopy);
  });

  it("conflict stops future automatic debounce saves", async () => {
    const saveFn = vi.fn().mockRejectedValue(new ProjectRevisionConflictError("Conflict", "p_1", 0, 1, null));
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test", payload: {}, inversePayload: {} });
    controller.flush();
    await vi.runAllTimersAsync();

    expect(controller.getStatus()).toBe("conflict");

    saveFn.mockClear();
    controller.updateState(initialSeq, { type: "another", payload: {}, inversePayload: {} });
    vi.advanceTimersByTime(2000);
    expect(saveFn).not.toHaveBeenCalled();
  });

  it("local revision is correct before a queued save begins", async () => {
    let resolveSave: any;
    const saveFn = vi.fn().mockImplementation(() => new Promise(res => { resolveSave = res; }));
    const controller = new AutosaveController({
      projectId: "p_1",
      initialRevision: 0,
      initialSequence: initialSeq,
      saveFn
    });

    controller.updateState(initialSeq, { type: "test", payload: {}, inversePayload: {} });
    controller.flush();

    resolveSave({ projectId: "p_1", revision: 1 });
    await vi.runAllTimersAsync();

    expect(controller.getRevision()).toBe(1);
  });

  describe("Atomic Initial Edit Integration", () => {
    it("missing project uses atomic creation and sets revision to one", async () => {
      const saveFn = vi.fn().mockResolvedValue({ projectId: "p_created", revision: 1 });
      const controller = new AutosaveController({
        projectId: "p_temp",
        initialRevision: 0,
        initialSequence: initialSeq,
        saveFn,
        persistenceState: "not_created"
      });

      controller.updateState(initialSeq, { type: "edit1", payload: {}, inversePayload: {} });
      controller.flush();

      expect(controller.getStatus()).toBe("saving");
      await vi.runAllTimersAsync();

      expect(saveFn).toHaveBeenCalledTimes(1);
      expect(saveFn).toHaveBeenCalledWith(
        "p_temp",
        0,
        initialSeq,
        [{ type: "edit1", payload: {}, inversePayload: {} }],
        "not_created",
        expect.any(String)
      );

      expect(controller.getPersistenceState()).toBe("created");
      expect(controller.getRevision()).toBe(1);
      expect(controller.getStatus()).toBe("idle");
    });

    it("existing revision zero project uses ordinary save", async () => {
      const saveFn = vi.fn().mockResolvedValue({ projectId: "p_1", revision: 1 });
      const controller = new AutosaveController({
        projectId: "p_1",
        initialRevision: 0,
        initialSequence: initialSeq,
        saveFn,
        persistenceState: "created"
      });

      controller.updateState(initialSeq, { type: "edit1", payload: {}, inversePayload: {} });
      controller.flush();

      await vi.runAllTimersAsync();
      expect(saveFn).toHaveBeenCalledWith("p_1", 0, initialSeq, [{ type: "edit1", payload: {}, inversePayload: {} }]);
    });

    it("temporary retry reuses the same request identifier and frozen payload", async () => {
      const saveFn = vi.fn()
        .mockRejectedValueOnce(new Error("Network Error"))
        .mockResolvedValueOnce({ projectId: "p_created", revision: 1 });

      const controller = new AutosaveController({
        projectId: "p_temp",
        initialRevision: 0,
        initialSequence: initialSeq,
        saveFn,
        persistenceState: "not_created"
      });

      controller.updateState(initialSeq, { type: "edit1", payload: {}, inversePayload: {} });
      controller.flush();

      await vi.advanceTimersByTimeAsync(0);
      expect(controller.getStatus()).toBe("retrying");

      vi.advanceTimersByTime(1000);
      await vi.advanceTimersByTimeAsync(0);

      expect(saveFn).toHaveBeenCalledTimes(2);
      const firstCallArgs = saveFn.mock.calls[0];
      const secondCallArgs = saveFn.mock.calls[1];

      expect(firstCallArgs[5]).toBe(secondCallArgs[5]);
      expect(firstCallArgs[3]).toEqual(secondCallArgs[3]);
    });

    it("new edits during initial saving remain pending and save via ordinary save after success", async () => {
      let resolveFirstSave: any;
      const saveFn = vi.fn()
        .mockImplementationOnce(() => new Promise(res => { resolveFirstSave = res; }))
        .mockResolvedValueOnce({ projectId: "p_created", revision: 2 });

      const controller = new AutosaveController({
        projectId: "p_temp",
        initialRevision: 0,
        initialSequence: initialSeq,
        saveFn,
        persistenceState: "not_created"
      });

      controller.updateState(initialSeq, { type: "edit1", payload: {}, inversePayload: {} });
      controller.flush();

      controller.updateState(initialSeq, { type: "edit2", payload: {}, inversePayload: {} });

      resolveFirstSave({ projectId: "p_created", revision: 1 });
      await vi.runAllTimersAsync();

      expect(saveFn).toHaveBeenCalledTimes(2);
      expect(saveFn.mock.calls[1]).toEqual([
        "p_created",
        1,
        initialSeq,
        [{ type: "edit2", payload: {}, inversePayload: {} }]
      ]);
    });

    it("failed creation preserves pending commands", async () => {
      const saveFn = vi.fn().mockRejectedValue(new Error("Fatal error"));
      const controller = new AutosaveController({
        projectId: "p_temp",
        initialRevision: 0,
        initialSequence: initialSeq,
        saveFn,
        persistenceState: "not_created"
      });

      controller.updateState(initialSeq, { type: "edit1", payload: {}, inversePayload: {} });
      controller.flush();

      await vi.runAllTimersAsync();
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();
      vi.advanceTimersByTime(4000);
      await vi.runAllTimersAsync();

      expect(controller.getStatus()).toBe("error");
      expect(controller.getPendingCommands()).toEqual([{ type: "edit1", payload: {}, inversePayload: {} }]);
    });

    it("creation conflict enters conflict state", async () => {
      const saveFn = vi.fn().mockRejectedValue(new ProjectCreationConflictError("Conflict"));
      const controller = new AutosaveController({
        projectId: "p_temp",
        initialRevision: 0,
        initialSequence: initialSeq,
        saveFn,
        persistenceState: "not_created"
      });

      controller.updateState(initialSeq, { type: "edit1", payload: {}, inversePayload: {} });
      controller.flush();

      await vi.runAllTimersAsync();
      expect(controller.getStatus()).toBe("conflict");
    });

    it("request mismatch enters terminal error state", async () => {
      const saveFn = vi.fn().mockRejectedValue(new ProjectIdempotencyMismatchError("Mismatch"));
      const controller = new AutosaveController({
        projectId: "p_temp",
        initialRevision: 0,
        initialSequence: initialSeq,
        saveFn,
        persistenceState: "not_created"
      });

      controller.updateState(initialSeq, { type: "edit1", payload: {}, inversePayload: {} });
      controller.flush();

      await vi.runAllTimersAsync();
      expect(controller.getStatus()).toBe("error");
    });

    it("preview activity does not invoke creation", async () => {
      const saveFn = vi.fn();
      const controller = new AutosaveController({
        projectId: "p_temp",
        initialRevision: 0,
        initialSequence: initialSeq,
        saveFn,
        persistenceState: "not_created"
      });

      controller.updateState({ ...initialSeq, clips: [] });
      controller.flush();

      expect(saveFn).not.toHaveBeenCalled();
      expect(controller.getStatus()).toBe("idle");
    });
  });
});
