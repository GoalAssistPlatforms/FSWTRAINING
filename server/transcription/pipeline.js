// The work each workflow step performs. Kept apart from server/workflows/videoTranscription.js
// because that module is compiled into deterministic workflow code, where Node APIs are not
// available outside step functions.
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
    claimTranscriptionJob,
    downloadSpeechAudio,
    getSourceAsset,
    getTranscriptionJob,
    heartbeatTranscriptionJob,
    isTranscriptionJobCancelled,
    recordTranscriptionFailure,
    recordTranscriptionResult,
    recordTranscriptionStage,
    recoverStaleTranscriptionJob,
    resolveSourceDownloadUrl,
    setSourceAudioPath,
    uploadSpeechAudio
} from './database.js';
import { classifyFfmpegFailure, extractSpeechAudio, isAbortError, sliceSpeechAudio } from './ffmpeg.js';
import { TRANSCRIPTION_MODEL, createOpenRouterClient, mapProviderError, transcribeSpeechAudio } from './provider.js';
import {
    MAX_TRANSCRIPTION_CHUNKS,
    stitchTranscriptionChunks
} from '../../src/features/videoEditor/services/chunkedTranscription.ts';
import { normaliseWhisperResponse } from '../../src/features/videoEditor/domain/transcriptionNormalisation.ts';
import { validateSourceTranscript } from '../../src/features/videoEditor/domain/transcriptValidation.ts';
import { CHUNK_OVERLAP_SECONDS, CHUNK_SECONDS } from './chunking.js';

const LEASE_SECONDS = 300;
const HEARTBEAT_INTERVAL_MS = 60000;
const DEFAULT_MAX_SOURCE_SECONDS = 3 * 60 * 60;
const DOWNLOAD_FALLBACK_LIMIT_BYTES = 400 * 1024 * 1024;
const STAGE_ORDER = ['preparing_source', 'extracting_audio', 'submitting', 'provider_processing', 'normalising', 'validating', 'ready_for_review'];

const speechAudioPathFor = sourceAssetId => `transcription-audio/${sourceAssetId}.mp3`;
const failure = errorCode => ({ ok: false, errorCode });

const secondsUntil = iso => {
    const milliseconds = Date.parse(iso) - Date.now();
    return Number.isFinite(milliseconds) ? Math.max(5, Math.ceil(milliseconds / 1000)) : 5;
};

const maxSourceSeconds = () => {
    const configured = Number(process.env.BACKGROUND_TRANSCRIPTION_MAX_SECONDS);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_SOURCE_SECONDS;
};

// Keeps the job lease alive while long work runs, and aborts that work if the lease is lost
// (cancelled from the editor, or taken over after an expiry).
async function withLeaseHeartbeat(jobId, lease, task) {
    if (!(await heartbeatTranscriptionJob(jobId, lease, LEASE_SECONDS))) return { leaseLost: true };

    const controller = new AbortController();
    let leaseLost = false;
    const timer = setInterval(async () => {
        try {
            if (!(await heartbeatTranscriptionJob(jobId, lease, LEASE_SECONDS))) {
                leaseLost = true;
                controller.abort();
            }
        } catch {
            // A transient database error is not a lost lease; the next beat will try again.
        }
    }, HEARTBEAT_INTERVAL_MS);

    try {
        const value = await task(controller.signal);
        return leaseLost ? { leaseLost: true } : { value };
    } catch (error) {
        if (leaseLost || isAbortError(error)) return { leaseLost: true };
        throw error;
    } finally {
        clearInterval(timer);
    }
}

// Stage transitions are strictly ordered in the database, so a step that is re-run after an
// interruption must not repeat one it already made.
async function advanceStage(jobId, lease, stage, status) {
    const job = await getTranscriptionJob(jobId);
    if (STAGE_ORDER.indexOf(job.progress_stage) >= STAGE_ORDER.indexOf(stage)) {
        return job.lease_owner === lease.owner && job.lease_generation === lease.generation;
    }
    return recordTranscriptionStage(jobId, lease, stage, status);
}

class ByteLimit extends Transform {
    constructor(limit) {
        super();
        this.limit = limit;
        this.seen = 0;
    }

    _transform(chunk, _encoding, callback) {
        this.seen += chunk.length;
        if (this.seen > this.limit) {
            const error = new Error('The source video is too large to download for processing.');
            error.code = 'DOWNLOAD_TOO_LARGE';
            callback(error);
            return;
        }
        callback(null, chunk);
    }
}

async function downloadToFile(url, path, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok || !response.body) {
        const error = new Error('The source video could not be downloaded.');
        error.code = 'DOWNLOAD_FAILED';
        throw error;
    }
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > DOWNLOAD_FALLBACK_LIMIT_BYTES) {
        const error = new Error('The source video is too large to download for processing.');
        error.code = 'DOWNLOAD_TOO_LARGE';
        throw error;
    }
    await pipeline(Readable.fromWeb(response.body), new ByteLimit(DOWNLOAD_FALLBACK_LIMIT_BYTES), createWriteStream(path, { flags: 'wx' }));
}

export async function claimJob(jobId) {
    const leaseOwner = `workflow:${jobId}:${randomUUID()}`;
    const job = await claimTranscriptionJob(jobId, leaseOwner, LEASE_SECONDS);
    const claimed = job.status === 'extracting_audio' && job.lease_owner === leaseOwner;
    return {
        claimed,
        status: job.status,
        leaseOwner: claimed ? leaseOwner : null,
        leaseGeneration: claimed ? job.lease_generation : null,
        sourceAssetId: job.source_asset_id,
        attemptCount: job.attempt_count,
        waitSeconds: job.status === 'queued' ? secondsUntil(job.next_attempt_at) : 0
    };
}

export async function extractAudio(jobId, lease, sourceAssetId) {
    const asset = await getSourceAsset(sourceAssetId);
    if (!asset) return failure('SOURCE_NOT_FOUND');

    const duration = Number(asset.duration_seconds);
    if (!Number.isFinite(duration) || duration <= 0) return failure('SOURCE_NOT_READY');
    if (duration > maxSourceSeconds() || duration > MAX_TRANSCRIPTION_CHUNKS * (CHUNK_SECONDS - CHUNK_OVERLAP_SECONDS)) {
        return failure('AUDIO_TOO_LARGE');
    }

    let sourceUrl;
    try {
        sourceUrl = await resolveSourceDownloadUrl(asset);
    } catch (error) {
        return failure(error?.code === 'SOURCE_NOT_TRUSTED' ? 'SOURCE_NOT_FOUND' : 'SOURCE_DOWNLOAD_FAILED');
    }
    if (!sourceUrl) return failure('SOURCE_NOT_FOUND');

    const workspace = await mkdtemp(join(tmpdir(), 'fsw-transcription-'));
    let phase = 'extract';
    try {
        const outcome = await withLeaseHeartbeat(jobId, lease, async signal => {
            const audioFile = join(workspace, 'speech.mp3');
            try {
                await extractSpeechAudio(sourceUrl, audioFile, { signal });
            } catch (error) {
                if (classifyFfmpegFailure(error) !== 'PROTOCOL_UNSUPPORTED') throw error;
                // This FFmpeg build cannot read https itself: fetch the video to disk first.
                phase = 'download';
                const videoFile = join(workspace, 'source.video');
                await downloadToFile(sourceUrl, videoFile, signal);
                phase = 'extract';
                await extractSpeechAudio(videoFile, audioFile, { signal });
                await rm(videoFile, { force: true });
            }

            phase = 'store';
            const buffer = await readFile(audioFile);
            const storagePath = speechAudioPathFor(sourceAssetId);
            await uploadSpeechAudio(storagePath, buffer);
            await setSourceAudioPath(sourceAssetId, storagePath);
            return { storagePath, bytes: buffer.length };
        });
        if (outcome.leaseLost) return { leaseLost: true };
        if (!(await advanceStage(jobId, lease, 'submitting', 'transcribing'))) return { leaseLost: true };
        return { ok: true, audioStoragePath: outcome.value.storagePath, audioBytes: outcome.value.bytes, duration };
    } catch (error) {
        // Messages can contain the source URL, so only the classification is logged.
        console.error('Speech audio extraction failed.', { jobId, phase, name: error?.name, code: error?.code });
        if (phase === 'extract') {
            return failure(classifyFfmpegFailure(error) === 'INPUT_UNAVAILABLE' ? 'SOURCE_DOWNLOAD_FAILED' : 'AUDIO_EXTRACTION_FAILED');
        }
        if (error?.code === 'DOWNLOAD_TOO_LARGE') return failure('AUDIO_TOO_LARGE');
        return failure('SOURCE_DOWNLOAD_FAILED');
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

export async function transcribeChunk(jobId, lease, audioStoragePath, chunk, attemptCount) {
    const workspace = await mkdtemp(join(tmpdir(), 'fsw-transcription-chunk-'));
    let phase = 'download';
    try {
        const outcome = await withLeaseHeartbeat(jobId, lease, async signal => {
            const fullPath = join(workspace, 'speech.mp3');
            await writeFile(fullPath, await downloadSpeechAudio(audioStoragePath));

            phase = 'slice';
            const piecePath = join(workspace, `chunk_${chunk.index}.mp3`);
            await sliceSpeechAudio(fullPath, piecePath, chunk.startTime, chunk.endTime - chunk.startTime, { signal });

            phase = 'provider';
            const client = createOpenRouterClient();
            return transcribeSpeechAudio(client, await readFile(piecePath), `chunk_${chunk.index}.mp3`, {
                idempotencyKey: `transcription-job:${jobId}:attempt:${attemptCount}:chunk:${chunk.index}`,
                signal
            });
        });
        if (outcome.leaseLost) return { leaseLost: true };
        return {
            ok: true,
            index: chunk.index,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            language: outcome.value.language,
            words: outcome.value.words,
            requestId: outcome.value.requestId
        };
    } catch (error) {
        console.error('Chunk transcription failed.', { jobId, chunk: chunk.index, phase, name: error?.name, code: error?.code, status: error?.status });
        if (phase === 'download') return failure('SOURCE_DOWNLOAD_FAILED');
        if (phase === 'slice') return failure('AUDIO_EXTRACTION_FAILED');
        if (error?.code === 'PROVIDER_INVALID_RESPONSE') return failure('PROVIDER_INVALID_RESPONSE');
        return failure(mapProviderError(error));
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

export async function finaliseTranscript(jobId, lease, sourceAssetId, duration, chunks) {
    if (!(await heartbeatTranscriptionJob(jobId, lease, LEASE_SECONDS))) return { leaseLost: true };
    if (!(await advanceStage(jobId, lease, 'provider_processing', 'transcribing'))) return { leaseLost: true };
    if (!(await advanceStage(jobId, lease, 'normalising', 'validating'))) return { leaseLost: true };

    const requestId = chunks.map(chunk => chunk.requestId).filter(Boolean).join(',') || `workflow:${jobId}`;
    let transcript;
    try {
        const stitched = stitchTranscriptionChunks(
            chunks.map(chunk => ({
                index: chunk.index,
                startTime: chunk.startTime,
                endTime: chunk.endTime,
                response: { language: chunk.language, words: chunk.words }
            })),
            duration,
            requestId
        );
        transcript = normaliseWhisperResponse(jobId, sourceAssetId, duration, {
            language: stitched.language,
            words: stitched.words
        });
    } catch (error) {
        console.error('Transcript normalisation failed.', { jobId, name: error?.name });
        return failure('TRANSCRIPT_NORMALISATION_FAILED');
    }

    try {
        validateSourceTranscript(transcript);
    } catch (error) {
        console.error('Transcript validation failed.', { jobId, name: error?.name });
        return failure('TRANSCRIPT_VALIDATION_FAILED');
    }

    if (!(await advanceStage(jobId, lease, 'validating', 'validating'))) return { leaseLost: true };

    try {
        const recorded = await recordTranscriptionResult(jobId, lease, transcript, requestId, {
            provider: 'openrouter',
            model: TRANSCRIPTION_MODEL,
            chunkCount: chunks.length,
            wordCount: transcript.words.length
        });
        if (!recorded) return { leaseLost: true };
    } catch (error) {
        console.error('Transcript could not be recorded.', { jobId, name: error?.name, code: error?.code });
        return failure('TRANSCRIPT_VALIDATION_FAILED');
    }

    return { ok: true, wordCount: transcript.words.length };
}

// Records a failure against the current lease (or whatever lease the job row holds when the
// caller no longer knows it) and reports whether the database queued another attempt.
export async function recordFailure(jobId, lease, errorCode) {
    let recorded = false;
    try {
        let effectiveLease = lease;
        if (!effectiveLease) {
            const current = await getTranscriptionJob(jobId);
            effectiveLease = { owner: current.lease_owner, generation: current.lease_generation };
        }
        recorded = await recordTranscriptionFailure(jobId, effectiveLease, errorCode);
    } catch (error) {
        console.error('Transcription failure could not be recorded.', { jobId, errorCode, name: error?.name });
    }
    const job = await getTranscriptionJob(jobId);
    return {
        recorded,
        status: job.status,
        waitSeconds: job.status === 'queued' ? secondsUntil(job.next_attempt_at) : 0
    };
}

export async function recoverLease(jobId) {
    try {
        await recoverStaleTranscriptionJob(jobId);
    } catch (error) {
        console.error('Stale transcription lease could not be recovered.', { jobId, name: error?.name });
    }
    const job = await getTranscriptionJob(jobId);
    return { status: job.status };
}

export async function isCancelled(jobId) {
    return isTranscriptionJobCancelled(jobId);
}
