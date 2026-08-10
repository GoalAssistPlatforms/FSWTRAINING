import { describe, expect, it } from 'vitest';
import {
    COURSE_ACTIVITY_TYPES,
    buildCourseRequestText,
    composeLessonMarkdown,
    normaliseCourseOutline,
    normaliseLessonContent
} from './courseGenerationPrompts.js';

function completeLessonContent(activityType = 'ai-tone') {
    return {
        presentation_input: '# One\n---\n# Two',
        markdown_content: 'Detailed lesson content',
        audio_tracks: Array.from({ length: 10 }, (_, index) => ({
            title: `Slide ${index + 1}`,
            script: `Narration ${index + 1}`
        })),
        quiz: Array.from({ length: 3 }, (_, index) => ({
            question: `Question ${index + 1}`,
            options: ['A', 'B', 'C', 'D'],
            correct_index: 0,
            explanation: 'Explanation'
        })),
        ai_component: {
            type: activityType,
            config: activityType === 'ai-redline'
                ? { items: Array.from({ length: 5 }, () => ({ content: 'Item' })) }
                : { context: 'Context' }
        }
    };
}

describe('background course prompt preparation', () => {
    it('preserves every manager supplied course field in a bounded request', () => {
        expect(buildCourseRequestText({
            title: 'Safe Refrigerant Handling',
            objective: 'Teach the approved process',
            audience: 'Branch teams',
            topics: 'Storage and incident reporting',
            scenarios: 'A damaged cylinder arrives'
        })).toContain('Scenarios/Activities: A damaged cylinder arrives');
    });

    it('caps the outline and assigns deterministic activities across lessons', () => {
        const outline = normaliseCourseOutline({
            title: 'A'.repeat(80),
            description: 'Description',
            modules: [{
                title: 'Module',
                lessons: Array.from({ length: 6 }, (_, index) => ({
                    title: `Lesson ${index + 1}`,
                    concept: 'Concept'
                }))
            }]
        });

        expect(outline.title).toHaveLength(50);
        expect(outline.modules[0].lessons).toHaveLength(4);
        expect(outline.modules[0].lessons.map(lesson => lesson.targetActivity))
            .toEqual(COURSE_ACTIVITY_TYPES.slice(0, 4));
    });
});

describe('background lesson checkpoints', () => {
    it('requires ten narration tracks and three complete quiz questions', () => {
        const content = normaliseLessonContent(completeLessonContent(), 'ai-tone');
        expect(content.audio_tracks).toHaveLength(10);
        expect(content.quiz).toHaveLength(3);

        const incomplete = completeLessonContent();
        incomplete.audio_tracks.pop();
        expect(() => normaliseLessonContent(incomplete, 'ai-tone')).toThrow('ten complete narration tracks');
    });

    it('adds the generated activity to the lesson markdown exactly once', () => {
        const content = normaliseLessonContent(completeLessonContent('ai-redline'), 'ai-redline');
        const markdown = composeLessonMarkdown(content);
        expect(markdown).toContain('### Interactive Activity');
        expect(markdown).toContain('```ai-redline');
    });
});
