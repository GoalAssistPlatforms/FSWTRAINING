import { COURSE_ACTIVITY_TYPES, FSW_INTERNAL_CONTEXT } from './courseGenerationPrompts.js';

export const LESSON_ACTIVITY_OPTIONS = Object.freeze([
    { type: 'none', label: 'No Activity' },
    { type: 'ai-tone', label: 'Chat Message' },
    { type: 'ai-dojo', label: 'Phone Call' },
    { type: 'ai-redline', label: 'Document Inspector' },
    { type: 'ai-debate', label: 'Video Call' },
    { type: 'ai-swipe', label: 'Corkboard' }
]);

const ACTIVITY_LABELS = Object.freeze(Object.fromEntries(
    LESSON_ACTIVITY_OPTIONS.map(option => [option.type, option.label])
));

const SUPPORTED_ACTIVITY_TYPES = new Set(COURSE_ACTIVITY_TYPES);
const ACTIVITY_FENCE_PATTERN = /```(ai-(?:tone|dojo|redline|debate|swipe))\s*\n?([\s\S]*?)```/gi;
const ACTIVITY_HEADING_PATTERN = /(^|\n)#{3}\s+Interactive Activity\s*(?=\n|$)/gi;

const CONFIGURATION_INSTRUCTIONS = Object.freeze({
    'ai-tone': `Return config with:
{
  "context": "The learner's role and the communication problem",
  "incoming_email": "A realistic email that presents the problem without giving away the answer",
  "initialText": ""
}
The email must contain a specific problem the learner can genuinely resolve using the lesson content. Do not require facts, procedures or policies that are absent from the lesson.`,
    'ai-dojo': `Return config with:
{
  "scenarioId": "A unique identifier for this scenario",
  "intro": "A concise situation description that does not give away the answer",
  "role": "The caller's job title, relationship to the learner, and current mood",
  "objective": "What the learner must achieve in the conversation",
  "skills": ["Two or more relevant skills"],
  "initialText": "A realistic first person opening line from the caller"
}
The objective must describe one concrete problem that can be demonstrated as resolved. Avoid vague objectives such as communicate effectively or handle the situation well.`,
    'ai-redline': `Return config with:
{
  "title": "A realistic internal document title",
  "intro": "A short document introduction",
  "outro": "A realistic closing line",
  "items": [
    { "content": "A complete statement, instruction, decision or claim", "isRisk": true, "feedback": "The concrete reason it is risky or safe" }
  ]
}
Include between five and seven items. Exactly two or three must be subtle risks. Every item must include educational feedback.
Each item must make sense on its own and be clearly judgeable as safe or correct, or risky or incorrect. Never use neutral events, background facts, vague observations or fragments as items. If an item is safe, make the correct action or requirement explicit. Feedback must explain the specific feature that makes the item safe or risky using only the lesson content.`,
    'ai-debate': `Return config with:
{
  "topic": "A realistic proposed shortcut or contested decision",
  "persona": "The stakeholder's role, motivation, and manner",
  "stakeholderName": "A realistic first name",
  "stances": ["Follow the correct approach", "Allow the proposed shortcut"]
}
The stakeholder must push for an unsafe, unfair, or noncompliant shortcut which the learner can challenge using the lesson. The correct stance must be defensible with a concrete reason from the lesson so the learner can explain why it matters and respond to one relevant pushback.`,
    'ai-swipe': `Return config with:
{
  "title": "A concise activity title",
  "cards": [
    { "text": "A complete actionable statement", "isCorrect": true, "feedback": "The specific reason this should be approved or binned" }
  ],
  "labels": { "left": "Bin It", "right": "Approved" }
}
Include between ten and twelve distinct cards with a useful mixture of approved and binned choices.
Every card must describe an action, decision, instruction or claim that can immediately and unambiguously be classified. isCorrect true means the statement is factually correct, safe and compliant. isCorrect false means it contains a definite mistake, unsafe practice, misleading claim or noncompliant action. Never use neutral events, ambiguous observations, partial facts, open ended questions or statements where both choices could reasonably be defended. Do not make a card wrong merely because information is missing unless that omission itself makes the action unsafe or noncompliant.`
});

function requiredString(value, fieldName) {
    const result = String(value || '').trim();
    if (!result) throw new Error(`The generated activity is missing ${fieldName}.`);
    return result;
}

function optionalString(value) {
    return String(value || '').trim();
}

function parseGeneratedJson(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
    return JSON.parse(trimmed);
}

function freshScenarioId(originalId) {
    const base = String(originalId || 'scenario')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'scenario';
    const uniquePart = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${base}-${uniquePart}`;
}

export function getActivityLabel(type) {
    return ACTIVITY_LABELS[type] || 'Activity';
}

export function getLessonActivityType(lesson = {}) {
    if (SUPPORTED_ACTIVITY_TYPES.has(lesson?.ai_component?.type)) {
        return lesson.ai_component.type;
    }

    const match = String(lesson?.content || '').match(/```(ai-(?:tone|dojo|redline|debate|swipe))\b/i);
    return match?.[1]?.toLowerCase() || 'none';
}

export function stripLessonActivityMarkdown(markdown = '') {
    return String(markdown)
        .replace(ACTIVITY_FENCE_PATTERN, '')
        .replace(ACTIVITY_HEADING_PATTERN, '$1')
        .trimEnd();
}

export function setLessonActivityMarkdown(markdown, activity) {
    const lessonContent = stripLessonActivityMarkdown(markdown);
    if (!activity) return lessonContent;

    return `${lessonContent}\n\n### Interactive Activity\n\n\`\`\`${activity.type}\n${JSON.stringify(activity.config, null, 2)}\n\`\`\``;
}

export function mergeEditableLessonMarkdown(originalMarkdown, editedMarkdown, activity) {
    const lessonContent = stripLessonActivityMarkdown(editedMarkdown);

    if (activity?.type && activity?.config) {
        return setLessonActivityMarkdown(lessonContent, activity);
    }

    const originalActivityFence = String(originalMarkdown || '').match(ACTIVITY_FENCE_PATTERN)?.[0];
    if (!originalActivityFence) return lessonContent;

    return `${lessonContent}\n\n### Interactive Activity\n\n${originalActivityFence.trim()}`;
}

export function normaliseGeneratedActivity(rawValue, expectedType) {
    if (!SUPPORTED_ACTIVITY_TYPES.has(expectedType)) {
        throw new Error('The selected activity type is not supported.');
    }

    const parsed = parseGeneratedJson(rawValue);
    const activity = parsed?.ai_component || parsed?.activity || parsed;
    if (activity?.type !== expectedType || !activity?.config || typeof activity.config !== 'object') {
        throw new Error(`The generated activity was not a valid ${getActivityLabel(expectedType)}.`);
    }

    const config = activity.config;

    if (expectedType === 'ai-tone') {
        return {
            type: expectedType,
            config: {
                context: requiredString(config.context, 'context'),
                incoming_email: requiredString(config.incoming_email, 'incoming email'),
                initialText: optionalString(config.initialText)
            }
        };
    }

    if (expectedType === 'ai-dojo') {
        const skills = Array.isArray(config.skills)
            ? config.skills.map(optionalString).filter(Boolean)
            : [];
        if (skills.length < 2) throw new Error('The generated simulated call needs at least two skills.');

        return {
            type: expectedType,
            config: {
                scenarioId: requiredString(config.scenarioId, 'scenario identifier'),
                intro: requiredString(config.intro, 'introduction'),
                role: requiredString(config.role, 'caller role'),
                objective: requiredString(config.objective, 'objective'),
                skills,
                initialText: requiredString(config.initialText, 'opening line')
            }
        };
    }

    if (expectedType === 'ai-redline') {
        const items = Array.isArray(config.items) ? config.items.slice(0, 7) : [];
        if (items.length < 5) throw new Error('The generated document inspection needs at least five items.');

        const normalisedItems = items.map((item, index) => {
            if (typeof item?.isRisk !== 'boolean') {
                throw new Error(`Document inspection item ${index + 1} is missing its risk classification.`);
            }
            return {
                content: requiredString(item.content, `item ${index + 1} content`),
                isRisk: item.isRisk,
                feedback: requiredString(item.feedback, `item ${index + 1} feedback`)
            };
        });
        const riskCount = normalisedItems.filter(item => item.isRisk).length;
        if (riskCount < 2 || riskCount > 3) {
            throw new Error('The generated document inspection must contain two or three risks.');
        }

        return {
            type: expectedType,
            config: {
                title: requiredString(config.title, 'document title'),
                intro: requiredString(config.intro, 'document introduction'),
                outro: requiredString(config.outro, 'document closing'),
                items: normalisedItems
            }
        };
    }

    if (expectedType === 'ai-debate') {
        const stances = Array.isArray(config.stances)
            ? config.stances.map(optionalString).filter(Boolean)
            : [];
        if (stances.length !== 2) throw new Error('The generated policy discussion needs exactly two stances.');

        return {
            type: expectedType,
            config: {
                topic: requiredString(config.topic, 'discussion topic'),
                persona: requiredString(config.persona, 'stakeholder persona'),
                stakeholderName: requiredString(config.stakeholderName, 'stakeholder name'),
                stances
            }
        };
    }

    const cards = Array.isArray(config.cards) ? config.cards.slice(0, 12) : [];
    if (cards.length < 10) throw new Error('The generated decision activity needs at least ten cards.');
    const normalisedCards = cards.map((card, index) => {
        if (typeof card?.isCorrect !== 'boolean') {
            throw new Error(`Decision card ${index + 1} is missing its correct choice.`);
        }
        return {
            text: requiredString(card.text, `card ${index + 1} text`).slice(0, 200),
            isCorrect: card.isCorrect,
            feedback: requiredString(card.feedback, `card ${index + 1} feedback`)
        };
    });
    const correctChoices = normalisedCards.filter(card => card.isCorrect).length;
    if (correctChoices === 0 || correctChoices === normalisedCards.length) {
        throw new Error('The generated decision activity needs both approved and binned choices.');
    }

    return {
        type: expectedType,
        config: {
            title: requiredString(config.title, 'activity title'),
            cards: normalisedCards,
            labels: {
                left: requiredString(config.labels?.left, 'left choice label'),
                right: requiredString(config.labels?.right, 'right choice label')
            }
        }
    };
}

export function buildActivityGenerationPayload({
    type,
    courseTitle,
    moduleTitle,
    lessonTitle,
    lessonConcept,
    lessonContent
}) {
    if (!SUPPORTED_ACTIVITY_TYPES.has(type)) {
        throw new Error('The selected activity type is not supported.');
    }

    return {
        model: 'openai/gpt-4o',
        messages: [
            {
                role: 'system',
                content: `${FSW_INTERNAL_CONTEXT}

Create one interactive activity for one existing lesson.
Return only a JSON object with this exact top level structure:
{
  "type": "${type}",
  "config": {}
}

The activity must practise the lesson objective, remain factually aligned with the lesson, use UK English, and feel realistic for an FSW employee. Do not invent policies, procedures, deadlines, thresholds, or systems. Do not reveal the correct answer in the introduction or scenario.

${CONFIGURATION_INSTRUCTIONS[type]}`
            },
            {
                role: 'user',
                content: `Course: ${String(courseTitle || '').slice(0, 200)}
Module: ${String(moduleTitle || '').slice(0, 200)}
Lesson: ${String(lessonTitle || '').slice(0, 200)}
Concept: ${String(lessonConcept || '').slice(0, 2000)}

Lesson content:
${stripLessonActivityMarkdown(lessonContent).slice(0, 14000)}`
            }
        ],
        response_format: { type: 'json_object' }
    };
}

export async function generateLessonActivity(context, fetchImpl = globalThis.fetch) {
    const payload = buildActivityGenerationPayload(context);
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const response = await fetchImpl('/api/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok) {
                const message = data?.error?.message || data?.error || `Activity generation failed with status ${response.status}.`;
                throw new Error(message);
            }

            const content = data?.choices?.[0]?.message?.content;
            if (!content) throw new Error('No activity was returned.');
            const activity = normaliseGeneratedActivity(content, context.type);
            if (activity.type === 'ai-dojo') {
                activity.config.scenarioId = freshScenarioId(activity.config.scenarioId);
            }
            return activity;
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(lastError?.message || 'The activity could not be generated.');
}

export async function applyLessonActivitySelection({
    modules,
    moduleIndex,
    lessonIndex,
    selectedType,
    generationContext = {},
    generateActivity = generateLessonActivity,
    persist
}) {
    if (selectedType !== 'none' && !SUPPORTED_ACTIVITY_TYPES.has(selectedType)) {
        throw new Error('The selected activity type is not supported.');
    }
    if (typeof persist !== 'function') throw new Error('An activity save function is required.');

    const currentLesson = modules?.[moduleIndex]?.lessons?.[lessonIndex];
    if (!currentLesson) throw new Error('The selected lesson could not be found.');

    const activity = selectedType === 'none'
        ? null
        : await generateActivity({
            ...generationContext,
            type: selectedType,
            lessonTitle: currentLesson.title,
            lessonConcept: currentLesson.concept,
            lessonContent: currentLesson.content
        });

    const nextModules = JSON.parse(JSON.stringify(modules));
    const nextLesson = nextModules[moduleIndex].lessons[lessonIndex];
    nextLesson.content = setLessonActivityMarkdown(nextLesson.content, activity);
    if (activity) nextLesson.ai_component = activity;
    else delete nextLesson.ai_component;

    await persist(nextModules);
    return nextModules;
}
