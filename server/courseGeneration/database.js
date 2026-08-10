import { createClient } from '@supabase/supabase-js';

let serviceClient;

function serverSupabaseUrl() {
    const value = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!value) throw new Error('Missing required server configuration: VITE_SUPABASE_URL');
    return value;
}

export function getServiceSupabase() {
    if (!serviceClient) {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceKey) throw new Error('Missing required server configuration: SUPABASE_SERVICE_ROLE_KEY');
        serviceClient = createClient(serverSupabaseUrl(), serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return serviceClient;
}

export function createUserSupabase(accessToken) {
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!anonKey) throw new Error('Missing required server configuration: VITE_SUPABASE_ANON_KEY');
    return createClient(serverSupabaseUrl(), anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
            headers: { Authorization: `Bearer ${accessToken}` }
        }
    });
}

export async function getGenerationJob(jobId) {
    const { data, error } = await getServiceSupabase()
        .from('course_generation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
    if (error) throw error;
    return data;
}

export async function updateGenerationJob(jobId, updates) {
    const { data, error } = await getServiceSupabase()
        .from('course_generation_jobs')
        .update({
            ...updates,
            last_heartbeat_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function claimGenerationJob(jobId) {
    const { data, error } = await getServiceSupabase().rpc('claim_background_course_generation', {
        p_job_id: jobId
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
}

export async function markGenerationFailed(jobId, error) {
    const message = String(error?.message || error || 'Course generation failed').slice(0, 2000);
    return updateGenerationJob(jobId, {
        status: 'failed',
        stage: 'failed',
        stage_message: 'Course generation needs attention',
        error_code: String(error?.code || error?.status || 'GENERATION_FAILED').slice(0, 120),
        error_message: message,
        finished_at: new Date().toISOString()
    });
}

export async function markGenerationCancelled(jobId) {
    return updateGenerationJob(jobId, {
        status: 'cancelled',
        stage: 'cancelled',
        stage_message: 'Course generation cancelled',
        finished_at: new Date().toISOString()
    });
}

export async function listSourceDocuments(jobId) {
    const { data, error } = await getServiceSupabase()
        .from('course_source_documents')
        .select('*')
        .eq('generation_job_id', jobId)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function updateSourceDocument(documentId, updates) {
    const { data, error } = await getServiceSupabase()
        .from('course_source_documents')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', documentId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function replaceSourceChunks(documentId, rows) {
    const client = getServiceSupabase();
    const { error: deleteError } = await client
        .from('course_source_chunks')
        .delete()
        .eq('document_id', documentId);
    if (deleteError) throw deleteError;

    for (let start = 0; start < rows.length; start += 50) {
        const { error } = await client
            .from('course_source_chunks')
            .insert(rows.slice(start, start + 50));
        if (error) throw error;
    }
}

export async function downloadSourceDocument(storagePath) {
    const { data, error } = await getServiceSupabase()
        .storage
        .from('course_sources')
        .download(storagePath);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
}

export async function getSourceOverview(jobId) {
    const documents = await listSourceDocuments(jobId);
    return documents
        .filter(document => document.status === 'ready')
        .map(document => {
            const topics = Array.isArray(document.key_topics) ? document.key_topics.join(', ') : '';
            return `[Source document: ${document.original_name}]
Pages: ${document.page_count || 'unknown'}
Summary: ${document.summary || 'No summary available'}
Key topics: ${topics || 'Not specified'}`;
        })
        .join('\n\n');
}

export async function retrieveSourceContext(job, query, limit = 6) {
    const { createEmbeddings } = await import('./providers.js');
    const [queryEmbedding] = await createEmbeddings([query]);
    const match = async threshold => getServiceSupabase().rpc('match_course_source_chunks_for_worker', {
        query_embedding: queryEmbedding,
        p_generation_job_id: job.id,
        p_account_id: job.account_id,
        match_threshold: threshold,
        match_count: limit
    });

    let { data, error } = await match(0.18);
    if (error) throw error;
    if (!data?.length) {
        const fallback = await match(-1);
        if (fallback.error) throw fallback.error;
        data = fallback.data;
    }

    return (data || []).map(item => {
        let pageReference = '';
        if (item.page_start) {
            pageReference = item.page_end && item.page_end !== item.page_start
                ? `, pages ${item.page_start} to ${item.page_end}`
                : `, page ${item.page_start}`;
        }
        return `[Source: ${item.document_name}${pageReference}]\n${item.content}`;
    }).join('\n\n');
}

export async function searchCompanyContext(queryText, limit = 8) {
    const { createEmbeddings } = await import('./providers.js');
    try {
        const [queryEmbedding] = await createEmbeddings([queryText]);
        const { data, error } = await getServiceSupabase().rpc('match_guide_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.25,
            match_count: limit
        });
        if (error) throw error;
        return (data || [])
            .map(chunk => `[From Company Guide: ${chunk.document_title}]\n${chunk.content}`)
            .join('\n\n');
    } catch (error) {
        console.warn('Company knowledge search failed.', error);
        return '';
    }
}

export async function createLessonCheckpoints(job, outline) {
    const rows = [];
    outline.modules.forEach((module, moduleIndex) => {
        module.lessons.forEach((lesson, lessonIndex) => {
            rows.push({
                account_id: job.account_id,
                generation_job_id: job.id,
                module_index: moduleIndex,
                lesson_index: lessonIndex,
                module_title: module.title,
                title: lesson.title,
                concept: lesson.concept,
                target_activity: lesson.targetActivity,
                status: 'pending'
            });
        });
    });

    const { error } = await getServiceSupabase()
        .from('course_generation_lessons')
        .upsert(rows, {
            onConflict: 'generation_job_id,module_index,lesson_index',
            ignoreDuplicates: true
        });
    if (error) throw error;
    return listLessonCheckpoints(job.id);
}

export async function listLessonCheckpoints(jobId) {
    const { data, error } = await getServiceSupabase()
        .from('course_generation_lessons')
        .select('*')
        .eq('generation_job_id', jobId)
        .order('module_index', { ascending: true })
        .order('lesson_index', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function getLessonCheckpoint(lessonId) {
    const { data, error } = await getServiceSupabase()
        .from('course_generation_lessons')
        .select('*')
        .eq('id', lessonId)
        .single();
    if (error) throw error;
    return data;
}

export async function updateLessonCheckpoint(lessonId, updates) {
    const { data, error } = await getServiceSupabase()
        .from('course_generation_lessons')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', lessonId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function refreshGenerationProgress(jobId) {
    const [job, documents, lessons] = await Promise.all([
        getGenerationJob(jobId),
        listSourceDocuments(jobId),
        listLessonCheckpoints(jobId)
    ]);

    const totalUnits = documents.length + 1 + lessons.length * 12 + 1 + 1;
    const completedDocumentUnits = documents.filter(document => document.status === 'ready').length;
    const outlineUnits = job.outline_json ? 1 : 0;
    const thumbnailUnits = job.thumbnail_status === 'completed' || job.thumbnail_status === 'failed' ? 1 : 0;
    const lessonUnits = lessons.reduce((total, lesson) => {
        const contentUnit = lesson.content_json ? 1 : 0;
        const presentationUnit = lesson.gamma_pdf_url ? 1 : 0;
        const audioUnits = (Array.isArray(lesson.audio_tracks) ? lesson.audio_tracks : [])
            .filter(track => track?.url)
            .length;
        return total + contentUnit + presentationUnit + audioUnits;
    }, 0);
    const finalUnit = job.course_id ? 1 : 0;

    return updateGenerationJob(jobId, {
        total_units: totalUnits,
        completed_units: Math.min(
            totalUnits,
            completedDocumentUnits + outlineUnits + thumbnailUnits + lessonUnits + finalUnit
        )
    });
}

export async function storageObjectExists(bucket, path) {
    const lastSlash = path.lastIndexOf('/');
    const folder = lastSlash >= 0 ? path.slice(0, lastSlash) : '';
    const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
    const { data, error } = await getServiceSupabase().storage.from(bucket).list(folder, {
        search: name,
        limit: 10
    });
    if (error) throw error;
    return (data || []).some(item => item.name === name);
}

export async function getCourseAssetUrlIfExists(path) {
    const exists = await storageObjectExists('course_assets', path);
    if (!exists) return null;
    return getServiceSupabase().storage.from('course_assets').getPublicUrl(path).data.publicUrl;
}

export async function uploadCourseAsset(path, buffer, contentType) {
    const bucket = getServiceSupabase().storage.from('course_assets');
    const exists = await storageObjectExists('course_assets', path);
    if (!exists) {
        const { error } = await bucket.upload(path, buffer, {
            contentType,
            upsert: false
        });
        if (error && !/already exists|duplicate/i.test(error.message || '')) throw error;
    }
    return bucket.getPublicUrl(path).data.publicUrl;
}

function getBillingPeriodStart(subscriptionStartDate, renewalPeriodMonths) {
    if (!subscriptionStartDate || !renewalPeriodMonths) return null;
    const start = new Date(subscriptionStartDate);
    const now = new Date();
    if (now < start) return new Date(0);
    let monthsDifference = (now.getFullYear() - start.getFullYear()) * 12
        + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) monthsDifference -= 1;
    const periodsPassed = Math.floor(monthsDifference / renewalPeriodMonths);
    const currentPeriodStart = new Date(start);
    currentPeriodStart.setMonth(start.getMonth() + periodsPassed * renewalPeriodMonths);
    return currentPeriodStart;
}

export async function assertCourseAllowance() {
    const client = getServiceSupabase();
    const { data: settings, error: settingsError } = await client
        .from('platform_settings')
        .select('max_courses_per_period, subscription_start_date, renewal_period_months')
        .eq('id', 1)
        .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings || settings.max_courses_per_period <= 0) return;

    const periodStart = getBillingPeriodStart(
        settings.subscription_start_date,
        settings.renewal_period_months
    );
    if (!periodStart) return;

    const { data: courses, error } = await client
        .from('courses')
        .select('content_json')
        .gte('created_at', periodStart.toISOString())
        .neq('status', 'archived');
    if (error) throw error;

    const courseCount = (courses || []).filter(course => {
        let content = course.content_json;
        if (typeof content === 'string') {
            try {
                content = JSON.parse(content);
            } catch {
                content = null;
            }
        }
        return content?.is_system_simulation !== true && content?.type !== 'video_walkthrough';
    }).length;

    if (courseCount >= settings.max_courses_per_period) {
        const error = new Error('The course allowance for the current billing period has been reached.');
        error.code = 'COURSE_LIMIT_REACHED';
        throw error;
    }
}

export async function finaliseCourse(job, outline, modules) {
    const { data, error } = await getServiceSupabase().rpc('finalise_background_course_generation', {
        p_job_id: job.id,
        p_title: outline.title,
        p_description: outline.description,
        p_content_json: modules,
        p_thumbnail_url: job.thumbnail_url || null,
        p_allow_pretest: Boolean(job.request_json?.allow_pretest)
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
}
