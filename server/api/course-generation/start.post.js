import { start } from 'workflow/api';
import { createError, defineEventHandler } from 'nitro/h3';
import { createUserSupabase, updateGenerationJob } from '../../courseGeneration/database.js';
import { generateCourseInBackground } from '../../workflows/courseGeneration.js';

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

    const { data: preparation, error: preparationError } = await userClient.rpc(
        'prepare_background_course_generation_start',
        { p_job_id: jobId }
    );
    if (preparationError) {
        throw createError({
            statusCode: preparationError.code === '42501' ? 403 : 400,
            statusMessage: preparationError.message || 'Course generation could not be prepared'
        });
    }

    if (!preparation?.should_start) {
        return {
            jobId,
            runId: preparation?.job?.workflow_run_id || null,
            status: preparation?.job?.status || 'queued',
            alreadyStarted: true
        };
    }

    let run;
    try {
        run = await start(generateCourseInBackground, [jobId]);
    } catch (error) {
        await updateGenerationJob(jobId, {
            workflow_run_id: null,
            status: 'failed',
            stage: 'failed',
            stage_message: 'Course generation could not be started',
            error_code: 'WORKFLOW_START_FAILED',
            error_message: String(error?.message || error).slice(0, 2000),
            finished_at: new Date().toISOString()
        }).catch(() => {});
        throw createError({
            statusCode: 503,
            statusMessage: 'Course generation could not be started. Please try again.'
        });
    }

    await updateGenerationJob(jobId, {
        workflow_run_id: run.runId
    }).catch(error => {
        console.warn('The workflow started before its run identifier could be saved.', error);
    });

    return {
        jobId,
        runId: run.runId,
        status: 'queued',
        alreadyStarted: false
    };
});
