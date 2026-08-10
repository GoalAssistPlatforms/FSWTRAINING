import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './dalle.js';

function createResponse() {
  return {
    setHeader: vi.fn(),
    status: vi.fn(function status() {
      return this;
    }),
    json: vi.fn(function json() {
      return this;
    })
  };
}

describe('OpenAI image proxy', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('uses GPT Image 2 at high quality for course thumbnails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [{ b64_json: 'image-data' }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = { method: 'POST', body: { prompt: 'A training thumbnail' } };
    const res = createResponse();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toEqual({
      model: 'gpt-image-2',
      prompt: 'A training thumbnail',
      size: '1536x1024',
      quality: 'high',
      output_format: 'webp',
      output_compression: 90,
      n: 1
    });
    expect(res.setHeader).toHaveBeenCalledWith('X-Image-Model', 'gpt-image-2');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('falls back to the next strongest model when GPT Image 2 is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: { code: 'model_not_found' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [{ b64_json: 'fallback-image' }] })
      });
    vi.stubGlobal('fetch', fetchMock);

    const req = { method: 'POST', body: { prompt: 'A training thumbnail' } };
    const res = createResponse();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('gpt-image-1.5');
    expect(res.setHeader).toHaveBeenCalledWith('X-Image-Model', 'gpt-image-1.5');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not retry user-correctable image generation errors', async () => {
    const errorBody = {
      error: {
        type: 'image_generation_user_error',
        code: 'moderation_blocked'
      }
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue(errorBody)
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = { method: 'POST', body: { prompt: 'A blocked prompt' } };
    const res = createResponse();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(errorBody);
  });
});
