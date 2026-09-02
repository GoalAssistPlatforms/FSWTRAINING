import { createError, defineEventHandler } from 'nitro/h3';
import { createUserSupabase } from '../../courseGeneration/database.js';
import { setTranscriptionWorkflowRun } from '../../transcription/database.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readBearerToken(request) {
    const authorization = request.headers.get('authorization') || '';
    return authorization.toLowerCase().startsWith('bearer ')
        ? authorization.slice(7).trim()
        : '';
}

// Starts the background transcription run for a queued job. The job itself is created by the
// browser through create_video_transcription_job; this endpoint only attaches a workflow run,
// and the prepare RPC makes sure the caller may edit the guide and no run is already attached.
export default defineEventHandler(async ({ req }) => {
    const accessToken = readBearerToken(req);
    if (!accessToken) {
        throw createError({ statusCode: 401, statusMessage: 'Authentication required' });
    }

    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId || '');
    if (!UUID_PATTERN.test(jobId)) {
        throw createError({ statusCode: 400, statusMessage: 'A valid transcription job is required' });
    }

    const userClient = createUserSupabase(accessToken);
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData?.user) {
        throw createError({ statusCode: 401, statusMessage: 'Your session has expired' });
    }

    const { data: preparation, error: preparationError } = await userClient.rpc(
        'prepare_video_transcription_start',
        { p_job_id: jobId }
    );
    if (preparationError) {
        throw createError({
            statusCode: preparationError.code === '42501' ? 403 : 400,
            statusMessage: preparationError.message || 'Transcription could not be prepared'
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
        const [{ start }, { transcribeVideoInBackground }] = await Promise.all([
            import('workflow/api'),
            import('../../workflows/videoTranscription.js')
        ]);
        run = await start(transcribeVideoInBackground, [jobId]);
    } catch (error) {
        console.error('Transcription workflow could not be loaded or started.', error);
        // Detach so the next attempt from the editor can start a run.
        await setTranscriptionWorkflowRun(jobId, null).catch(() => {});
        throw createError({
            statusCode: 503,
            statusMessage: 'Background transcription could not be started. Please try again.'
        });
    }

    await setTranscriptionWorkflowRun(jobId, run.runId).catch(error => {
        console.warn('The transcription run started before its identifier could be saved.', error);
    });

    return {
        jobId,
        runId: run.runId,
        status: 'queued',
        alreadyStarted: false
    };
});
