import { describe, expect, it } from 'vitest';
import {
  hasNoAnswerTag,
  isUnansweredReply,
  readsAsUnanswered,
  stripNoAnswerTag
} from './guideAnswerDetection.js';

describe('guideAnswerDetection', () => {
  it('spots the tag the assistant adds when the answer is not in the knowledge base', () => {
    expect(hasNoAnswerTag('I could not find that.\n\n[[NO_ANSWER]]')).toBe(true);
    expect(hasNoAnswerTag('According to the Staff Handbook, holiday is 25 days.')).toBe(false);
  });

  it('removes the tag before the reply is shown to the learner', () => {
    expect(stripNoAnswerTag('Sorry, I do not have that.\n\n[[NO_ANSWER]]')).toBe('Sorry, I do not have that.');
    expect(stripNoAnswerTag('All good.')).toBe('All good.');
  });

  it('still recognises an unanswered reply when the tag is missing', () => {
    expect(readsAsUnanswered("I'm sorry, but the provided context does not include information on parking permits.")).toBe(true);
    expect(readsAsUnanswered('The knowledge base does not contain guidance on that.')).toBe(true);
    expect(readsAsUnanswered('That is not covered in the documents I have access to.')).toBe(true);
  });

  it('leaves genuine answers alone', () => {
    expect(isUnansweredReply('According to the [Fire Safety Policy], the assembly point is the north car park.')).toBe(false);
    expect(isUnansweredReply('')).toBe(false);
  });

  it('treats a tagged reply as unanswered even when the wording sounds confident', () => {
    expect(isUnansweredReply('Ask your line manager about this one. [[NO_ANSWER]]')).toBe(true);
  });
});
