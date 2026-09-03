import { describe, expect, it, vi } from 'vitest';
import {
    buildEscalatedToneFeedbackPayload,
    getEscalatedToneFeedback
} from './toneCoaching.js';

describe('progressive tone coaching', () => {
    it('asks for highly prescriptive grounded coaching after repeat failures', () => {
        const payload = buildEscalatedToneFeedbackPayload({
            userText: 'Thanks for letting me know. I will look into it.',
            context: 'The employee missed an absence reporting step and needs to know how to correct the record.',
            incomingEmail: 'I forgot to log my absence. What should I do?',
            analysis: {
                score: 62,
                problem_resolution: 24,
                professionalism: 20,
                tone_and_clarity: 18,
                feedback: 'Explain the corrective action more clearly.'
            },
            attemptNumber: 2
        });

        const systemMessage = payload.messages[0].content;
        const userMessage = payload.messages[1].content;

        expect(systemMessage).toContain('next rewrite straightforward enough');
        expect(systemMessage).toContain('exact points their next reply needs to contain');
        expect(systemMessage).toContain('near ready sentence starters');
        expect(systemMessage).toContain('Never invent an FSW policy');
        expect(userMessage).toContain('Problem resolution: 24 / 50');
        expect(userMessage).toContain('I forgot to log my absence');
    });

    it('returns the detailed feedback text from the coaching request', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            feedback: 'Keep your opening, then state the corrective action directly and confirm what happens next.'
                        })
                    }
                }]
            })
        }));

        const feedback = await getEscalatedToneFeedback({
            userText: 'Draft reply',
            context: 'Activity context',
            incomingEmail: 'Incoming email',
            analysis: { score: 60 },
            attemptNumber: 2
        }, fetchImpl);

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(feedback).toContain('state the corrective action directly');
    });
});
