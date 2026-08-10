import { sleep } from 'workflow';
import {
    assertCourseAllowance,
    claimGenerationJob,
    createLessonCheckpoints,
    finaliseCourse,
    getCourseAssetUrlIfExists,
    getGenerationJob,
    getLessonCheckpoint,
    getSourceOverview,
    listLessonCheckpoints,
    listSourceDocuments,
    markGenerationCancelled,
    markGenerationFailed,
    refreshGenerationProgress,
    retrieveSourceContext,
    searchCompanyContext,
    updateGenerationJob,
    updateLessonCheckpoint,
    uploadCourseAsset
} from '../courseGeneration/database.js';
import {
    createOpenRouterCompletion,
    downloadGammaPdf,
    generateNarrationAudio,
    generateThumbnailAsset,
    getGammaExport,
    getGammaGeneration,
    startGammaExport,
    startGammaPresentation
} from '../courseGeneration/providers.js';
import { processSourceDocument } from '../courseGeneration/sourceProcessing.js';
import {
    buildCourseRequestText,
    buildLessonPayload,
    buildOutlinePayload,
    composeLessonMarkdown,
    normaliseCourseOutline,
    normaliseLessonContent
} from '../../src/courseGeneration/courseGenerationPrompts.js';

const GAMMA_POLL_LIMIT = 90;
const GAMMA_POLL_INTERVAL = '5s';

async function claimJobStep(jobId) {
    'use step';
    return claimGenerationJob(jobId);
}

async function ensureJobActiveStep(jobId) {
    'use step';
    const job = await getGenerationJob(jobId);
    if (job.cancel_requested_at || job.status === 'cancelled') {
        if (job.status !== 'cancelled') await markGenerationCancelled(jobId);
        return false;
    }
    return true;
}

async function assertCourseAllowanceStep() {
    'use step';
    await assertCourseAllowance();
}

async function listSourceDocumentsStep(jobId) {
    'use step';
    return listSourceDocuments(jobId);
}

async function processSourceDocumentStep(jobId, document, position, total) {
    'use step';
    await updateGenerationJob(jobId, {
        stage: 'processing_sources',
        stage_message: `Reading source ${position} of ${total}: ${document.original_name}`
    });
    const processed = await processSourceDocument(document);
    await refreshGenerationProgress(jobId);
    return processed;
}

async function generateOutlineStep(jobId) {
    'use step';
    const job = await getGenerationJob(jobId);
    if (job.outline_json) return job.outline_json;

    await updateGenerationJob(jobId, {
        stage: 'drafting_outline',
        stage_message: 'Designing the course structure'
    });

    const topic = buildCourseRequestText({
        title: job.title,
        objective: job.objective,
        audience: job.request_json?.audience,
        topics: job.request_json?.topics,
        scenarios: job.request_json?.scenarios
    });
    const [sourceOverview, companyContext] = await Promise.all([
        getSourceOverview(jobId),
        searchCompanyContext(topic, 8)
    ]);
    const referenceContext = [
        sourceOverview ? `COURSE SOURCE DOCUMENT SUMMARIES:\n${sourceOverview}` : '',
        companyContext ? `RELEVANT INTERNAL COMPANY POLICIES:\n${companyContext}` : ''
    ].filter(Boolean).join('\n\n');

    const completion = await createOpenRouterCompletion(buildOutlinePayload(topic, referenceContext));
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) throw new Error('The course outline service returned no content.');
    const outline = normaliseCourseOutline(JSON.parse(raw));
    await updateGenerationJob(jobId, {
        outline_json: outline,
        stage: 'preparing_lessons',
        stage_message: `Course outline ready with ${outline.modules.reduce((total, module) => total + module.lessons.length, 0)} lessons`
    });
    await createLessonCheckpoints(job, outline);
    await refreshGenerationProgress(jobId);
    return outline;
}

async function generateThumbnailStep(jobId) {
    'use step';
    const job = await getGenerationJob(jobId);
    if (job.thumbnail_status === 'completed' || job.thumbnail_status === 'failed') return job.thumbnail_url;

    await updateGenerationJob(jobId, {
        stage: 'generating_thumbnail',
        stage_message: 'Creating the course thumbnail'
    });
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const thumbnailUrl = await generateThumbnailAsset(
                job.outline_json?.thumbnail_query || job.outline_json?.title || job.title
            );
            await updateGenerationJob(jobId, {
                thumbnail_url: thumbnailUrl,
                thumbnail_status: 'completed'
            });
            await refreshGenerationProgress(jobId);
            return thumbnailUrl;
        } catch (error) {
            lastError = error;
            if (attempt < 3) {
                await updateGenerationJob(jobId, {
                    stage_message: `Creating the course thumbnail, attempt ${attempt + 1} of 3`
                });
            }
        }
    }

    console.warn('Course thumbnail generation failed after three attempts.', lastError);
    await updateGenerationJob(jobId, {
        thumbnail_status: 'failed',
        warning_count: Number(job.warning_count || 0) + 1
    });
    await refreshGenerationProgress(jobId);
    return null;
}

async function listLessonsStep(jobId) {
    'use step';
    return listLessonCheckpoints(jobId);
}

async function generateLessonContentStep(jobId, lessonId, ordinal, totalLessons) {
    'use step';
    const [job, lesson] = await Promise.all([
        getGenerationJob(jobId),
        getLessonCheckpoint(lessonId)
    ]);
    if (lesson.content_json) return lesson;

    await updateGenerationJob(jobId, {
        stage: 'generating_lesson',
        stage_message: `Writing lesson ${ordinal} of ${totalLessons}: ${lesson.title}`
    });
    await updateLessonCheckpoint(lessonId, {
        status: 'writing',
        attempt_count: Number(lesson.attempt_count || 0) + 1,
        error_code: null,
        error_message: null
    });

    const outline = job.outline_json;
    const module = outline.modules[lesson.module_index];
    const outlineLesson = module.lessons[lesson.lesson_index];
    const topic = buildCourseRequestText({
        title: job.title,
        objective: job.objective,
        audience: job.request_json?.audience,
        topics: job.request_json?.topics,
        scenarios: job.request_json?.scenarios
    });
    const query = `${topic}\nCourse: ${outline.title}\nModule: ${module.title}\nLesson: ${outlineLesson.title}\nConcept: ${outlineLesson.concept}`;
    const documents = await listSourceDocuments(jobId);
    const [sourceContext, companyContext] = await Promise.all([
        documents.length > 0 ? retrieveSourceContext(job, query, 6) : '',
        searchCompanyContext(query, 5)
    ]);
    const referenceContext = [sourceContext, companyContext].filter(Boolean).join('\n\n');

    const completion = await createOpenRouterCompletion(buildLessonPayload({
        topic,
        outline,
        module,
        lesson: outlineLesson,
        referenceContext
    }));
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) throw new Error(`No lesson content was returned for ${lesson.title}.`);
    const content = normaliseLessonContent(JSON.parse(raw), lesson.target_activity);
    const finalContent = composeLessonMarkdown(content);
    const updated = await updateLessonCheckpoint(lessonId, {
        status: 'assets',
        content_json: {
            presentation_input: content.presentation_input,
            markdown_content: content.markdown_content,
            final_content: finalContent,
            quiz: content.quiz,
            ai_component: content.ai_component
        },
        audio_tracks: content.audio_tracks
    });
    await refreshGenerationProgress(jobId);
    return updated;
}

async function startGammaStep(jobId, lessonId, ordinal, totalLessons) {
    'use step';
    const lesson = await getLessonCheckpoint(lessonId);
    if (lesson.gamma_generation_id || lesson.gamma_id) return lesson;
    await updateGenerationJob(jobId, {
        stage: 'generating_presentation',
        stage_message: `Creating presentation ${ordinal} of ${totalLessons}: ${lesson.title}`
    });
    const response = await startGammaPresentation(
        lesson.title,
        lesson.content_json?.presentation_input
    );
    const generationId = response.generationId || response.id;
    if (!generationId) throw new Error('Gamma did not return a generation identifier.');
    return updateLessonCheckpoint(lessonId, { gamma_generation_id: generationId });
}

async function pollGammaStep(lessonId) {
    'use step';
    const lesson = await getLessonCheckpoint(lessonId);
    if (lesson.gamma_id) return { state: 'completed', lesson };
    const response = await getGammaGeneration(lesson.gamma_generation_id);
    const status = String(response.status || '').toLowerCase();
    if (['completed', 'success'].includes(status)) {
        const gammaUrl = response.gammaUrl || response.url || null;
        const gammaId = response.gammaId || gammaUrl?.split('/').filter(Boolean).pop();
        if (!gammaId) throw new Error('Gamma completed without returning a presentation identifier.');
        const updated = await updateLessonCheckpoint(lessonId, {
            gamma_id: gammaId,
            gamma_url: gammaUrl
        });
        return { state: 'completed', lesson: updated };
    }
    if (status === 'failed') throw new Error(`Gamma presentation failed for ${lesson.title}.`);
    return { state: 'pending' };
}

async function startGammaExportStep(lessonId) {
    'use step';
    const lesson = await getLessonCheckpoint(lessonId);
    if (lesson.gamma_export_id || lesson.gamma_pdf_url) return lesson;
    const response = await startGammaExport(lesson.gamma_id);
    const exportId = response.exportId || response.id;
    if (!exportId) throw new Error('Gamma did not return an export identifier.');
    return updateLessonCheckpoint(lessonId, { gamma_export_id: exportId });
}

async function pollGammaExportStep(lessonId) {
    'use step';
    const lesson = await getLessonCheckpoint(lessonId);
    if (lesson.gamma_pdf_url) return { state: 'completed', lesson };
    const response = await getGammaExport(lesson.gamma_export_id);
    const status = String(response.status || '').toLowerCase();
    if (['completed', 'success'].includes(status)) {
        const downloadUrl = response.exportUrl || response.url || response.downloadUrl;
        if (!downloadUrl) throw new Error('Gamma completed the export without returning a download address.');
        return { state: 'completed', downloadUrl };
    }
    if (status === 'failed') throw new Error(`Gamma PDF export failed for ${lesson.title}.`);
    return { state: 'pending' };
}

async function saveGammaPdfStep(jobId, lessonId, downloadUrl) {
    'use step';
    const lesson = await getLessonCheckpoint(lessonId);
    if (lesson.gamma_pdf_url) return lesson;
    const path = `slides/${jobId}/${lesson.module_index}_${lesson.lesson_index}.pdf`;
    let publicUrl = await getCourseAssetUrlIfExists(path);
    if (!publicUrl) {
        publicUrl = await uploadCourseAsset(
            path,
            await downloadGammaPdf(downloadUrl),
            'application/pdf'
        );
    }
    const updated = await updateLessonCheckpoint(lessonId, { gamma_pdf_url: publicUrl });
    await refreshGenerationProgress(jobId);
    return updated;
}

async function generateAudioTrackStep(jobId, lessonId, trackIndex, ordinal, totalLessons) {
    'use step';
    const lesson = await getLessonCheckpoint(lessonId);
    const tracks = Array.isArray(lesson.audio_tracks) ? [...lesson.audio_tracks] : [];
    const track = tracks[trackIndex];
    if (!track) throw new Error(`Narration track ${trackIndex + 1} is missing for ${lesson.title}.`);
    if (track.url) return lesson;

    await updateGenerationJob(jobId, {
        stage: 'generating_audio',
        stage_message: `Narrating lesson ${ordinal} of ${totalLessons}, track ${trackIndex + 1} of ${tracks.length}`
    });
    const path = `audio/${jobId}/${lesson.module_index}_${lesson.lesson_index}/track_${trackIndex}.mp3`;
    let publicUrl = await getCourseAssetUrlIfExists(path);
    if (!publicUrl) {
        publicUrl = await uploadCourseAsset(
            path,
            await generateNarrationAudio(track.script),
            'audio/mpeg'
        );
    }
    tracks[trackIndex] = { ...track, url: publicUrl };
    const updated = await updateLessonCheckpoint(lessonId, { audio_tracks: tracks });
    await refreshGenerationProgress(jobId);
    return updated;
}

async function completeLessonStep(jobId, lessonId) {
    'use step';
    const lesson = await getLessonCheckpoint(lessonId);
    const tracks = Array.isArray(lesson.audio_tracks) ? lesson.audio_tracks : [];
    if (!lesson.content_json || !lesson.gamma_pdf_url || tracks.length !== 10 || tracks.some(track => !track?.url)) {
        throw new Error(`Lesson assets are incomplete for ${lesson.title}.`);
    }
    return updateLessonCheckpoint(lessonId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_code: null,
        error_message: null
    });
}

async function finaliseCourseStep(jobId) {
    'use step';
    const [job, lessons] = await Promise.all([
        getGenerationJob(jobId),
        listLessonCheckpoints(jobId)
    ]);
    if (job.course_id) return job.course_id;

    await updateGenerationJob(jobId, {
        stage: 'finalising',
        stage_message: 'Saving the completed course draft'
    });
    const modules = job.outline_json.modules.map((module, moduleIndex) => ({
        title: module.title,
        lessons: module.lessons.map((outlineLesson, lessonIndex) => {
            const lesson = lessons.find(item => (
                item.module_index === moduleIndex && item.lesson_index === lessonIndex
            ));
            if (!lesson || lesson.status !== 'completed') {
                throw new Error(`The lesson ${outlineLesson.title} is not complete.`);
            }
            const tracks = Array.isArray(lesson.audio_tracks) ? lesson.audio_tracks : [];
            return {
                title: outlineLesson.title,
                concept: outlineLesson.concept,
                content: lesson.content_json.final_content,
                quiz: lesson.content_json.quiz,
                gamma_url: lesson.gamma_url,
                gamma_id: lesson.gamma_id,
                gamma_pdf_url: lesson.gamma_pdf_url,
                audio_tracks: tracks,
                audio_url: tracks[0]?.url || null,
                presentation_input: lesson.content_json.presentation_input,
                ai_component: lesson.content_json.ai_component
            };
        })
    }));
    const course = await finaliseCourse(job, job.outline_json, modules);
    await refreshGenerationProgress(jobId);
    return course.id;
}

async function failJobStep(jobId, errorMessage) {
    'use step';
    await markGenerationFailed(jobId, new Error(errorMessage));
}

export async function generateCourseInBackground(jobId) {
    'use workflow';

    try {
        let claimedJob = await claimJobStep(jobId);
        while (claimedJob.status === 'queued') {
            await sleep('15s');
            claimedJob = await claimJobStep(jobId);
        }
        if (claimedJob.status === 'cancelled') return { status: 'cancelled' };

        await assertCourseAllowanceStep();
        const sourceDocuments = await listSourceDocumentsStep(jobId);
        for (let index = 0; index < sourceDocuments.length; index += 1) {
            if (!await ensureJobActiveStep(jobId)) return { status: 'cancelled' };
            if (sourceDocuments[index].status !== 'ready') {
                await processSourceDocumentStep(
                    jobId,
                    sourceDocuments[index],
                    index + 1,
                    sourceDocuments.length
                );
            }
        }

        if (!await ensureJobActiveStep(jobId)) return { status: 'cancelled' };
        await generateOutlineStep(jobId);
        if (!await ensureJobActiveStep(jobId)) return { status: 'cancelled' };
        await generateThumbnailStep(jobId);

        const lessons = await listLessonsStep(jobId);
        for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
            const ordinal = lessonIndex + 1;
            const lessonId = lessons[lessonIndex].id;
            if (!await ensureJobActiveStep(jobId)) return { status: 'cancelled' };
            await generateLessonContentStep(jobId, lessonId, ordinal, lessons.length);

            if (!await ensureJobActiveStep(jobId)) return { status: 'cancelled' };
            await startGammaStep(jobId, lessonId, ordinal, lessons.length);
            let generationResult = { state: 'pending' };
            for (let attempt = 0; attempt < GAMMA_POLL_LIMIT && generationResult.state === 'pending'; attempt += 1) {
                await sleep(GAMMA_POLL_INTERVAL);
                if (!await ensureJobActiveStep(jobId)) return { status: 'cancelled' };
                generationResult = await pollGammaStep(lessonId);
            }
            if (generationResult.state !== 'completed') throw new Error('Gamma presentation generation timed out.');

            await startGammaExportStep(lessonId);
            let exportResult = { state: 'pending' };
            for (let attempt = 0; attempt < GAMMA_POLL_LIMIT && exportResult.state === 'pending'; attempt += 1) {
                await sleep(GAMMA_POLL_INTERVAL);
                if (!await ensureJobActiveStep(jobId)) return { status: 'cancelled' };
                exportResult = await pollGammaExportStep(lessonId);
            }
            if (exportResult.state !== 'completed') throw new Error('Gamma PDF export timed out.');
            await saveGammaPdfStep(jobId, lessonId, exportResult.downloadUrl);

            const currentLesson = await generateLessonContentStep(jobId, lessonId, ordinal, lessons.length);
            const trackCount = Array.isArray(currentLesson.audio_tracks) ? currentLesson.audio_tracks.length : 0;
            for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
                if (!await ensureJobActiveStep(jobId)) return { status: 'cancelled' };
                await generateAudioTrackStep(jobId, lessonId, trackIndex, ordinal, lessons.length);
            }
            await completeLessonStep(jobId, lessonId);
        }

        if (!await ensureJobActiveStep(jobId)) return { status: 'cancelled' };
        const courseId = await finaliseCourseStep(jobId);
        return { status: 'completed', courseId };
    } catch (error) {
        await failJobStep(jobId, String(error?.message || error));
        return { status: 'failed', error: String(error?.message || error) };
    }
}
