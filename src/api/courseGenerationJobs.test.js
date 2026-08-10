import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
    getSession: vi.fn()
}));

vi.mock('./supabase.js', () => ({
    supabase: {
        rpc: mocks.rpc,
        auth: { getSession: mocks.getSession }
    }
}));

import {
    createBackgroundCourseGenerationJob,
    startBackgroundCourseGeneration
} from './courseGenerationJobs.js';

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('background course job submission', () => {
    it('stores the complete manager request before any generation starts', async () => {
        mocks.rpc.mockResolvedValue({ data: { id: 'job-1' }, error: null });

        await createBackgroundCourseGenerationJob({
            title: 'Course',
            objective: 'Objective',
            audience: 'Audience',
            topics: 'Topics',
            scenarios: 'Scenarios',
            allowPretest: true
        });

        expect(mocks.rpc).toHaveBeenCalledWith('create_background_course_generation_job', {
            p_title: 'Course',
            p_objective: 'Objective',
            p_request_json: {
                audience: 'Audience',
                topics: 'Topics',
                scenarios: 'Scenarios',
                allow_pretest: true
            }
        });
    });

    it('starts the server workflow with the signed in session and returns immediately', async () => {
        mocks.getSession.mockResolvedValue({
            data: { session: { access_token: 'access-token' } },
            error: null
        });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ jobId: 'job-1', runId: 'run-1', status: 'queued' })
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await startBackgroundCourseGeneration('job-1');

        expect(result.runId).toBe('run-1');
        expect(fetchMock).toHaveBeenCalledWith('/api/course-generation/start', expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ Authorization: 'Bearer access-token' })
        }));
    });
});
