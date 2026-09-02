import { getServiceSupabase } from '../courseGeneration/database.js';

export const SOURCE_BUCKET = 'guides';
const SIGNED_URL_SECONDS = 15 * 60;

function serverSupabaseUrl() {
    const value = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!value) throw new Error('Missing required server configuration: VITE_SUPABASE_URL');
    return value;
}

function firstRow(data) {
    return Array.isArray(data) ? data[0] : data;
}

export async function getTranscriptionJob(jobId) {
    const { data, error } = await getServiceSupabase()
        .from('video_transcription_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
    if (error) throw error;
    return data;
}

export async function getSourceAsset(sourceAssetId) {
    const { data, error } = await getServiceSupabase()
        .from('video_source_assets')
        .select('id, guide_id, original_storage_path, audio_storage_path, duration_seconds, file_size_bytes, preparation_status')
        .eq('id', sourceAssetId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function claimTranscriptionJob(jobId, leaseOwner, leaseDurationSeconds) {
    const { data, error } = await getServiceSupabase().rpc('claim_video_transcription_job', {
        p_job_id: jobId,
        p_lease_owner: leaseOwner,
        p_lease_duration_seconds: leaseDurationSeconds
    });
    if (error) throw error;
    return firstRow(data);
}

export async function heartbeatTranscriptionJob(jobId, lease, leaseDurationSeconds) {
    const { data, error } = await getServiceSupabase().rpc('heartbeat_video_transcription_job', {
        p_job_id: jobId,
        p_lease_owner: lease.owner,
        p_lease_generation: lease.generation,
        p_lease_duration_seconds: leaseDurationSeconds
    });
    if (error) throw error;
    return Boolean(data);
}

export async function recordTranscriptionStage(jobId, lease, stage, status) {
    const { data, error } = await getServiceSupabase().rpc('record_video_transcription_stage', {
        p_job_id: jobId,
        p_lease_owner: lease.owner,
        p_lease_generation: lease.generation,
        p_stage: stage,
        p_status: status
    });
    if (error) throw error;
    return Boolean(data);
}

export async function recordTranscriptionResult(jobId, lease, transcriptJson, providerRequestId, providerMetadata) {
    const { data, error } = await getServiceSupabase().rpc('record_video_transcription_result', {
        p_job_id: jobId,
        p_lease_owner: lease.owner,
        p_lease_generation: lease.generation,
        p_transcript_json: transcriptJson,
        p_provider_request_id: providerRequestId,
        p_provider_metadata: providerMetadata
    });
    if (error) throw error;
    return Boolean(data);
}

export async function recordTranscriptionFailure(jobId, lease, errorCode) {
    const { data, error } = await getServiceSupabase().rpc('record_video_transcription_failure', {
        p_job_id: jobId,
        p_lease_owner: lease.owner,
        p_lease_generation: lease.generation,
        p_error_code: errorCode
    });
    if (error) throw error;
    return Boolean(data);
}

// Puts a job whose lease has expired back in the queue. Returns false if the lease is still live.
export async function recoverStaleTranscriptionJob(jobId) {
    const { data, error } = await getServiceSupabase().rpc('recover_stale_video_transcription_job', {
        p_job_id: jobId,
        p_recovery_threshold_seconds: 0
    });
    if (error) throw error;
    return Boolean(data);
}

export async function isTranscriptionJobCancelled(jobId) {
    const { data, error } = await getServiceSupabase()
        .from('video_transcription_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();
    if (error) throw error;
    return !data || data.status === 'cancelled';
}

export async function setTranscriptionWorkflowRun(jobId, runId) {
    const { error } = await getServiceSupabase()
        .from('video_transcription_jobs')
        .update({ workflow_run_id: runId, updated_at: new Date().toISOString() })
        .eq('id', jobId);
    if (error) throw error;
}

export async function setSourceAudioPath(sourceAssetId, audioStoragePath) {
    const { error } = await getServiceSupabase()
        .from('video_source_assets')
        .update({ audio_storage_path: audioStoragePath, updated_at: new Date().toISOString() })
        .eq('id', sourceAssetId);
    if (error) throw error;
}

// The original video is stored either as a full public URL or as a path inside the guides bucket.
// Only URLs on this project's Supabase origin are accepted.
export async function resolveSourceDownloadUrl(asset) {
    const path = String(asset?.original_storage_path || '').trim();
    if (!path) return null;

    if (/^https?:\/\//i.test(path)) {
        const allowedOrigin = new URL(serverSupabaseUrl()).origin;
        if (new URL(path).origin !== allowedOrigin) {
            const error = new Error('The source video location is not trusted.');
            error.code = 'SOURCE_NOT_TRUSTED';
            throw error;
        }
        return path;
    }

    const { data, error } = await getServiceSupabase()
        .storage
        .from(SOURCE_BUCKET)
        .createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) {
        const failure = new Error('A source download URL could not be created.');
        failure.code = 'SOURCE_URL_FAILED';
        throw failure;
    }
    return data.signedUrl;
}

export async function uploadSpeechAudio(storagePath, buffer) {
    const { error } = await getServiceSupabase()
        .storage
        .from(SOURCE_BUCKET)
        .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true });
    if (error) throw error;
    return storagePath;
}

export async function downloadSpeechAudio(storagePath) {
    const { data, error } = await getServiceSupabase()
        .storage
        .from(SOURCE_BUCKET)
        .download(storagePath);
    if (error || !data) throw error || new Error('The speech audio could not be downloaded.');
    return Buffer.from(await data.arrayBuffer());
}
