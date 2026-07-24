import { describe, expect, it } from 'vitest';
import {
    createTranscriptionChunkPlan,
    stitchTranscriptionChunks
} from '../../services/chunkedTranscription';

describe('chunked transcription', () => {
    it('keeps every generated audio part within the four minute window', () => {
        const plan = createTranscriptionChunkPlan(500);

        expect(plan).toEqual([
            { index: 0, startTime: 0, endTime: 240 },
            { index: 1, startTime: 239, endTime: 479 },
            { index: 2, startTime: 478, endTime: 500 }
        ]);
    });

    it('returns one chunk for a short recording', () => {
        expect(createTranscriptionChunkPlan(90)).toEqual([
            { index: 0, startTime: 0, endTime: 90 }
        ]);
    });

    it('offsets word times and gives each overlap to exactly one chunk', () => {
        const result = stitchTranscriptionChunks([
            {
                index: 0,
                startTime: 0,
                endTime: 240,
                response: {
                    language: 'EN',
                    words: [
                        { word: 'Before', start: 238, end: 238.5 },
                        { word: 'old-boundary', start: 239.6, end: 239.8 }
                    ]
                }
            },
            {
                index: 1,
                startTime: 239,
                endTime: 479,
                response: {
                    language: 'en',
                    words: [
                        { word: 'new-boundary', start: 0.6, end: 0.8 },
                        { word: 'After', start: 10, end: 10.5 }
                    ]
                }
            }
        ], 479, 'batch-request');

        expect(result.requestId).toBe('batch-request');
        expect(result.language).toBe('en');
        expect(result.segments).toEqual([]);
        expect(result.words).toEqual([
            { word: 'Before', start: 238, end: 238.5 },
            { word: 'new-boundary', start: 239.6, end: 239.8 },
            { word: 'After', start: 249, end: 249.5 }
        ]);
    });

    it('rejects invalid overlap configuration', () => {
        expect(() => createTranscriptionChunkPlan(500, 240, 240))
            .toThrow('overlap must be shorter');
    });
});
