import {
  WorkerRepository,
  SourceAssetLoader,
  AudioExtractor,
  TranscriptionProvider,
  TranscriptNormaliser,
  WorkerClock,
  WorkerLogger,
  TickResult
} from './workerTypes';
import { WorkerError, WorkerErrorCodes } from './workerErrors';
import { validateSourceTranscript } from '../domain/transcriptValidation';

export interface WorkerDependencies {
  repo: WorkerRepository;
  loader: SourceAssetLoader;
  extractor: AudioExtractor;
  provider: TranscriptionProvider;
  normaliser: TranscriptNormaliser;
  clock: WorkerClock;
  logger: WorkerLogger;
  workerId: string;
  leaseDurationSeconds: number;
}

export async function runTranscriptionWorkerTick(deps: WorkerDependencies): Promise<TickResult> {
  const { repo, loader, extractor, provider, normaliser, clock, logger, workerId, leaseDurationSeconds } = deps;
  let recoveredCount = 0;

  try {
    const recovered = await repo.recoverStaleJobs(10);
    recoveredCount = recovered.length;
    if (recoveredCount > 0) {
      logger.info(`Recovered ${recoveredCount} stale jobs.`);
    }
  } catch (err) {
    logger.error('Failed to recover stale jobs', { errorCode: WorkerErrorCodes.INTERNAL_WORKER_ERROR, stage: 'stale_recovery' });
  }

  let job;
  try {
    job = await repo.claimJob(workerId, leaseDurationSeconds);
  } catch (err) {
    logger.error('Failed to claim job', { errorCode: WorkerErrorCodes.INTERNAL_WORKER_ERROR, stage: 'claim' });
    return { type: 'NO_JOBS', recoveredCount };
  }

  if (!job) {
    return { type: 'NO_JOBS', recoveredCount };
  }

  if (!job.leaseGeneration) {
    logger.error('Job claimed but no lease generation returned', { jobId: job.id, errorCode: WorkerErrorCodes.INTERNAL_WORKER_ERROR, stage: 'claim' });
    return { type: 'TERMINAL_FAILURE', jobId: job.id, error: new Error('Invalid lease generation'), recoveredCount };
  }

  logger.info(`Claimed job ${job.id} (attempt ${job.attemptCount})`);
  const abortController = new AbortController();
  let heartbeatTimer: any;
  let isLeaseValid = true;
  let heartbeatActive = true;

  const startHeartbeat = () => {
    const intervalMs = (leaseDurationSeconds * 1000) / 3;
    heartbeatTimer = clock.setTimeout(async () => {
      try {
        const ok = await repo.heartbeatJob(job.id, workerId, job.leaseGeneration!, leaseDurationSeconds);
        if (!ok) {
          logger.warn(`Lease lost during heartbeat for job ${job.id}`);
          isLeaseValid = false;
          abortController.abort();
        } else if (heartbeatActive && !abortController.signal.aborted) {
          startHeartbeat(); // schedule next
        }
      } catch (err) {
        logger.error(`Heartbeat failed for job ${job.id}`, { errorCode: WorkerErrorCodes.INTERNAL_WORKER_ERROR, stage: 'heartbeat' });
        isLeaseValid = false;
        abortController.abort();
      }
    }, intervalMs);
  };

  startHeartbeat();

  const checkCancellation = async () => {
    if (!isLeaseValid || abortController.signal.aborted) {
      throw new WorkerError(WorkerErrorCodes.LEASE_LOST, 'Lease was lost');
    }
    const cancelled = await repo.isJobCancelled(job.id);
    if (cancelled) {
      abortController.abort();
      throw new WorkerError(WorkerErrorCodes.CANCELLED, 'Job was cancelled');
    }
  };

  const checkLeaseBeforeMutation = () => {
    if (!isLeaseValid || abortController.signal.aborted) {
      throw new WorkerError(WorkerErrorCodes.LEASE_LOST, 'Lease was lost');
    }
  };

  let localAssetPath: string | undefined;
  let localAudioPath: string | undefined;
  let providerRequestId: string | undefined;
  let providerMetadata: any = null;

  try {
    // 1. Downloading Source
    await checkCancellation();
    const { localPath } = await loader.downloadAsset(job.sourceAssetId, abortController.signal);
    localAssetPath = localPath;

    // 2. Extracting Audio
    await checkCancellation();
    checkLeaseBeforeMutation();
    const { audioPath, duration } = await extractor.extractAudio(localAssetPath, abortController.signal);
    localAudioPath = audioPath;

    // 3. Submitting to Provider
    await checkCancellation();
    checkLeaseBeforeMutation();
    const stage1Ok = await repo.recordStage(job.id, workerId, job.leaseGeneration, 'submitting', 'transcribing');
    if (!stage1Ok) throw new WorkerError(WorkerErrorCodes.LEASE_LOST, 'Failed to record stage extracting -> submitting');

    const idempotencyKey = `transcription-job:${job.id}:attempt:${job.attemptCount}`;
    const { result, requestId, metadata } = await provider.transcribe(localAudioPath, idempotencyKey, abortController.signal);
    providerRequestId = requestId;
    providerMetadata = metadata;

    await checkCancellation();
    checkLeaseBeforeMutation();
    const providerProcessingOk = await repo.recordStage(job.id, workerId, job.leaseGeneration, 'provider_processing', 'transcribing');
    if (!providerProcessingOk) throw new WorkerError(WorkerErrorCodes.LEASE_LOST, 'Failed to record provider-processing stage');

    // 4. Normalising
    await checkCancellation();
    checkLeaseBeforeMutation();
    const stage2Ok = await repo.recordStage(job.id, workerId, job.leaseGeneration, 'normalising', 'validating');
    if (!stage2Ok) throw new WorkerError(WorkerErrorCodes.LEASE_LOST, 'Failed to record stage provider_processing -> normalising');

    const transcriptJson = await normaliser.normalise(result, job.sourceAssetId, duration);

    // 5. Validating
    await checkCancellation();
    checkLeaseBeforeMutation();
    try {
      validateSourceTranscript(transcriptJson);
    } catch (err: any) {
      throw new WorkerError(WorkerErrorCodes.TRANSCRIPT_VALIDATION_FAILED, err.message || 'Validation failed');
    }

    const stage3Ok = await repo.recordStage(job.id, workerId, job.leaseGeneration, 'validating', 'validating');
    if (!stage3Ok) throw new WorkerError(WorkerErrorCodes.LEASE_LOST, 'Failed to record stage normalising -> validating');

    const resultOk = await repo.recordResult(
      job.id,
      workerId,
      job.leaseGeneration,
      transcriptJson,
      providerRequestId || 'unknown',
      providerMetadata
    );

    if (!resultOk) {
      throw new WorkerError(WorkerErrorCodes.LEASE_LOST, 'Failed to record final result (lease lost or canonical validation failed internally)');
    }

    logger.info(`Successfully completed transcription job ${job.id}`);
    return { type: 'SUCCESS', jobId: job.id, recoveredCount };

  } catch (err: any) {
    if (!isLeaseValid) {
      logger.warn(`Job ${job.id} lease was lost (detected via abort), abandoning tick.`);
      return { type: 'LEASE_LOST', jobId: job.id, recoveredCount };
    }

    if (err instanceof WorkerError && err.code === WorkerErrorCodes.CANCELLED) {
      logger.info(`Job ${job.id} was cancelled by user.`);
      return { type: 'CANCELLED', jobId: job.id, recoveredCount };
    }

    if (err instanceof WorkerError && err.code === WorkerErrorCodes.LEASE_LOST) {
      logger.warn(`Job ${job.id} lease was lost, abandoning tick.`);
      return { type: 'LEASE_LOST', jobId: job.id, recoveredCount };
    }

    const errorCode = err instanceof WorkerError ? err.code : WorkerErrorCodes.INTERNAL_WORKER_ERROR;

    logger.error(`Worker stage failed`, {
      jobId: job.id,
      attemptNumber: job.attemptCount,
      errorCode,
      stage: 'execution'
    });

    // Try to record failure to the DB
    try {
      if (isLeaseValid) {
        await repo.recordFailure(job.id, workerId, job.leaseGeneration, errorCode);
      }
    } catch (recordErr) {
      logger.error(`Worker stage failed`, {
        jobId: job.id,
        attemptNumber: job.attemptCount,
        errorCode: WorkerErrorCodes.INTERNAL_WORKER_ERROR,
        stage: 'record_failure'
      });
    }

    // Determine type for return matching DB policy (just as a courtesy since DB drives real retry)
    const retryableCodes = [
      WorkerErrorCodes.SOURCE_NOT_READY,
      WorkerErrorCodes.SOURCE_DOWNLOAD_FAILED,
      WorkerErrorCodes.AUDIO_EXTRACTION_FAILED,
      WorkerErrorCodes.PROVIDER_RATE_LIMITED,
      WorkerErrorCodes.PROVIDER_TIMEOUT,
      WorkerErrorCodes.PROVIDER_UNAVAILABLE
    ];

    if (retryableCodes.includes(errorCode as any)) {
      return { type: 'RETRYABLE_FAILURE', jobId: job.id, error: err, recoveredCount };
    } else {
      return { type: 'TERMINAL_FAILURE', jobId: job.id, error: err, recoveredCount };
    }
  } finally {
    heartbeatActive = false;
    clock.clearTimeout(heartbeatTimer);
    if (!abortController.signal.aborted) {
      abortController.abort();
    }

    if (localAssetPath) {
      try { await loader.dispose(localAssetPath); } catch (e) { logger.warn(`Failed to dispose asset`); }
    }
    if (localAudioPath) {
      try { await extractor.dispose(localAudioPath); } catch (e) { logger.warn(`Failed to dispose audio`); }
    }
  }
}
