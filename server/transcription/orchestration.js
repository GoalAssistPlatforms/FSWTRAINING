// The order of work for one transcription job, written against an injected set of steps so it can
// run both inside the Vercel Workflow (steps are 'use step' functions) and in tests (steps are the
// pipeline functions directly). Must stay deterministic and free of Node APIs.
import { createTranscriptionChunkPlan } from '../../src/features/videoEditor/services/chunkedTranscription.ts';
import { CHUNK_OVERLAP_SECONDS, CHUNK_SECONDS } from './chunking.js';

const MAX_ATTEMPT_CYCLES = 8;
const MAX_QUEUE_WAITS = 200;

// The database's own retry policy is honoured: when a failure is recorded as retryable the run
// sleeps until the next attempt is due and claims the job again.
export async function runTranscription(jobId, steps) {
    try {
        for (let cycle = 0; cycle < MAX_ATTEMPT_CYCLES; cycle += 1) {
            let claim = await steps.claim(jobId);
            for (let waits = 0; !claim.claimed && claim.status === 'queued' && waits < MAX_QUEUE_WAITS; waits += 1) {
                await steps.sleep(`${claim.waitSeconds}s`);
                claim = await steps.claim(jobId);
            }
            if (!claim.claimed) return { status: claim.status };

            const lease = { owner: claim.leaseOwner, generation: claim.leaseGeneration };
            const retryOrFinish = async errorCode => {
                const after = await steps.fail(jobId, lease, errorCode);
                if (after.status === 'queued') {
                    await steps.sleep(`${after.waitSeconds}s`);
                    return null;
                }
                return { status: after.status, errorCode };
            };

            const extracted = await steps.extract(jobId, lease, claim.sourceAssetId);
            if (extracted.leaseLost) {
                await steps.recover(jobId);
                continue;
            }
            if (!extracted.ok) {
                const finished = await retryOrFinish(extracted.errorCode);
                if (finished) return finished;
                continue;
            }
            if (await steps.cancelled(jobId)) return { status: 'cancelled' };

            const plan = createTranscriptionChunkPlan(extracted.duration, CHUNK_SECONDS, CHUNK_OVERLAP_SECONDS);
            const chunks = await Promise.all(plan.map(chunk => steps.transcribe(
                jobId,
                lease,
                extracted.audioStoragePath,
                chunk,
                claim.attemptCount
            )));
            if (chunks.some(chunk => chunk.leaseLost)) {
                await steps.recover(jobId);
                continue;
            }
            const failedChunk = chunks.find(chunk => !chunk.ok);
            if (failedChunk) {
                const finished = await retryOrFinish(failedChunk.errorCode);
                if (finished) return finished;
                continue;
            }
            if (await steps.cancelled(jobId)) return { status: 'cancelled' };

            const finalised = await steps.finalise(jobId, lease, claim.sourceAssetId, extracted.duration, chunks);
            if (finalised.leaseLost) {
                await steps.recover(jobId);
                continue;
            }
            if (!finalised.ok) {
                const finished = await retryOrFinish(finalised.errorCode);
                if (finished) return finished;
                continue;
            }

            return { status: 'awaiting_approval', wordCount: finalised.wordCount };
        }
        return { status: 'abandoned' };
    } catch (error) {
        // Something failed even after the platform retried the step. Mark the job so it does not
        // sit in a processing state forever.
        const after = await steps.fail(jobId, null, 'INTERNAL_WORKER_ERROR');
        return { status: after.status, error: String(error?.message || error) };
    }
}
