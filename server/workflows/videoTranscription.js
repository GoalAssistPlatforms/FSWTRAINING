import { sleep } from 'workflow';
import { runTranscription } from '../transcription/orchestration.js';

// The pipeline module uses FFmpeg, the filesystem and the network, none of which may appear in
// the workflow function's static import graph, so each step loads it on demand.
const pipeline = () => import('../transcription/pipeline.js');

async function claimStep(jobId) {
    'use step';
    const { claimJob } = await pipeline();
    return claimJob(jobId);
}

async function extractAudioStep(jobId, lease, sourceAssetId) {
    'use step';
    const { extractAudio } = await pipeline();
    return extractAudio(jobId, lease, sourceAssetId);
}

async function transcribeChunkStep(jobId, lease, audioStoragePath, chunk, attemptCount) {
    'use step';
    const { transcribeChunk } = await pipeline();
    return transcribeChunk(jobId, lease, audioStoragePath, chunk, attemptCount);
}

async function finaliseStep(jobId, lease, sourceAssetId, duration, chunks) {
    'use step';
    const { finaliseTranscript } = await pipeline();
    return finaliseTranscript(jobId, lease, sourceAssetId, duration, chunks);
}

async function failStep(jobId, lease, errorCode) {
    'use step';
    const { recordFailure } = await pipeline();
    return recordFailure(jobId, lease, errorCode);
}

async function recoverStep(jobId) {
    'use step';
    const { recoverLease } = await pipeline();
    return recoverLease(jobId);
}

async function cancelledStep(jobId) {
    'use step';
    const { isCancelled } = await pipeline();
    return isCancelled(jobId);
}

// One run per transcription job; see server/transcription/orchestration.js for the sequence.
export async function transcribeVideoInBackground(jobId) {
    'use workflow';
    return runTranscription(jobId, {
        claim: claimStep,
        extract: extractAudioStep,
        transcribe: transcribeChunkStep,
        finalise: finaliseStep,
        fail: failStep,
        recover: recoverStep,
        cancelled: cancelledStep,
        sleep
    });
}
