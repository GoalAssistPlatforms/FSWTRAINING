import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateThumbnail } from './images.js';

describe('generateThumbnail', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('generates through the OpenAI proxy and persists the returned image', async () => {
        vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'test-cloud');
        vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', 'test-preset');

        const fetchMock = vi.fn(async (url, options) => {
            if (url === '/api/openai') {
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'A brass compass' } }]
                    })
                };
            }

            if (url === '/api/dalle') {
                return {
                    ok: true,
                    json: async () => ({ data: [{ b64_json: 'generated-image' }] })
                };
            }

            if (url === 'https://api.cloudinary.com/v1_1/test-cloud/image/upload') {
                const uploadedFile = options.body.get('file');
                expect(uploadedFile).toBe('data:image/webp;base64,generated-image');

                return {
                    ok: true,
                    json: async () => ({ secure_url: 'https://cdn.example.com/thumbnail.png' })
                };
            }

            throw new Error(`Unexpected request to ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateThumbnail('Leadership');

        expect(result).toBe('https://cdn.example.com/thumbnail.png');
        const imageRequest = fetchMock.mock.calls.find(([url]) => url === '/api/dalle');
        expect(JSON.parse(imageRequest[1].body).prompt).toContain('A brass compass');
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('pollinations.ai'))).toBe(false);
    });
});
