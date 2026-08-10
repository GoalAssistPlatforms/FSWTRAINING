import { createError, defineEventHandler } from 'nitro/h3';
import {
    createUserSupabase,
    getServiceSupabase,
    updateGenerationJob
} from '../../courseGeneration/database.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readBearerToken(request) {
    const authorization = request.headers.get('authorization') || '';
    return authorization.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7).trim()
        : '';
}

export default defineEventHandler(async ({ req }) => {
    const accessToken = readBearerToken(req);
    if (!accessToken) {
        throw createError({ statusCode: 401, statusMessage: 'Authentication required' });
    }

    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId || '');
    if (!UUID_PATTERN.test(jobId)) {
        throw createError({ statusCode: 400, statusMessage: 'A valid course generation job is required' });
    }

    const userClient = createUserSupabase(accessToken);
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData?.user) {
        throw createError({ statusCode: 401, statusMessage: 'Your session has expired' });
    }

    const serviceClient = getServiceSupabase();
    const { data: job, error: jobError } = await serviceClient
        .from('course_generation_jobs')
        .select('id, account_id, created_by, status')
        .eq('id', jobId)
        .single();

    if (jobError || !job) {
        throw createError({ statusCode: 404, statusMessage: 'Course generation job not found' });
    }

    const { data: membership, error: membershipError } = await serviceClient
        .from('account_memberships')
        .select('role')
        .eq('account_id', job.account_id)
        .eq('user_id', userData.user.id)
        .maybeSingle();

    const ownsJob = job.created_by === userData.user.id;
    const isAdmin = !membershipError && membership?.role === 'admin';
    const isManager = !membershipError && membership?.role === 'manager';

    if ((!ownsJob && !isAdmin) || (ownsJob && !isManager && !isAdmin)) {
        throw createError({ statusCode: 403, statusMessage: 'You cannot remove this course generation job' });
    }

    if (job.status === 'cancelled') {
        return { jobId, status: 'cancelled' };
    }

    if (job.status !== 'queued') {
        throw createError({
            statusCode: 409,
            statusMessage: 'Only a queued course can be removed immediately. Use Cancel for a course already generating.'
        });
    }

    const now = new Date().toISOString();
    const cancelled = await updateGenerationJob(jobId, {
        status: 'cancelled',
        stage: 'cancelled',
        stage_message: 'Removed from course generation queue',
        cancel_requested_at: now,
        finished_at: now,
        workflow_run_id: null,
        error_code: null,
        error_message: null
    });

    return {
        jobId,
        status: cancelled.status
    };
});
