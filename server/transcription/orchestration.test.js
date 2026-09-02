import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';

const db = {
    claimTranscriptionJob: vi.fn(),
    downloadSpeechAudio: vi.fn(),
    getSourceAsset: vi.fn(),
    getTranscriptionJob: vi.fn(),
    heartbeatTranscriptionJob: vi.fn(),
    isTranscriptionJobCancelled: vi.fn(),
    recordTranscriptionFailure: vi.fn(),
    recordTranscriptionResult: vi.fn(),
    recordTranscriptionStage: vi.fn(),
    recoverStaleTranscriptionJob: vi.fn(),
    resolveSourceDownloadUrl: vi.fn(),
    setSourceAudioPath: vi.fn(),
    uploadSpeechAudio: vi.fn()
};
vi.mock('./database.js', () => db);

const ffmpeg = {
    classifyFfmpegFailure: vi.fn(() => 'UNKNOWN'),
    extractSpeechAudio: vi.fn(),
    isAbortError: error => error?.name === 'AbortError',
    sliceSpeechAudio: vi.fn()
};
vi.mock('./ffmpeg.js', () => ffmpeg);

const provider = {
    TRANSCRIPTION_MODEL: 'openai/whisper-1',
    createOpenRouterClient: vi.fn(() => ({})),
    mapProviderError: vi.fn(() => 'PROVIDER_UNAVAILABLE'),
    transcribeSpeechAudio: vi.fn()
};
vi.mock('./provider.js', () => provider);

const { runTranscription } = await import('./orchestration.js');
const pipeline = await import('./pipeline.js');
const { CHUNK_SECONDS } = await import('./chunking.js');

const JOB_ID = 'job-1';
const ASSET_ID = 'asset-1';
const sleep = vi.fn(async () => {});

// The same wiring the workflow uses, minus the 'use step' wrappers.
const steps = {
    claim: pipeline.claimJob,
    extract: pipeline.extractAudio,
    transcribe: pipeline.transcribeChunk,
    finalise: pipeline.finaliseTranscript,
    fail: pipeline.recordFailure,
    recover: pipeline.recoverLease,
    cancelled: pipeline.isCancelled,
    sleep
};

// A tiny in-memory job row that the mocked database functions read and update, so the
// pipeline's stage bookkeeping is exercised against the real transition rules.
function createJobState({ duration = 1200, status = 'queued', nextAttemptAt = null } = {}) {
    const state = {
        job: {
            id: JOB_ID,
            source_asset_id: ASSET_ID,
            status,
            progress_stage: 'preparing_source',
            lease_owner: null,
            lease_generation: 0,
            attempt_count: 0,
            next_attempt_at: nextAttemptAt
        },
        asset: {
            id: ASSET_ID,
            original_storage_path: 'https://project.supabase.co/storage/v1/object/public/guides/source.webm',
            duration_seconds: duration
        }
    };

    db.claimTranscriptionJob.mockImplementation(async (_jobId, leaseOwner) => {
        const job = state.job;
        if (job.status !== 'queued' || (job.next_attempt_at && Date.parse(job.next_attempt_at) > Date.now())) {
            return { ...job };
        }
        Object.assign(job, {
            status: 'extracting_audio',
            progress_stage: 'extracting_audio',
            lease_owner: leaseOwner,
            lease_generation: job.lease_generation + 1,
            attempt_count: job.attempt_count + 1,
            next_attempt_at: null
        });
        return { ...job };
    });
    db.getTranscriptionJob.mockImplementation(async () => ({ ...state.job }));
    db.getSourceAsset.mockImplementation(async () => ({ ...state.asset }));
    db.heartbeatTranscriptionJob.mockImplementation(async (_jobId, lease) =>
        state.job.lease_owner === lease.owner && state.job.lease_generation === lease.generation);
    db.recordTranscriptionStage.mockImplementation(async (_jobId, lease, stage, status) => {
        if (state.job.lease_owner !== lease.owner) return false;
        state.job.progress_stage = stage;
        state.job.status = status;
        return true;
    });
    db.recordTranscriptionResult.mockImplementation(async (_jobId, lease) => {
        if (state.job.lease_owner !== lease.owner) return false;
        state.job.status = 'awaiting_approval';
        state.job.progress_stage = 'ready_for_review';
        return true;
    });
    db.recordTranscriptionFailure.mockImplementation(async (_jobId, lease, errorCode) => {
        if (state.job.lease_owner !== lease.owner) return false;
        const retryable = ['SOURCE_DOWNLOAD_FAILED', 'AUDIO_EXTRACTION_FAILED', 'PROVIDER_UNAVAILABLE'].includes(errorCode);
        if (retryable && state.job.attempt_count < 4) {
            state.job.status = 'queued';
            state.job.next_attempt_at = new Date(Date.now() + 30000).toISOString();
        } else {
            state.job.status = 'failed';
        }
        state.job.lease_owner = null;
        return true;
    });
    db.recoverStaleTranscriptionJob.mockResolvedValue(false);
    db.isTranscriptionJobCancelled.mockImplementation(async () => state.job.status === 'cancelled');
    db.resolveSourceDownloadUrl.mockImplementation(async asset => asset.original_storage_path);
    db.uploadSpeechAudio.mockResolvedValue('transcription-audio/asset-1.mp3');
    db.setSourceAudioPath.mockResolvedValue(undefined);
    db.downloadSpeechAudio.mockResolvedValue(Buffer.from('speech'));

    ffmpeg.extractSpeechAudio.mockImplementation(async (_input, outputPath) => {
        await writeFile(outputPath, 'mp3');
        return { audioPath: outputPath, bytes: 3 };
    });
    ffmpeg.sliceSpeechAudio.mockImplementation(async (_input, outputPath) => {
        await writeFile(outputPath, 'mp3');
        return { audioPath: outputPath, bytes: 3 };
    });
    provider.transcribeSpeechAudio.mockImplementation(async (_client, _buffer, filename) => {
        const index = Number(filename.match(/chunk_(\d+)/)[1]);
        return {
            language: 'en',
            words: [{ word: `word${index}`, start: 1, end: 2 }],
            requestId: `req-${index}`
        };
    });

    return state;
}

describe('runTranscription with the real pipeline', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-02T10:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('claims the job, transcribes the audio in parallel pieces and records one stitched transcript for review', async () => {
        const state = createJobState({ duration: 1200 });

        const result = await runTranscription(JOB_ID, steps);

        expect(result).toEqual({ status: 'awaiting_approval', wordCount: 2 });
        expect(state.job.status).toBe('awaiting_approval');

        // One extraction from the stored video URL, then one Whisper call per 15 minute piece.
        expect(ffmpeg.extractSpeechAudio).toHaveBeenCalledTimes(1);
        expect(ffmpeg.extractSpeechAudio.mock.calls[0][0]).toBe(state.asset.original_storage_path);
        expect(provider.transcribeSpeechAudio).toHaveBeenCalledTimes(2);
        const keys = provider.transcribeSpeechAudio.mock.calls.map(call => call[3].idempotencyKey);
        expect(keys).toEqual([
            'transcription-job:job-1:attempt:1:chunk:0',
            'transcription-job:job-1:attempt:1:chunk:1'
        ]);

        // The second piece's word is placed on the video's timeline, not the piece's.
        const transcript = db.recordTranscriptionResult.mock.calls[0][2];
        expect(transcript.sourceAssetId).toBe(ASSET_ID);
        expect(transcript.duration).toBe(1200);
        expect(transcript.words.map(word => [word.text, word.startSourceTime])).toEqual([
            ['word0', 1],
            ['word1', CHUNK_SECONDS - 1 + 1]
        ]);
        expect(db.recordTranscriptionResult.mock.calls[0][4]).toMatchObject({ provider: 'openrouter', model: 'openai/whisper-1', chunkCount: 2 });
        expect(sleep).not.toHaveBeenCalled();
    });

    it('records a terminal failure and stops when the recording has no usable audio', async () => {
        const state = createJobState();
        ffmpeg.extractSpeechAudio.mockRejectedValue(Object.assign(new Error('no audio'), { code: 'FFMPEG_EXIT' }));
        ffmpeg.classifyFfmpegFailure.mockReturnValue('NO_AUDIO_STREAM');
        db.recordTranscriptionFailure.mockImplementation(async () => {
            state.job.status = 'failed';
            state.job.lease_owner = null;
            return true;
        });

        const result = await runTranscription(JOB_ID, steps);

        expect(result).toEqual({ status: 'failed', errorCode: 'AUDIO_EXTRACTION_FAILED' });
        expect(db.recordTranscriptionFailure).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ generation: 1 }), 'AUDIO_EXTRACTION_FAILED');
        expect(provider.transcribeSpeechAudio).not.toHaveBeenCalled();
    });

    it('waits for the retry the database schedules after a transient provider failure, then succeeds', async () => {
        createJobState({ duration: 600 });
        provider.transcribeSpeechAudio
            .mockRejectedValueOnce(Object.assign(new Error('upstream down'), { status: 503 }))
            .mockResolvedValue({ language: 'en', words: [{ word: 'ok', start: 0.5, end: 1 }], requestId: 'req-2' });
        sleep.mockImplementation(async () => {
            vi.setSystemTime(new Date(Date.now() + 31000));
        });

        const result = await runTranscription(JOB_ID, steps);

        expect(result).toEqual({ status: 'awaiting_approval', wordCount: 1 });
        expect(db.recordTranscriptionFailure).toHaveBeenCalledWith(JOB_ID, expect.anything(), 'PROVIDER_UNAVAILABLE');
        expect(sleep).toHaveBeenCalledWith('30s');
        expect(db.claimTranscriptionJob).toHaveBeenCalledTimes(2);
        // The retry runs under a fresh lease generation and attempt number.
        expect(provider.transcribeSpeechAudio.mock.calls[1][3].idempotencyKey).toBe('transcription-job:job-1:attempt:2:chunk:0');
    });

    it('does nothing when another run already owns the job', async () => {
        const state = createJobState({ status: 'extracting_audio' });
        state.job.lease_owner = 'workflow:job-1:someone-else';

        const result = await runTranscription(JOB_ID, steps);

        expect(result).toEqual({ status: 'extracting_audio' });
        expect(ffmpeg.extractSpeechAudio).not.toHaveBeenCalled();
        expect(db.recordTranscriptionFailure).not.toHaveBeenCalled();
    });

    it('stops without transcribing when the job is cancelled mid-way', async () => {
        const state = createJobState({ duration: 600 });
        db.uploadSpeechAudio.mockImplementation(async () => {
            state.job.status = 'cancelled';
            state.job.lease_owner = null;
            return 'transcription-audio/asset-1.mp3';
        });

        const result = await runTranscription(JOB_ID, steps);

        expect(['cancelled', 'queued', 'failed']).toContain(result.status);
        expect(provider.transcribeSpeechAudio).not.toHaveBeenCalled();
        expect(db.recordTranscriptionResult).not.toHaveBeenCalled();
    });

    it('marks the job failed if a step throws unexpectedly', async () => {
        const state = createJobState({ duration: 600 });
        const throwingSteps = { ...steps, extract: vi.fn(async () => { throw new Error('boom'); }) };
        db.recordTranscriptionFailure.mockImplementation(async (_jobId, lease, errorCode) => {
            expect(errorCode).toBe('INTERNAL_WORKER_ERROR');
            expect(lease.generation).toBe(1);
            state.job.status = 'failed';
            return true;
        });

        const result = await runTranscription(JOB_ID, throwingSteps);

        expect(result).toMatchObject({ status: 'failed', error: 'boom' });
    });
});
