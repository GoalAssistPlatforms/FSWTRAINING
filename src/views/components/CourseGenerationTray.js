import {
    listCourseGenerationJobs,
    requestCourseGenerationCancellation,
    startBackgroundCourseGeneration,
    subscribeToCourseGenerationJobs
} from '../../api/courseGenerationJobs.js';
import { fswAlert } from '../../utils/dialog.js';

const ACTIVE_STATUSES = new Set(['uploading', 'queued', 'running', 'processing']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const TERMINAL_VISIBLE_FOR_MS = 48 * 60 * 60 * 1000;

function escapeHTML(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getDismissedJobs(userId) {
    try {
        return new Set(JSON.parse(localStorage.getItem(`fswGenerationDismissed:${userId}`) || '[]'));
    } catch {
        return new Set();
    }
}

function saveDismissedJobs(userId, values) {
    localStorage.setItem(`fswGenerationDismissed:${userId}`, JSON.stringify([...values].slice(-30)));
}

function jobProgress(job) {
    if (job.status === 'completed') return 100;
    const total = Number(job.total_units || 0);
    const completed = Number(job.completed_units || 0);
    if (total > 0) return Math.max(1, Math.min(99, Math.round((completed / total) * 100)));
    if (job.status === 'uploading') return 2;
    if (job.status === 'queued') return 4;
    return 6;
}

function statusLabel(job) {
    if (job.cancel_requested_at && ACTIVE_STATUSES.has(job.status)) return 'Cancelling';
    return {
        uploading: 'Uploading sources',
        queued: 'Queued',
        running: 'Generating',
        processing: 'Generating',
        completed: 'Draft ready',
        failed: 'Needs attention',
        cancelled: 'Cancelled'
    }[job.status] || 'Preparing';
}

function renderJob(job) {
    const progress = jobProgress(job);
    const active = ACTIVE_STATUSES.has(job.status);
    const statusClass = TERMINAL_STATUSES.has(job.status) ? job.status : 'active';
    const queued = job.status === 'queued';
    const canCancel = active && (queued || !job.cancel_requested_at);
    const message = job.error_message && job.status === 'failed'
        ? job.error_message
        : job.stage_message || statusLabel(job);

    return `
        <article class="course-generation-job" data-job-id="${job.id}">
            <div class="course-generation-job-heading">
                <div class="course-generation-job-title-wrap">
                    <span class="course-generation-status-dot ${statusClass}" aria-hidden="true"></span>
                    <div>
                        <strong>${escapeHTML(job.title || 'New course')}</strong>
                        <div class="course-generation-status-text">${escapeHTML(statusLabel(job))}${active ? ` · ${progress}%` : ''}</div>
                    </div>
                </div>
                ${active ? `<span class="course-generation-percent">${progress}%</span>` : ''}
            </div>
            ${active ? `
                <div class="course-generation-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
                    <span style="width: ${progress}%"></span>
                </div>
            ` : ''}
            <p class="course-generation-message">${escapeHTML(message)}</p>
            <div class="course-generation-actions">
                ${canCancel ? `<button type="button" data-generation-action="${queued ? 'remove' : 'cancel'}" data-job-id="${job.id}">${queued ? 'Remove from queue' : 'Cancel'}</button>` : ''}
                ${job.status === 'failed' ? `<button type="button" class="primary" data-generation-action="retry" data-job-id="${job.id}">Try again</button>` : ''}
                ${job.status === 'completed' ? `<button type="button" class="primary" data-generation-action="review" data-job-id="${job.id}">Review draft</button>` : ''}
                ${TERMINAL_STATUSES.has(job.status) ? `<button type="button" data-generation-action="dismiss" data-job-id="${job.id}">Dismiss</button>` : ''}
            </div>
        </article>
    `;
}

export function renderCourseGenerationTray() {
    return '<div id="course-generation-tray" class="course-generation-tray" hidden></div>';
}

export async function initCourseGenerationTray(user) {
    const root = document.getElementById('course-generation-tray');
    if (!root || !user?.id || !['manager', 'admin'].includes(user.role)) return () => {};

    const state = {
        jobs: [],
        expanded: false,
        dismissed: getDismissedJobs(user.id),
        busyJobId: null
    };

    const visibleJobs = () => state.jobs.filter(job => {
        if (ACTIVE_STATUSES.has(job.status)) return true;
        if (!TERMINAL_STATUSES.has(job.status) || state.dismissed.has(job.id)) return false;
        const timestamp = new Date(job.finished_at || job.updated_at || job.created_at).getTime();
        return Number.isFinite(timestamp) && Date.now() - timestamp < TERMINAL_VISIBLE_FOR_MS;
    });

    const render = () => {
        const jobs = visibleJobs();
        if (jobs.length === 0) {
            root.hidden = true;
            root.innerHTML = '';
            return;
        }

        root.hidden = false;
        const activeJobs = jobs.filter(job => ACTIVE_STATUSES.has(job.status));
        const leadJob = activeJobs[0] || jobs[0];
        const summary = activeJobs.length > 1
            ? `${activeJobs.length} courses generating`
            : activeJobs.length === 1
                ? `${leadJob.title} · ${jobProgress(leadJob)}%`
                : statusLabel(leadJob);

        root.innerHTML = `
            <button type="button" class="course-generation-pill" data-generation-action="toggle" aria-expanded="${state.expanded}">
                <span class="course-generation-pill-icon ${activeJobs.length ? 'spinning' : leadJob.status}" aria-hidden="true">
                    ${activeJobs.length ? '◌' : leadJob.status === 'completed' ? '✓' : leadJob.status === 'failed' ? '!' : '×'}
                </span>
                <span class="course-generation-pill-copy">
                    <strong>${activeJobs.length ? 'Course generation' : escapeHTML(statusLabel(leadJob))}</strong>
                    <small>${escapeHTML(summary)}</small>
                </span>
                <span class="course-generation-chevron" aria-hidden="true">${state.expanded ? '⌄' : '⌃'}</span>
            </button>
            ${state.expanded ? `
                <section class="course-generation-drawer" aria-label="Course generation progress">
                    <div class="course-generation-drawer-header">
                        <div>
                            <strong>Course generation</strong>
                            <span>You can keep using the platform</span>
                        </div>
                        <button type="button" data-generation-action="toggle" aria-label="Minimise course generation">×</button>
                    </div>
                    <div class="course-generation-job-list">${jobs.map(renderJob).join('')}</div>
                </section>
            ` : ''}
        `;
    };

    const refresh = async () => {
        try {
            state.jobs = await listCourseGenerationJobs(user.id);
            render();
        } catch (error) {
            console.error('Failed to load course generation jobs:', error);
        }
    };

    const updateFromRealtime = payload => {
        const incoming = payload?.new;
        if (!incoming?.id) return;
        const existingIndex = state.jobs.findIndex(job => job.id === incoming.id);
        const previousStatus = existingIndex >= 0 ? state.jobs[existingIndex].status : null;
        if (existingIndex >= 0) state.jobs[existingIndex] = incoming;
        else state.jobs.unshift(incoming);

        if (previousStatus && previousStatus !== incoming.status && TERMINAL_STATUSES.has(incoming.status)) {
            state.expanded = true;
            if (incoming.status === 'completed') {
                window.dispatchEvent(new CustomEvent('course-generation-completed', {
                    detail: { job: incoming }
                }));
            }
        }
        render();
    };

    const handleClick = async event => {
        const button = event.target.closest('[data-generation-action]');
        if (!button || state.busyJobId) return;
        const action = button.dataset.generationAction;
        const jobId = button.dataset.jobId;

        if (action === 'toggle') {
            state.expanded = !state.expanded;
            render();
            return;
        }
        if (action === 'dismiss') {
            state.dismissed.add(jobId);
            saveDismissedJobs(user.id, state.dismissed);
            render();
            return;
        }
        if (action === 'review') {
            document.getElementById('tab-courses')?.click();
            window.dispatchEvent(new CustomEvent('course-generation-review', { detail: { jobId } }));
            state.dismissed.add(jobId);
            saveDismissedJobs(user.id, state.dismissed);
            render();
            return;
        }

        state.busyJobId = jobId;
        button.disabled = true;
        try {
            if (action === 'cancel' || action === 'remove') {
                await requestCourseGenerationCancellation(jobId);
            }
            if (action === 'remove') {
                state.dismissed.add(jobId);
                saveDismissedJobs(user.id, state.dismissed);
            }
            if (action === 'retry') await startBackgroundCourseGeneration(jobId);
            await refresh();
        } catch (error) {
            console.error(`Course generation ${action} failed:`, error);
            await fswAlert(error.message || 'The course generation action failed.');
        } finally {
            state.busyJobId = null;
        }
    };

    const handleStarted = () => refresh();
    root.addEventListener('click', handleClick);
    window.addEventListener('course-generation-started', handleStarted);
    await refresh();
    const unsubscribe = subscribeToCourseGenerationJobs(user.id, updateFromRealtime);
    const pollId = window.setInterval(refresh, 15000);

    return () => {
        root.removeEventListener('click', handleClick);
        window.removeEventListener('course-generation-started', handleStarted);
        window.clearInterval(pollId);
        unsubscribe?.();
    };
}
