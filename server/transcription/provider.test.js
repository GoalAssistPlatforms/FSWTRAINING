import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    TRANSCRIPTION_MODEL,
    createOpenRouterClient,
    mapProviderError,
    normaliseProviderWords,
    transcribeSpeechAudio
} from './provider.js';

describe('transcription provider', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('only ever talks to OpenRouter', () => {
        vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
        const client = createOpenRouterClient();
        expect(String(client.baseURL)).toBe('https://openrouter.ai/api/v1');
        expect(TRANSCRIPTION_MODEL).toBe('openai/whisper-1');
    });

    it('refuses to start without the OpenRouter key', () => {
        vi.stubEnv('OPENROUTER_API_KEY', '');
        expect(() => createOpenRouterClient()).toThrow(/OPENROUTER_API_KEY/);
    });

    it('maps provider failures onto the job error codes', () => {
        expect(mapProviderError({ status: 401 })).toBe('PROVIDER_AUTHENTICATION_FAILED');
        expect(mapProviderError({ status: 429 })).toBe('PROVIDER_RATE_LIMITED');
        expect(mapProviderError({ name: 'APIConnectionTimeoutError' })).toBe('PROVIDER_TIMEOUT');
        expect(mapProviderError({ status: 503 })).toBe('PROVIDER_UNAVAILABLE');
        expect(mapProviderError({ code: 'ECONNRESET' })).toBe('PROVIDER_UNAVAILABLE');
        expect(mapProviderError({ status: 400 })).toBe('PROVIDER_INVALID_RESPONSE');
    });

    it('drops malformed words and lower-cases the language', () => {
        const result = normaliseProviderWords({
            language: 'EN',
            words: [
                { word: 'keep', start: 0.1, end: 0.4 },
                { word: '   ', start: 0.5, end: 0.6 },
                { word: 'backwards', start: 1, end: 0.9 },
                { text: 'alias', start: 2, end: 2.5 }
            ]
        });
        expect(result).toEqual({
            language: 'en',
            words: [
                { word: 'keep', start: 0.1, end: 0.4 },
                { word: 'alias', start: 2, end: 2.5 }
            ]
        });
    });

    it('requests word timings with an idempotency key and returns the request id', async () => {
        const create = vi.fn().mockResolvedValue({
            _request_id: 'req-1',
            language: 'en',
            words: [{ word: 'hello', start: 0, end: 0.5 }]
        });
        const client = { audio: { transcriptions: { create } } };

        const result = await transcribeSpeechAudio(client, Buffer.from('audio'), 'chunk_0.mp3', {
            idempotencyKey: 'job:1:chunk:0'
        });

        expect(result).toEqual({
            language: 'en',
            words: [{ word: 'hello', start: 0, end: 0.5 }],
            requestId: 'req-1'
        });
        const [body, options] = create.mock.calls[0];
        expect(body.model).toBe('openai/whisper-1');
        expect(body.response_format).toBe('verbose_json');
        expect(body.timestamp_granularities).toEqual(['word']);
        expect(options.headers).toEqual({ 'Idempotency-Key': 'job:1:chunk:0' });
    });

    it('treats a response without word timings as invalid', async () => {
        const client = { audio: { transcriptions: { create: vi.fn().mockResolvedValue({ text: 'hello' }) } } };
        await expect(transcribeSpeechAudio(client, Buffer.from('audio'), 'chunk_0.mp3')).rejects.toMatchObject({
            code: 'PROVIDER_INVALID_RESPONSE'
        });
    });
});
