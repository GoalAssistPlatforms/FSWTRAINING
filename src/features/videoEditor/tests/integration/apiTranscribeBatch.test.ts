import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../../../server/legacy/transcribe';

const mockSupabase = {
    auth: {
        getUser: vi.fn()
    },
    rpc: vi.fn()
};

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => mockSupabase)
}));

const mockTranscriptionCreate = vi.fn();

vi.mock('openai', () => {
    class MockOpenAI {
        audio = {
            transcriptions: {
                create: mockTranscriptionCreate
            }
        };
    }

    return {
        default: MockOpenAI,
        toFile: vi.fn(async (buffer, filename) => ({ buffer, filename }))
    };
});

const GUIDE_ID = '550e8400-e29b-41d4-a716-446655440000';
const BATCH_ID = '550e8400-e29b-41d4-a716-446655440001';
const BOUNDARY = '----ChunkedTranscriptionBoundary';

const makeResponse = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis()
});

const makeJsonRequest = (body: Record<string, unknown>) => ({
    method: 'POST',
    headers: {
        authorization: 'Bearer manager-token',
        'content-type': 'application/json'
    },
    body
});

const buildMultipartBody = (
    fields: Record<string, string>,
    fileContent = Buffer.from('fake wav data')
) => {
    const parts: Buffer[] = [];

    Object.entries(fields).forEach(([name, value]) => {
        parts.push(Buffer.from(
            `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
        ));
    });

    parts.push(Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="part.wav"\r\nContent-Type: audio/wav\r\n\r\n`
    ));
    parts.push(fileContent);
    parts.push(Buffer.from(`\r\n--${BOUNDARY}--\r\n`));
    return Buffer.concat(parts);
};

const makeMultipartRequest = (fields: Record<string, string>) => {
    const request = new Readable({
        read() {}
    }) as Readable & {
        method: string;
        headers: Record<string, string>;
    };
    const body = buildMultipartBody(fields);
    request.push(body);
    request.push(null);
    request.method = 'POST';
    request.headers = {
        authorization: 'Bearer manager-token',
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        'content-length': String(body.length)
    };
    return request;
};

describe('chunked transcription API', () => {
    beforeEach(() => {
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_ANON_KEY = 'test-anon-key';

        vi.clearAllMocks();
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: 'manager-user' } },
            error: null
        });
        mockSupabase.rpc.mockImplementation(async (functionName: string) => {
            if (functionName === 'can_edit_video_editor_guide') {
                return { data: true, error: null };
            }
            if (functionName === 'check_and_record_transcription_rate_limit') {
                return {
                    data: { allowed: true, remaining: 4, retry_after_seconds: 0 },
                    error: null
                };
            }
            return { data: false, error: null };
        });
        mockTranscriptionCreate.mockResolvedValue({
            language: 'en',
            words: [{ word: 'hello', start: 0, end: 0.5 }]
        });
    });

    const startBatch = async () => {
        const response = makeResponse();
        await handler(makeJsonRequest({
            action: 'start_transcription_batch',
            guideId: GUIDE_ID,
            batchId: BATCH_ID,
            chunkCount: 3
        }) as any, response as any);

        expect(response.status).toHaveBeenCalledWith(200);
        return response.json.mock.calls[0][0];
    };

    it('records quota once and returns a signed batch', async () => {
        const batch = await startBatch();

        expect(batch).toEqual(expect.objectContaining({
            batchId: BATCH_ID,
            batchToken: expect.any(String),
            expiresAt: expect.any(Number)
        }));
        expect(mockSupabase.rpc.mock.calls.filter(
            ([functionName]) => functionName === 'check_and_record_transcription_rate_limit'
        )).toHaveLength(1);
    });

    it('accepts an authenticated chunk without recording quota again', async () => {
        const batch = await startBatch();
        const response = makeResponse();

        await handler(makeMultipartRequest({
            guideId: GUIDE_ID,
            batchId: BATCH_ID,
            batchToken: batch.batchToken,
            chunkIndex: '1',
            chunkCount: '3'
        }) as any, response as any);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(mockTranscriptionCreate).toHaveBeenCalledTimes(1);
        expect(mockSupabase.rpc.mock.calls.filter(
            ([functionName]) => functionName === 'check_and_record_transcription_rate_limit'
        )).toHaveLength(1);
    });

    it('rejects a modified batch token before calling the provider', async () => {
        const batch = await startBatch();
        const response = makeResponse();
        const finalCharacter = batch.batchToken.endsWith('a') ? 'b' : 'a';
        const modifiedToken = `${batch.batchToken.slice(0, -1)}${finalCharacter}`;

        await handler(makeMultipartRequest({
            guideId: GUIDE_ID,
            batchId: BATCH_ID,
            batchToken: modifiedToken,
            chunkIndex: '0',
            chunkCount: '3'
        }) as any, response as any);

        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith({
            error: expect.objectContaining({
                code: 'INVALID_BATCH'
            })
        });
        expect(mockTranscriptionCreate).not.toHaveBeenCalled();
    });
});
