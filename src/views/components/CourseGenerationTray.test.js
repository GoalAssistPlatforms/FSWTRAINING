// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    cancel: vi.fn(),
    start: vi.fn(),
    subscribe: vi.fn()
}));

vi.mock('../../api/courseGenerationJobs.js', () => ({
    listCourseGenerationJobs: mocks.list,
    requestCourseGenerationCancellation: mocks.cancel,
    startBackgroundCourseGeneration: mocks.start,
    subscribeToCourseGenerationJobs: mocks.subscribe
}));

import {
    initCourseGenerationTray,
    renderCourseGenerationTray
} from './CourseGenerationTray.js';

beforeEach(() => {
    document.body.innerHTML = renderCourseGenerationTray();
    localStorage.clear();
    vi.clearAllMocks();
    mocks.subscribe.mockReturnValue(vi.fn());
});

describe('course generation tray', () => {
    it('renders an active job as a minimised progress pill and expands on demand', async () => {
        mocks.list.mockResolvedValue([{
            id: 'job-1',
            title: 'Safe Handling',
            status: 'running',
            stage_message: 'Writing lesson 2 of 8',
            completed_units: 25,
            total_units: 100,
            created_at: new Date().toISOString()
        }]);

        const cleanup = await initCourseGenerationTray({ id: 'user-1', role: 'manager' });
        const tray = document.getElementById('course-generation-tray');

        expect(tray.hidden).toBe(false);
        expect(tray.textContent).toContain('Safe Handling · 25%');
        expect(tray.querySelector('.course-generation-drawer')).toBeNull();

        tray.querySelector('[data-generation-action="toggle"]').click();
        expect(tray.textContent).toContain('Writing lesson 2 of 8');
        expect(tray.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('25');
        cleanup();
    });

    it('offers a retry action for a failed durable job', async () => {
        mocks.list.mockResolvedValue([{
            id: 'job-2',
            title: 'Service Course',
            status: 'failed',
            error_message: 'Provider temporarily unavailable',
            finished_at: new Date().toISOString(),
            created_at: new Date().toISOString()
        }]);
        mocks.start.mockResolvedValue({ status: 'queued' });

        const cleanup = await initCourseGenerationTray({ id: 'user-1', role: 'manager' });
        const tray = document.getElementById('course-generation-tray');
        tray.querySelector('[data-generation-action="toggle"]').click();
        tray.querySelector('[data-generation-action="retry"]').click();
        await Promise.resolve();

        expect(mocks.start).toHaveBeenCalledWith('job-2');
        cleanup();
    });
});
