export const TRANSCRIPTION_CHUNK_DURATION_SECONDS = 240;
export const TRANSCRIPTION_CHUNK_OVERLAP_SECONDS = 1;
export const MAX_TRANSCRIPTION_CHUNKS = 30;

export type TranscriptionChunkPlanItem = {
    index: number;
    startTime: number;
    endTime: number;
};

export type TranscriptionChunkResult = TranscriptionChunkPlanItem & {
    response: {
        language?: string;
        words?: Array<{
            word?: string;
            text?: string;
            start?: number;
            end?: number;
        }>;
    };
};

export const createTranscriptionChunkPlan = (
    duration: number,
    chunkDuration = TRANSCRIPTION_CHUNK_DURATION_SECONDS,
    overlap = TRANSCRIPTION_CHUNK_OVERLAP_SECONDS
): TranscriptionChunkPlanItem[] => {
    if (!Number.isFinite(duration) || duration <= 0) {
        return [];
    }
    if (!Number.isFinite(chunkDuration) || chunkDuration <= 0) {
        throw new Error('Transcription chunk duration must be positive.');
    }
    if (!Number.isFinite(overlap) || overlap < 0 || overlap >= chunkDuration) {
        throw new Error('Transcription chunk overlap must be shorter than the chunk duration.');
    }

    const chunks: TranscriptionChunkPlanItem[] = [];
    let startTime = 0;

    while (startTime < duration) {
        if (chunks.length >= MAX_TRANSCRIPTION_CHUNKS) {
            throw new Error('This recording is too long for automatic transcription.');
        }

        const endTime = Math.min(duration, startTime + chunkDuration);
        chunks.push({
            index: chunks.length,
            startTime,
            endTime
        });

        if (endTime >= duration) {
            break;
        }
        startTime = endTime - overlap;
    }

    return chunks;
};

export const stitchTranscriptionChunks = (
    chunkResults: TranscriptionChunkResult[],
    duration: number,
    requestId: string
) => {
    if (!Array.isArray(chunkResults) || chunkResults.length === 0) {
        throw new Error('No transcription chunks were returned.');
    }

    const safeDuration = Number(duration);
    if (!Number.isFinite(safeDuration) || safeDuration <= 0) {
        throw new Error('The recording duration is invalid.');
    }

    const orderedChunks = [...chunkResults].sort((a, b) => a.index - b.index);
    const words: Array<{ word: string; start: number; end: number }> = [];

    orderedChunks.forEach((chunk, chunkPosition) => {
        const previousChunk = orderedChunks[chunkPosition - 1];
        const nextChunk = orderedChunks[chunkPosition + 1];
        const ownershipStart = previousChunk
            ? (chunk.startTime + previousChunk.endTime) / 2
            : 0;
        const ownershipEnd = nextChunk
            ? (chunk.endTime + nextChunk.startTime) / 2
            : safeDuration;
        const isLastChunk = chunkPosition === orderedChunks.length - 1;
        const rawWords = Array.isArray(chunk.response?.words) ? chunk.response.words : [];

        rawWords.forEach(rawWord => {
            const text = String(rawWord?.word || rawWord?.text || '').trim();
            const localStart = Number(rawWord?.start);
            const localEnd = Number(rawWord?.end);
            if (!text || !Number.isFinite(localStart) || !Number.isFinite(localEnd) || localEnd <= localStart) {
                return;
            }

            const start = Math.max(0, chunk.startTime + localStart);
            const end = Math.min(safeDuration, chunk.startTime + localEnd);
            if (end <= start) {
                return;
            }

            const midpoint = start + ((end - start) / 2);
            const belongsToChunk = midpoint >= ownershipStart
                && (isLastChunk ? midpoint <= ownershipEnd : midpoint < ownershipEnd);
            if (!belongsToChunk) {
                return;
            }

            words.push({ word: text, start, end });
        });
    });

    words.sort((a, b) => a.start - b.start || a.end - b.end);

    return {
        requestId,
        language: String(orderedChunks.find(chunk => chunk.response?.language)?.response.language || 'en').toLowerCase(),
        duration: safeDuration,
        text: words.map(word => word.word).join(' '),
        segments: [],
        words
    };
};
