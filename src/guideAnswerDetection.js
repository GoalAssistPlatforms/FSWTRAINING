// Works out whether the knowledge base assistant actually answered the learner's question.
// The prompt asks the model to mark a miss with a tag; the phrase patterns are a safety net
// for replies where the model forgets the tag.

export const NO_ANSWER_TAG = '[[NO_ANSWER]]';

const TAG_PATTERN = /\[\[\s*NO[_\s-]?ANSWER\s*\]\]/i;

const UNANSWERED_PHRASES = [
  /(?:provided |supplied |given |available )?context does not (?:include|contain|mention|cover|provide|specify)/i,
  /(?:knowledge base|documents?|guides?|handbook|materials?) (?:does|do) not (?:include|contain|mention|cover|provide|specify)/i,
  /not (?:covered|mentioned|included|specified|available) in the (?:provided |supplied |given )?(?:context|documents?|knowledge base|guides?|handbook)/i,
  /(?:there is|there's) no (?:information|detail|guidance|mention)/i,
  /(?:i (?:could not|couldn't|cannot|can't|do not|don't)) (?:find|see|have) (?:any |the )?(?:information|details|guidance|answer)/i,
  /(?:i (?:do not|don't) have (?:enough|any) information)/i,
  /unable to (?:find|answer|locate) (?:any |that |this )?(?:information|answer|question)/i
];

// A model can occasionally append the no answer tag even after it has found and cited the
// requested document. These patterns identify clear positive retrieval answers so the app
// does not offer a manager when the knowledge base has already solved the learner's request.
const ANSWERED_PHRASES = [
  /according to (?:the )?\[?[^\n\]]+\]?/i,
  /(?:there is|there's|we have|we've got) (?:an? |the )?(?:[^.\n]{0,80} )?(?:document|policy|guide|template|letter|form|procedure)/i,
  /(?:document|policy|guide|template|letter|form|procedure)[^.\n]{0,80}(?:is|are) available/i,
  /you can find (?:it|this|the|that)?[^.\n]{0,100}(?:document|policy|guide|template|letter|form|procedure)/i,
  /(?:document|policy|guide|template|letter|form|procedure) (?:titled|called|named) ["“'][^"”'\n]+["”']/i
];

export const hasNoAnswerTag = text => TAG_PATTERN.test(String(text || ''));

export const stripNoAnswerTag = text => String(text || '')
  .replace(new RegExp(TAG_PATTERN.source, 'gi'), '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export const readsAsUnanswered = text => {
  const value = String(text || '').trim();
  if (!value) return false;
  return UNANSWERED_PHRASES.some(pattern => pattern.test(value));
};

export const readsAsAnswered = text => {
  const value = String(text || '').trim();
  if (!value || readsAsUnanswered(value)) return false;
  return ANSWERED_PHRASES.some(pattern => pattern.test(value));
};

/**
 * True when the reply is an "I don't know" rather than a real answer, which is when the
 * learner is offered the option of sending the question on to a manager.
 */
export const isUnansweredReply = text => {
  const cleanReply = stripNoAnswerTag(text);
  if (readsAsUnanswered(cleanReply)) return true;
  if (readsAsAnswered(cleanReply)) return false;
  return hasNoAnswerTag(text);
};
