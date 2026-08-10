import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sourceMocks = vi.hoisted(() => ({
    getOverview: vi.fn(),
    retrieveContext: vi.fn()
}));

vi.mock('./courseSources.js', () => ({
    getCourseSourceOverview: sourceMocks.getOverview,
    retrieveCourseSourceContext: sourceMocks.retrieveContext
}));

vi.mock('./guides.js', () => ({
    searchCompanyContext: vi.fn().mockResolvedValue('')
}));

vi.mock('./gamma.js', () => ({
    createPresentation: vi.fn().mockResolvedValue({ url: 'https://gamma.test/deck', id: null }),
    exportToPdf: vi.fn()
}));

vi.mock('./images.js', () => ({
    generateThumbnail: vi.fn().mockResolvedValue('https://images.test/thumbnail.webp')
}));

vi.mock('./elevenlabs.js', () => ({
    createAudio: vi.fn()
}));

vi.mock('./supabase.js', () => ({
    supabase: {}
}));

import { generateCourseContent } from './ai.js';

describe('course generation source retrieval', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sourceMocks.getOverview.mockResolvedValue('[Source document: Leave Policy]\nSummary: Managers must record leave promptly.');
        sourceMocks.retrieveContext.mockResolvedValue('[Source: Leave Policy, page 4]\nManagers must record leave within two working days.');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses summaries for the outline and targeted sections for each lesson', async () => {
        const responses = [
            {
                title: 'Managing Leave',
                description: 'Practical guidance for managers handling employee leave requests consistently and correctly across FSW.',
                thumbnail_query: 'A calendar beside a policy folder',
                modules: [{
                    title: 'Leave Responsibilities',
                    lessons: [{
                        title: 'Recording Leave',
                        concept: 'Apply the recording deadline correctly'
                    }]
                }]
            },
            {
                presentation_input: '# Recording Leave',
                audio_tracks: [],
                markdown_content: 'Managers must follow the source policy.',
                quiz: [
                    { question: 'One?', options: ['A', 'B', 'C', 'D'], correct_index: 0, explanation: 'A' },
                    { question: 'Two?', options: ['A', 'B', 'C', 'D'], correct_index: 1, explanation: 'B' },
                    { question: 'Three?', options: ['A', 'B', 'C', 'D'], correct_index: 2, explanation: 'C' }
                ],
                ai_component: {
                    type: 'ai-tone',
                    config: { context: 'Leave request', incoming_email: 'Please help.', initialText: '' }
                }
            }
        ];

        const fetchMock = vi.fn(async (url) => {
            if (url !== '/api/openai') throw new Error(`Unexpected request to ${url}`);
            const content = responses.shift();
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] })
            };
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateCourseContent(
            'Title: Managing Leave\nObjective: Train managers',
            'job-1',
            vi.fn()
        );

        expect(result.title).toBe('Managing Leave');
        expect(sourceMocks.getOverview).toHaveBeenCalledWith('job-1');
        expect(sourceMocks.retrieveContext).toHaveBeenCalledOnce();
        expect(sourceMocks.retrieveContext.mock.calls[0][1]).toContain('Lesson: Recording Leave');

        const outlineRequest = JSON.parse(fetchMock.mock.calls[0][1].body);
        const lessonRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
        expect(outlineRequest.messages[0].content).toContain('Managers must record leave promptly');
        expect(lessonRequest.messages[0].content).toContain('page 4');
        expect(lessonRequest.messages[0].content).toContain('within two working days');

    });
});
