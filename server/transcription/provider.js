import OpenAI, { toFile } from 'openai';

// All AI traffic goes through OpenRouter, matching the rest of the platform.
export const TRANSCRIPTION_MODEL = 'openai/whisper-1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 240000;

export function createOpenRouterClient() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('Missing required server configuration: OPENROUTER_API_KEY');
    return new OpenAI({
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: {
            'HTTP-Referer': process.env.VERCEL_PROJECT_PRODUCTION_URL
                ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
                : 'https://fswtraining.vercel.app',
            'X-Title': 'FSW Training Platform'
        }
    });
}

// Maps an SDK or network error onto the error codes the job table accepts.
export function mapProviderError(error) {
    const status = Number(error?.status);
    const code = String(error?.code || '');
    const name = String(error?.name || '');
    if (status === 401 || status === 403) return 'PROVIDER_AUTHENTICATION_FAILED';
    if (status === 429) return 'PROVIDER_RATE_LIMITED';
    if (name === 'APIConnectionTimeoutError' || code === 'ETIMEDOUT' || /timed out/i.test(String(error?.message || ''))) {
        return 'PROVIDER_TIMEOUT';
    }
    if (status >= 500 || name === 'APIConnectionError' || ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)) {
        return 'PROVIDER_UNAVAILABLE';
    }
    return 'PROVIDER_INVALID_RESPONSE';
}

export function normaliseProviderWords(response) {
    const rawWords = Array.isArray(response?.words) ? response.words : [];
    const words = [];
    for (const raw of rawWords) {
        const text = String(raw?.word ?? raw?.text ?? '').trim();
        const start = Number(raw?.start);
        const end = Number(raw?.end);
        if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
        words.push({ word: text, start, end });
    }
    return {
        language: String(response?.language || 'en').toLowerCase(),
        words
    };
}

// Transcribes one audio file with word level timings. Timings are relative to the start of the
// file; the caller offsets them into the source video's timeline.
export async function transcribeSpeechAudio(client, buffer, filename, { idempotencyKey, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
    const file = await toFile(buffer, filename, { type: 'audio/mpeg' });
    const response = await client.audio.transcriptions.create({
        file,
        model: TRANSCRIPTION_MODEL,
        response_format: 'verbose_json',
        timestamp_granularities: ['word']
    }, {
        timeout: timeoutMs,
        signal,
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined
    });

    if (!response || typeof response !== 'object' || !Array.isArray(response.words)) {
        const error = new Error('The transcription provider did not return word timings.');
        error.code = 'PROVIDER_INVALID_RESPONSE';
        throw error;
    }

    const { language, words } = normaliseProviderWords(response);
    return {
        language,
        words,
        requestId: response._request_id ? String(response._request_id) : null
    };
}
