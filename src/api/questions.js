import { supabase } from './supabase.js';
import { ANSWERED_QUESTION_TAG, generateEmbedding } from './guides.js';

const QUESTION_FIELDS = 'id, asker_id, asker_name, manager_id, manager_name, manager_avatar_url, conversation_id, question, answer, status, save_to_kb, kb_document_id, created_at, answered_at';

const requireUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error('You must be signed in to do that.');
  return data.user;
};

/**
 * The managers a learner can forward a question to.
 */
export const fetchAskableManagers = async () => {
  const { data, error } = await supabase.rpc('get_askable_managers');
  if (error) throw error;
  return data || [];
};

/**
 * Send an unanswered chat question to a chosen manager. The manager is notified.
 */
export const escalateQuestion = async (question, managerId, conversationId = null) => {
  const { data, error } = await supabase.rpc('escalate_guide_question', {
    p_question: String(question || '').trim(),
    p_manager_id: managerId,
    p_conversation_id: conversationId || null
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
};

/**
 * Questions the signed-in learner has forwarded, optionally limited to one chat thread.
 */
export const fetchMyQuestions = async (conversationId = null) => {
  const user = await requireUser();
  let query = supabase
    .from('guide_questions')
    .select(QUESTION_FIELDS)
    .eq('asker_id', user.id)
    .order('created_at', { ascending: true });

  if (conversationId) query = query.eq('conversation_id', conversationId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

/**
 * Questions still waiting on a manager. Visible to managers and admins.
 */
export const fetchPendingQuestions = async () => {
  const { data, error } = await supabase
    .from('guide_questions')
    .select(QUESTION_FIELDS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const fetchQuestion = async (questionId) => {
  const { data, error } = await supabase
    .from('guide_questions')
    .select(QUESTION_FIELDS)
    .eq('id', questionId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Turn an answered question into a knowledge base document so the assistant can answer it
 * next time. Mirrors the chunk + embedding shape used by uploaded guides.
 */
export const saveAnswerToKnowledgeBase = async (question, answer) => {
  const user = await requireUser();
  const author = user.user_metadata?.full_name || user.email || 'a manager';
  const trimmedQuestion = String(question || '').trim();
  const trimmedAnswer = String(answer || '').trim();

  const title = trimmedQuestion.length > 120 ? `${trimmedQuestion.slice(0, 117).trim()}...` : trimmedQuestion;
  const content = `Question: ${trimmedQuestion}\n\nAnswer: ${trimmedAnswer}`;

  const { data: doc, error: docError } = await supabase
    .from('guide_documents')
    .insert({
      title: `Q&A: ${title}`,
      description: `Answered by ${author} on ${new Date().toLocaleDateString()}.`,
      tags: [ANSWERED_QUESTION_TAG],
      created_by: user.id
    })
    .select()
    .single();

  if (docError) throw docError;

  const embedding = await generateEmbedding(content);

  const { error: chunkError } = await supabase
    .from('guide_chunks')
    .insert({
      document_id: doc.id,
      content,
      embedding,
      chunk_index: 1
    });

  if (chunkError) throw chunkError;
  return doc;
};

/**
 * Record a manager's reply. The answer is pushed back into the learner's chat thread and
 * they are notified. When keepForKnowledgeBase is true the Q&A is also embedded into the
 * knowledge base first, so a failed embedding never loses the reply itself.
 */
export const answerQuestion = async (questionId, answer, keepForKnowledgeBase = false) => {
  const question = await fetchQuestion(questionId);
  if (!question) throw new Error('That question could not be found.');
  if (question.status !== 'pending') throw new Error('That question has already been answered.');

  let kbDocumentId = null;
  let knowledgeBaseError = null;

  if (keepForKnowledgeBase) {
    try {
      const doc = await saveAnswerToKnowledgeBase(question.question, answer);
      kbDocumentId = doc?.id || null;
    } catch (error) {
      console.error('Unable to save the answer to the knowledge base:', error);
      knowledgeBaseError = error;
    }
  }

  const { data, error } = await supabase.rpc('answer_guide_question', {
    p_question_id: questionId,
    p_answer: String(answer || '').trim(),
    p_save_to_kb: Boolean(keepForKnowledgeBase && kbDocumentId),
    p_kb_document_id: kbDocumentId
  });

  if (error) throw error;

  return {
    question: Array.isArray(data) ? data[0] : data,
    savedToKnowledgeBase: Boolean(kbDocumentId),
    knowledgeBaseError
  };
};
