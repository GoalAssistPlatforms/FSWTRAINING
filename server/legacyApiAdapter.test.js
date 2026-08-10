import { describe, expect, it } from 'vitest';
import {
    createLegacyRequest,
    createLegacyResponse,
    matchLegacyRoute
} from './legacyApiAdapter.js';

describe('legacy API compatibility inside Nitro', () => {
    it('parses JSON bodies, query strings, and headers for existing handlers', async () => {
        const request = new Request('https://fsw.example/api/elevenlabs?voiceType=fsw', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer token'
            },
            body: JSON.stringify({ text: 'Hello' })
        });
        const legacy = await createLegacyRequest(request, new URL(request.url));

        expect(legacy.method).toBe('POST');
        expect(legacy.query.voiceType).toBe('fsw');
        expect(legacy.headers.authorization).toBe('Bearer token');
        expect(legacy.body).toEqual({ text: 'Hello' });
    });

    it('preserves binary responses and status headers', async () => {
        const legacy = createLegacyResponse();
        legacy.response
            .status(201)
            .setHeader('Content-Type', 'audio/mpeg')
            .send(Buffer.from([1, 2, 3]));

        const response = legacy.toWebResponse();
        expect(response.status).toBe(201);
        expect(response.headers.get('content-type')).toBe('audio/mpeg');
        expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    });

    it('maps parameterised Gamma status routes without shadowing the new workflow route', () => {
        expect(matchLegacyRoute('/api/gamma/exports/export%201')).toEqual({
            name: 'gammaExportStatus',
            params: { id: 'export 1' }
        });
        expect(matchLegacyRoute('/api/course-generation/start')).toBeNull();
    });
});
