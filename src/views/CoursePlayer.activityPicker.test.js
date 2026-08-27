// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('mermaid', () => ({
    default: {
        initialize: vi.fn(),
        run: vi.fn(async () => undefined)
    }
}));

vi.mock('chart.js/auto', () => ({ default: vi.fn() }));
vi.mock('./components/ToneAnalyser.js', () => ({ renderToneAnalyser: vi.fn() }));
vi.mock('./components/DojoChat.js', () => ({ renderDojoChat: vi.fn() }));
vi.mock('./components/Redline.js', () => ({ renderRedline: vi.fn() }));
vi.mock('./components/Debate.js', () => ({ renderDebate: vi.fn() }));
vi.mock('./components/DecisionSwipe.js', () => ({ renderDecisionSwipe: vi.fn() }));
vi.mock('./components/Certificate.js', () => ({
    renderCertificate: vi.fn(),
    downloadCertificate: vi.fn()
}));
vi.mock('./components/SimulationPlayer.js', () => ({ renderSimulationPlayer: vi.fn() }));
vi.mock('../api/supabase', () => ({ supabase: {} }));
vi.mock('../api/elevenlabs.js', () => ({ createAudio: vi.fn() }));
vi.mock('../api/gamma.js', () => ({
    createPresentation: vi.fn(),
    exportAndUploadPdf: vi.fn()
}));
vi.mock('../api/courses.js', () => ({
    saveExemptedLessons: vi.fn(async () => undefined),
    saveLessonProgress: vi.fn(async () => undefined),
    updateCourse: vi.fn(async (_id, updates) => updates)
}));

import { updateCourse } from '../api/courses.js';
import {
    setLessonActivityMarkdown,
    stripLessonActivityMarkdown
} from '../courseGeneration/activityManagement.js';
import { renderCoursePlayer } from './CoursePlayer.js';

let editorInstances = [];

class EasyMDEStub {
    constructor() {
        this.content = '';
        this.codemirror = { refresh: vi.fn() };
        editorInstances.push(this);
    }

    value(nextValue) {
        if (nextValue !== undefined) this.content = nextValue;
        return this.content;
    }
}

function generatedToneActivity(context) {
    return {
        type: 'ai-tone',
        config: {
            context,
            incoming_email: 'I am concerned that the agreed process has not been followed. What should I do next?',
            initialText: ''
        }
    };
}

function managerCourse() {
    const activity = generatedToneActivity('Original activity');
    return {
        id: 'course-1',
        title: 'Managing Concerns',
        allow_pretest: false,
        content_json: [{
            title: 'Fair Decisions',
            lessons: [{
                title: 'Responding Fairly',
                concept: 'Listen, establish the facts, and explain the appropriate next step.',
                content: setLessonActivityMarkdown('## Responding Fairly\n\nListen before deciding.', activity),
                ai_component: activity,
                quiz: []
            }]
        }]
    };
}

describe('course player manager activity menu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        editorInstances = [];
        document.body.innerHTML = '<main id="app"></main>';
        const easyMDEScript = document.createElement('script');
        easyMDEScript.id = 'easymde-script';
        document.head.appendChild(easyMDEScript);
        vi.stubGlobal('EasyMDE', EasyMDEStub);
        vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: JSON.stringify(generatedToneActivity('Replacement activity')) } }]
            })
        })));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
        document.head.querySelectorAll('#easymde-script, #easymde-css, #easymde-dark-fix').forEach(element => element.remove());
    });

    it('regenerates when the manager selects the current menu option again', async () => {
        renderCoursePlayer(managerCourse(), { id: 'manager-1', role: 'manager' });

        const toggle = document.getElementById('activity-type-toggle');
        const menu = document.getElementById('activity-type-menu');
        expect(toggle.textContent).toContain('Activity: Tone Analyser');
        expect(menu.hidden).toBe(true);

        toggle.click();
        expect(menu.hidden).toBe(false);
        menu.querySelector('[data-activity-type="ai-tone"]').click();

        await vi.waitFor(() => expect(updateCourse).toHaveBeenCalledTimes(1));
        const savedModules = updateCourse.mock.calls[0][1].content_json;
        expect(savedModules[0].lessons[0].content).toContain('Replacement activity');
        expect(document.getElementById('activity-type-toggle').textContent).toContain('Activity: Tone Analyser');
    });

    it('places the activity menu beside the interactive activity heading', () => {
        renderCoursePlayer(managerCourse(), { id: 'manager-1', role: 'manager' });

        const managerControls = document.querySelector('.lesson-manager-controls');
        const activityPicker = document.getElementById('activity-type-picker');

        expect(managerControls.querySelector('#inline-edit-btn')).not.toBeNull();
        expect(managerControls.querySelector('#activity-type-picker')).toBeNull();
        expect(activityPicker.closest('.lesson-activity-heading')?.querySelector('h3')?.textContent)
            .toBe('Interactive Activity');
    });

    it('edits only lesson text and cannot replace the activity heading or code', async () => {
        renderCoursePlayer(managerCourse(), { id: 'manager-1', role: 'manager' });

        document.getElementById('inline-edit-btn').click();
        await vi.waitFor(() => expect(editorInstances).toHaveLength(1));

        const editor = editorInstances[0];
        expect(editor.value()).toBe('## Responding Fairly\n\nListen before deciding.');
        expect(editor.value()).not.toContain('Interactive Activity');
        expect(editor.value()).not.toContain('```ai-tone');

        editor.value(`## Updated lesson

Updated manager text.

### Interactive Activity

\`\`\`ai-debate
{"topic":"Accidental replacement"}
\`\`\``);
        document.getElementById('inline-edit-save').click();

        await vi.waitFor(() => expect(updateCourse).toHaveBeenCalledTimes(1));
        const savedLesson = updateCourse.mock.calls[0][1].content_json[0].lessons[0];

        expect(stripLessonActivityMarkdown(savedLesson.content))
            .toBe('## Updated lesson\n\nUpdated manager text.');
        expect(savedLesson.content).toContain('```ai-tone');
        expect(savedLesson.content).not.toContain('```ai-debate');
        expect(savedLesson.ai_component.config.context).toBe('Original activity');
    });
});
