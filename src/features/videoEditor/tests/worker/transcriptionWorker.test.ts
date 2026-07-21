import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTranscriptionWorkerTick, WorkerDependencies } from '../../worker/transcriptionWorker';
import { WorkerError, WorkerErrorCodes } from '../../worker/workerErrors';
import { VideoTranscriptionJob } from '../../worker/workerTypes';

describe('transcriptionWorker', () => {
  let fakeRepo: any;
  let fakeLoader: any;
  let fakeExtractor: any;
  let fakeProvider: any;
  let fakeNormaliser: any;
  let fakeClock: any;
  let fakeLogger: any;
  let deps: WorkerDependencies;
  let mockJob: VideoTranscriptionJob;

  beforeEach(() => {
    mockJob = {
      id: 'job-1',
      sourceAssetId: 'asset-1',
      provider: 'openai',
      status: 'extracting_audio',
      progressStage: 'extracting_audio',
      attemptCount: 1,
      leaseOwner: 'test-worker',
      leaseGeneration: 1
    };

    fakeRepo = {
      recoverStaleJobs: vi.fn().mockResolvedValue([]),
      claimJob: vi.fn().mockResolvedValue(mockJob),
      heartbeatJob: vi.fn().mockResolvedValue(true),
      recordStage: vi.fn().mockResolvedValue(true),
      recordResult: vi.fn().mockResolvedValue(true),
      recordFailure: vi.fn().mockResolvedValue(true),
      isJobCancelled: vi.fn().mockResolvedValue(false)
    };

    fakeLoader = {
      downloadAsset: vi.fn().mockResolvedValue({ localPath: '/tmp/asset-1.mp4' }),
      dispose: vi.fn().mockResolvedValue(undefined)
    };

    fakeExtractor = {
      extractAudio: vi.fn().mockResolvedValue({ audioPath: '/tmp/audio-1.mp3', duration: 10 }),
      dispose: vi.fn().mockResolvedValue(undefined)
    };

    fakeProvider = {
      transcribe: vi.fn().mockResolvedValue({
        result: { test: 'raw' },
        requestId: 'req-1',
        metadata: { info: 'test' }
      })
    };

    fakeNormaliser = {
      normalise: vi.fn().mockResolvedValue({ schemaVersion: 1, sourceAssetId: 'asset-1', language: 'en', duration: 10, words: [] })
    };

    fakeClock = {
      now: vi.fn().mockReturnValue(1000),
      setTimeout: vi.fn((cb) => setTimeout(cb, 1)),
      clearTimeout: vi.fn((id) => clearTimeout(id))
    };

    fakeLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    };

    deps = {
      repo: fakeRepo,
      loader: fakeLoader,
      extractor: fakeExtractor,
      provider: fakeProvider,
      normaliser: fakeNormaliser,
      clock: fakeClock,
      logger: fakeLogger,
      workerId: 'test-worker',
      leaseDurationSeconds: 60
    };
  });

  it('1. Idle tick', async () => {
    fakeRepo.claimJob.mockResolvedValue(null);
    const result = await runTranscriptionWorkerTick(deps);
    expect(result).toEqual({ type: 'NO_JOBS', recoveredCount: 0 });
  });

  it('2. Successful lifecycle', async () => {
    const result = await runTranscriptionWorkerTick(deps);
    expect(result).toEqual({ type: 'SUCCESS', jobId: 'job-1', recoveredCount: 0 });
    expect(fakeRepo.recordResult).toHaveBeenCalled();
  });

  it('3. Correct stage order', async () => {
    await runTranscriptionWorkerTick(deps);
    const calls = fakeRepo.recordStage.mock.calls;
    expect(calls[0][3]).toBe('submitting');
    expect(calls[1][3]).toBe('provider_processing');
    expect(calls[2][3]).toBe('normalising');
    expect(calls[3][3]).toBe('validating');
  });

  it('4. Audio extraction occurs before submitting stage', async () => {
    await runTranscriptionWorkerTick(deps);
    expect(fakeExtractor.extractAudio.mock.invocationCallOrder[0]).toBeLessThan(fakeRepo.recordStage.mock.invocationCallOrder[0]);
  });

  it('5. Heartbeat interval is at most one-third of lease', async () => {
    await runTranscriptionWorkerTick(deps);
    expect(fakeClock.setTimeout).toHaveBeenCalledWith(expect.any(Function), 20000);
  });

  it('6. Heartbeat success reschedules', async () => {
    fakeClock.setTimeout = vi.fn((cb) => { cb(); return 123; });
    fakeRepo.heartbeatJob.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await runTranscriptionWorkerTick(deps);
    expect(fakeClock.setTimeout).toHaveBeenCalledTimes(2);
  });

  it('7. Heartbeat calls never overlap', async () => {
    let active = 0;
    fakeRepo.heartbeatJob.mockImplementation(async () => {
      active++;
      expect(active).toBe(1);
      active--;
      return false; // abort after 1
    });
    fakeClock.setTimeout = vi.fn((cb) => cb());
    await runTranscriptionWorkerTick(deps);
  });

  it('8. Heartbeat lease loss aborts work', async () => {
    fakeClock.setTimeout = vi.fn((cb) => cb());
    fakeRepo.heartbeatJob.mockResolvedValue(false);
    fakeRepo.isJobCancelled.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return false;
    });
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('LEASE_LOST');
  });

  it('8.1. Heartbeat does not resurrect after successful tick', async () => {
    let capturedCallback: any;
    fakeClock.setTimeout = vi.fn((cb) => { capturedCallback = cb; return 123; });
    await runTranscriptionWorkerTick(deps);

    // now we have finished tick (heartbeatActive = false, cleared)
    expect(fakeClock.clearTimeout).toHaveBeenCalledWith(123);

    fakeClock.setTimeout.mockClear();
    fakeRepo.heartbeatJob.mockResolvedValue(true);
    await capturedCallback(); // resolve the in-flight heartbeat successfully

    expect(fakeClock.setTimeout).not.toHaveBeenCalled(); // no new timeout
  });

  it('9. Lease loss records no result', async () => {
    fakeClock.setTimeout = vi.fn((cb) => cb());
    fakeRepo.heartbeatJob.mockResolvedValue(false);
    await runTranscriptionWorkerTick(deps);
    expect(fakeRepo.recordResult).not.toHaveBeenCalled();
  });

  it('10. Lease loss records no failure', async () => {
    fakeClock.setTimeout = vi.fn((cb) => cb());
    fakeRepo.heartbeatJob.mockResolvedValue(false);
    await runTranscriptionWorkerTick(deps);
    expect(fakeRepo.recordFailure).not.toHaveBeenCalled();
  });

  it('11. Source-not-ready retry', async () => {
    fakeLoader.downloadAsset.mockRejectedValue(new WorkerError(WorkerErrorCodes.SOURCE_NOT_READY, 'Not ready'));
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('RETRYABLE_FAILURE');
    expect(fakeRepo.recordFailure).toHaveBeenCalledWith('job-1', 'test-worker', 1, WorkerErrorCodes.SOURCE_NOT_READY);
  });

  it('12. Source-not-found terminal failure', async () => {
    fakeLoader.downloadAsset.mockRejectedValue(new WorkerError(WorkerErrorCodes.SOURCE_NOT_FOUND, 'Not found'));
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('TERMINAL_FAILURE');
    expect(fakeRepo.recordFailure).toHaveBeenCalledWith('job-1', 'test-worker', 1, WorkerErrorCodes.SOURCE_NOT_FOUND);
  });

  it('13. Extraction failure', async () => {
    fakeExtractor.extractAudio.mockRejectedValue(new WorkerError(WorkerErrorCodes.AUDIO_EXTRACTION_FAILED, 'Err'));
    await runTranscriptionWorkerTick(deps);
    expect(fakeRepo.recordFailure).toHaveBeenCalledWith('job-1', 'test-worker', 1, WorkerErrorCodes.AUDIO_EXTRACTION_FAILED);
  });

  it('14. Provider rate-limit retry', async () => {
    fakeProvider.transcribe.mockRejectedValue(new WorkerError(WorkerErrorCodes.PROVIDER_RATE_LIMITED, 'Err'));
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('RETRYABLE_FAILURE');
  });

  it('15. Provider timeout retry', async () => {
    fakeProvider.transcribe.mockRejectedValue(new WorkerError(WorkerErrorCodes.PROVIDER_TIMEOUT, 'Err'));
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('RETRYABLE_FAILURE');
  });

  it('16. Provider authentication terminal failure', async () => {
    fakeProvider.transcribe.mockRejectedValue(new WorkerError(WorkerErrorCodes.PROVIDER_AUTHENTICATION_FAILED, 'Err'));
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('TERMINAL_FAILURE');
  });

  it('17. Malformed provider response', async () => {
    fakeProvider.transcribe.mockRejectedValue(new WorkerError(WorkerErrorCodes.PROVIDER_INVALID_RESPONSE, 'Err'));
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('TERMINAL_FAILURE');
  });

  it('18. Normalisation failure', async () => {
    fakeNormaliser.normalise.mockRejectedValue(new WorkerError(WorkerErrorCodes.TRANSCRIPT_NORMALISATION_FAILED, 'Err'));
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('TERMINAL_FAILURE');
  });

  it('19. Canonical validation failure', async () => {
    fakeNormaliser.normalise.mockResolvedValue({ schemaVersion: 2 }); // Invalid schema
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('TERMINAL_FAILURE');
    expect(fakeRepo.recordFailure).toHaveBeenCalledWith('job-1', 'test-worker', 1, WorkerErrorCodes.TRANSCRIPT_VALIDATION_FAILED);
  });

  it('20. Cancellation during source load', async () => {
    fakeRepo.isJobCancelled.mockResolvedValueOnce(true);
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('CANCELLED');
    expect(fakeLoader.downloadAsset).not.toHaveBeenCalled();
  });

  it('21. Cancellation during extraction aborts the adapter', async () => {
    fakeExtractor.extractAudio.mockImplementation(async (path: string, signal: AbortSignal) => {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) reject(new Error('AbortError'));
        signal.addEventListener('abort', () => reject(new Error('AbortError')));
      });
      return { audioPath: 'x', duration: 10 };
    });
    fakeClock.setTimeout = vi.fn((cb: any) => {
      // Simulate lease lost or cancellation during heartbeat to abort
      fakeRepo.heartbeatJob.mockResolvedValue(false);
      cb();
      return 123;
    });
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('LEASE_LOST');
  });

  it('22. Cancellation during provider call aborts the adapter', async () => {
    fakeProvider.transcribe.mockImplementation(async (path: string, key: string, signal: AbortSignal) => {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) reject(new Error('AbortError'));
        signal.addEventListener('abort', () => reject(new Error('AbortError')));
      });
      return { result: {}, requestId: 'x', metadata: null };
    });
    fakeClock.setTimeout = vi.fn((cb: any) => {
      // delay the failure slightly so extraction completes
      setTimeout(() => {
        fakeRepo.heartbeatJob.mockResolvedValue(false);
        cb();
      }, 5);
      return 123;
    });
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.type).toBe('LEASE_LOST');
  });

  it('23. Cancellation records no failure', async () => {
    fakeRepo.isJobCancelled.mockResolvedValueOnce(true);
    await runTranscriptionWorkerTick(deps);
    expect(fakeRepo.recordFailure).not.toHaveBeenCalled();
  });

  it('24. Source resource always disposed', async () => {
    fakeExtractor.extractAudio.mockRejectedValue(new Error('crash'));
    await runTranscriptionWorkerTick(deps);
    expect(fakeLoader.dispose).toHaveBeenCalled();
  });

  it('25. Audio resource always disposed', async () => {
    fakeProvider.transcribe.mockRejectedValue(new Error('crash'));
    await runTranscriptionWorkerTick(deps);
    expect(fakeExtractor.dispose).toHaveBeenCalled();
  });

  it('26. Provider idempotency key is exact', async () => {
    await runTranscriptionWorkerTick(deps);
    expect(fakeProvider.transcribe).toHaveBeenCalledWith(
      '/tmp/audio-1.mp3',
      'transcription-job:job-1:attempt:1',
      expect.any(AbortSignal)
    );
  });

  it('27. Stale recovery is followed by claim', async () => {
    fakeRepo.recoverStaleJobs.mockResolvedValue([{ jobId: 'stale-1', newStatus: 'queued' }]);
    const result = await runTranscriptionWorkerTick(deps);
    expect(result.recoveredCount).toBe(1);
    expect(fakeRepo.claimJob).toHaveBeenCalled();
  });

  it('28. Unknown errors map to INTERNAL_WORKER_ERROR', async () => {
    fakeLoader.downloadAsset.mockRejectedValue(new Error('Random crash'));
    await runTranscriptionWorkerTick(deps);
    expect(fakeRepo.recordFailure).toHaveBeenCalledWith('job-1', 'test-worker', 1, WorkerErrorCodes.INTERNAL_WORKER_ERROR);
  });
});
