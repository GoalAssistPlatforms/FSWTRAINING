const clampText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

export function buildEscalatedToneFeedbackPayload({
    userText,
    context,
    incomingEmail,
    analysis = {},
    attemptNumber = 2
}) {
    const rescueLevel = Number(attemptNumber) >= 3 ? 'maximum' : 'strong';

    return {
        model: 'openai/gpt-4o-mini',
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: `You are an FSW communications coach helping a learner who has already failed this activity more than once.

Your job is now to make the next rewrite straightforward enough that a learner who follows your guidance should be able to pass, while still requiring them to write the final reply themselves.

SOURCE OF TRUTH:
Use only the supplied activity context and incoming email. Never invent an FSW policy, procedure, deadline, threshold, system, contact, form, attachment, or requirement that is not supported by those materials.

COACHING MODE: ${rescueLevel}

Write concise but highly prescriptive coaching. The learner must be able to see exactly what to change.

Your response must:
1. State the main reason the current answer is still below the pass standard.
2. Tell the learner the exact points their next reply needs to contain, in the order they should appear.
3. Give near ready sentence starters or a short scaffold they can adapt. Do not write a complete polished final answer on their behalf.
4. Preserve anything the learner already did well instead of asking them to rewrite unnecessarily.
5. Focus especially on problem resolution when that score is the main weakness.

For attempt 3 or later, make the scaffold even more explicit. It is acceptable for most of the wording to be reusable, provided there is still at least one meaningful part for the learner to complete or adapt.

Return JSON only:
{
  "feedback": "Detailed coaching in plain English, ideally 70 to 130 words."
}`
            },
            {
                role: 'user',
                content: `Activity context:\n${clampText(context, 3000)}\n\nIncoming email:\n${clampText(incomingEmail, 5000)}\n\nLearner reply:\n${clampText(userText, 5000)}\n\nLatest scoring:\nOverall: ${Number(analysis.score) || 0}\nProblem resolution: ${Number(analysis.problem_resolution) || 0} / 50\nProfessionalism: ${Number(analysis.professionalism) || 0} / 25\nTone and clarity: ${Number(analysis.tone_and_clarity) || 0} / 25\n\nPrevious feedback:\n${clampText(analysis.feedback, 1500)}`
            }
        ],
        response_format: { type: 'json_object' }
    };
}

export async function getEscalatedToneFeedback(details, fetchImpl = globalThis.fetch) {
    const response = await fetchImpl('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEscalatedToneFeedbackPayload(details))
    });

    const data = await response.json();
    if (!response.ok) {
        const message = data?.error?.message || data?.error || `Detailed coaching failed with status ${response.status}.`;
        throw new Error(message);
    }

    const rawContent = data?.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error('No detailed coaching was returned.');

    const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
    const feedback = String(parsed?.feedback || '').trim();
    if (!feedback) throw new Error('The detailed coaching response was empty.');
    return feedback;
}
