import { supabase } from './supabase.js';

const VISIBLE_STATUSES = ['uploading', 'queued', 'running', 'processing', 'completed', 'failed', 'cancelled'];

async function authenticatedCourseGenerationRequest(path, jobId) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('Your session has expired. Please sign in again.');

    const response = await fetch(path, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jobId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.statusMessage || payload?.message || 'The course generation action could not be completed.');
    }
    return payload;
}

export async function createBackgroundCourseGenerationJob({
    title,
    objective,
    audience,
    topics,
    scenarios,
    allowPretest
}) {
    const { data, error } = await supabase.rpc('create_background_course_generation_job', {
        p_title: title,
        p_objective: objective || null,
        p_request_json: {
            audience: audience || null,
            topics: topics || null,
            scenarios: scenarios || null,
            allow_pretest: Boolean(allowPretest)
        }
    });
    if (error) throw error;
    const job = Array.isArray(data) ? data[0] : data;
    if (!job) throw new Error('No course generation job was returned.');
    return job;
}

export async function startBackgroundCourseGeneration(jobId) {
    return authenticatedCourseGenerationRequest('/api/course-generation/start', jobId);
}

export async function removeQueuedCourseGenerationJob(jobId) {
    return authenticatedCourseGenerationRequest('/api/course-generation/remove', jobId);
}

export async function listCourseGenerationJobs(userId, limit = 10) {
    const { data, error } = await supabase
        .from('course_generation_jobs')
        .select('*')
        .eq('created_by', userId)
        .in('status', VISIBLE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

export async function requestCourseGenerationCancellation(jobId) {
    const { data, error } = await supabase.rpc('request_course_generation_cancel', {
        p_job_id: jobId
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
}

export function subscribeToCourseGenerationJobs(userId, onChange) {
    const channel = supabase
        .channel(`course-generation-jobs:${userId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'course_generation_jobs',
                filter: `created_by=eq.${userId}`
            },
            payload => onChange(payload)
        )
        .subscribe();

    return () => supabase.removeChannel(channel);
}
