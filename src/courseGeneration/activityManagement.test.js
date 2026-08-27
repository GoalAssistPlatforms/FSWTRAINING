import { describe, expect, it, vi } from 'vitest';
import {
    applyLessonActivitySelection,
    buildActivityGenerationPayload,
    generateLessonActivity,
    getLessonActivityType,
    mergeEditableLessonMarkdown,
    normaliseGeneratedActivity,
    setLessonActivityMarkdown,
    stripLessonActivityMarkdown
} from './activityManagement.js';

function toneActivity(context = 'Handle the concern professionally') {
    return {
        type: 'ai-tone',
        config: {
            context,
            incoming_email: 'I am concerned that the agreed process has not been followed. What should I do next?',
            initialText: ''
        }
    };
}

function lessonModules(activity = toneActivity('Original activity')) {
    return [{
        title: 'Managing Concerns',
        lessons: [{
            title: 'Responding Fairly',
            concept: 'Listen, establish the facts, and explain the appropriate next step.',
            content: setLessonActivityMarkdown('## Responding Fairly\n\nListen before deciding.', activity),
            ai_component: activity,
            quiz: []
        }]
    }];
}

describe('lesson activity markdown', () => {
    it('replaces an existing activity without duplicating its heading or code block', () => {
        const original = setLessonActivityMarkdown('Lesson text', toneActivity());
        const replacement = {
            type: 'ai-debate',
            config: {
                topic: 'A colleague proposes skipping a required check',
                persona: 'A rushed branch manager',
                stakeholderName: 'Sam',
                stances: ['Complete the check', 'Skip the check']
            }
        };

        const updated = setLessonActivityMarkdown(original, replacement);

        expect(updated.match(/### Interactive Activity/g)).toHaveLength(1);
        expect(updated).toContain('```ai-debate');
        expect(updated).not.toContain('```ai-tone');
        expect(stripLessonActivityMarkdown(updated)).toBe('Lesson text');
    });

    it('finds activities from saved data and legacy markdown', () => {
        expect(getLessonActivityType({ ai_component: toneActivity() })).toBe('ai-tone');
        expect(getLessonActivityType({ content: '```ai-swipe\n{}\n```' })).toBe('ai-swipe');
        expect(getLessonActivityType({ content: 'Lesson only' })).toBe('none');
    });

    it('allows lesson text edits while preserving protected activity content', () => {
        const originalActivity = toneActivity('Protected activity');
        const original = setLessonActivityMarkdown('Original lesson text', originalActivity);
        const edited = `Updated lesson text

### Interactive Activity

\`\`\`ai-debate
{"topic":"Accidental replacement"}
\`\`\``;

        const updated = mergeEditableLessonMarkdown(original, edited, originalActivity);

        expect(stripLessonActivityMarkdown(updated)).toBe('Updated lesson text');
        expect(updated).toContain('```ai-tone');
        expect(updated).toContain('Protected activity');
        expect(updated).not.toContain('```ai-debate');
        expect(updated.match(/### Interactive Activity/g)).toHaveLength(1);
    });
});

describe('generated activity validation', () => {
    it('accepts a complete simulated call and rejects malformed decision cards', () => {
        expect(normaliseGeneratedActivity({
            type: 'ai-dojo',
            config: {
                scenarioId: 'late-delivery-call',
                intro: 'A driver calls about a delayed delivery.',
                role: 'Concerned branch driver',
                objective: 'Establish the cause and agree the correct next step.',
                skills: ['Listening', 'Problem solving'],
                initialText: 'I am going to miss the promised delivery time.'
            }
        }, 'ai-dojo')).toMatchObject({ type: 'ai-dojo' });

        expect(() => normaliseGeneratedActivity({
            type: 'ai-swipe',
            config: {
                title: 'Decisions',
                cards: Array.from({ length: 10 }, () => ({ text: 'Decision', feedback: 'Feedback' })),
                labels: { left: 'Reject', right: 'Accept' }
            }
        }, 'ai-swipe')).toThrow('missing its correct choice');
    });
});

describe('manager activity selection', () => {
    it('regenerates when the manager selects the current activity type', async () => {
        const modules = lessonModules();
        const replacement = toneActivity('Replacement activity');
        const generateActivity = vi.fn(async () => replacement);
        const persist = vi.fn(async () => undefined);

        const nextModules = await applyLessonActivitySelection({
            modules,
            moduleIndex: 0,
            lessonIndex: 0,
            selectedType: 'ai-tone',
            generationContext: { courseTitle: 'Course' },
            generateActivity,
            persist
        });

        expect(generateActivity).toHaveBeenCalledWith(expect.objectContaining({
            type: 'ai-tone',
            lessonTitle: 'Responding Fairly'
        }));
        expect(nextModules[0].lessons[0].ai_component).toEqual(replacement);
        expect(nextModules[0].lessons[0].content).toContain('Replacement activity');
        expect(modules[0].lessons[0].ai_component.config.context).toBe('Original activity');
        expect(persist).toHaveBeenCalledWith(nextModules);
    });

    it('changes activity type with the same selection action', async () => {
        const modules = lessonModules();
        const replacement = {
            type: 'ai-debate',
            config: {
                topic: 'A proposed shortcut',
                persona: 'A rushed manager',
                stakeholderName: 'Alex',
                stances: ['Follow the process', 'Take the shortcut']
            }
        };

        const nextModules = await applyLessonActivitySelection({
            modules,
            moduleIndex: 0,
            lessonIndex: 0,
            selectedType: 'ai-debate',
            generateActivity: vi.fn(async () => replacement),
            persist: vi.fn(async () => undefined)
        });

        expect(nextModules[0].lessons[0].content).toContain('```ai-debate');
        expect(nextModules[0].lessons[0].content).not.toContain('```ai-tone');
    });

    it('removes an activity without making a generation request', async () => {
        const modules = lessonModules();
        const generateActivity = vi.fn();

        const nextModules = await applyLessonActivitySelection({
            modules,
            moduleIndex: 0,
            lessonIndex: 0,
            selectedType: 'none',
            generateActivity,
            persist: vi.fn(async () => undefined)
        });

        expect(generateActivity).not.toHaveBeenCalled();
        expect(nextModules[0].lessons[0].ai_component).toBeUndefined();
        expect(nextModules[0].lessons[0].content).toBe('## Responding Fairly\n\nListen before deciding.');
    });

    it('preserves the existing activity when generation or saving fails', async () => {
        const generationModules = lessonModules();
        const generationPersist = vi.fn();

        await expect(applyLessonActivitySelection({
            modules: generationModules,
            moduleIndex: 0,
            lessonIndex: 0,
            selectedType: 'ai-debate',
            generateActivity: vi.fn(async () => {
                throw new Error('Generation unavailable');
            }),
            persist: generationPersist
        })).rejects.toThrow('Generation unavailable');

        expect(generationPersist).not.toHaveBeenCalled();
        expect(getLessonActivityType(generationModules[0].lessons[0])).toBe('ai-tone');

        const savingModules = lessonModules();
        await expect(applyLessonActivitySelection({
            modules: savingModules,
            moduleIndex: 0,
            lessonIndex: 0,
            selectedType: 'ai-tone',
            generateActivity: vi.fn(async () => toneActivity('Unsaved replacement')),
            persist: vi.fn(async () => {
                throw new Error('Save failed');
            })
        })).rejects.toThrow('Save failed');

        expect(savingModules[0].lessons[0].ai_component.config.context).toBe('Original activity');
    });
});

describe('activity generation request', () => {
    it('uses lesson content without sending the previous activity back as source material', () => {
        const payload = buildActivityGenerationPayload({
            type: 'ai-tone',
            courseTitle: 'Course',
            moduleTitle: 'Module',
            lessonTitle: 'Lesson',
            lessonConcept: 'Concept',
            lessonContent: setLessonActivityMarkdown('Useful lesson content', toneActivity())
        });

        const userMessage = payload.messages.find(message => message.role === 'user').content;
        expect(userMessage).toContain('Useful lesson content');
        expect(userMessage).not.toContain('```ai-tone');
    });

    it('retries one malformed response within the same manager selection', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: '{"type":"ai-tone","config":{}}' } }] })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ choices: [{ message: { content: JSON.stringify(toneActivity()) } }] })
            });

        const result = await generateLessonActivity({
            type: 'ai-tone',
            courseTitle: 'Course',
            moduleTitle: 'Module',
            lessonTitle: 'Lesson',
            lessonConcept: 'Concept',
            lessonContent: 'Lesson content'
        }, fetchImpl);

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result).toEqual(toneActivity());
    });

    it('gives every regenerated simulated call a fresh conversation identity', async () => {
        const generatedCall = {
            type: 'ai-dojo',
            config: {
                scenarioId: 'delivery-delay',
                intro: 'A driver calls about a delayed delivery.',
                role: 'Concerned branch driver',
                objective: 'Establish the cause and agree the correct next step.',
                skills: ['Listening', 'Problem solving'],
                initialText: 'I am going to miss the promised delivery time.'
            }
        };
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: JSON.stringify(generatedCall) } }] })
        }));

        const first = await generateLessonActivity({
            type: 'ai-dojo',
            lessonContent: 'Lesson content'
        }, fetchImpl);
        const second = await generateLessonActivity({
            type: 'ai-dojo',
            lessonContent: 'Lesson content'
        }, fetchImpl);

        expect(first.config.scenarioId).toMatch(/^delivery-delay-/);
        expect(second.config.scenarioId).toMatch(/^delivery-delay-/);
        expect(first.config.scenarioId).not.toBe(second.config.scenarioId);
    });
});
