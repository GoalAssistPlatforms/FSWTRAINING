import { supabase } from './supabase.js';

const requireUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error('You must be signed in to use chat history.');
  return data.user;
};

const normaliseTitle = (title) => {
  const cleaned = String(title || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New chat';
  return cleaned.length > 72 ? `${cleaned.slice(0, 69).trim()}...` : cleaned;
};

export const listChatConversations = async () => {
  const user = await requireUser();
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
};

export const createChatConversation = async (title) => {
  const user = await requireUser();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({
      user_id: user.id,
      title: normaliseTitle(title),
      created_at: now,
      updated_at: now
    })
    .select('id, title, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
};

export const listChatMessages = async (conversationId) => {
  const user = await requireUser();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, conversation_id, role, content, sources, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const addChatMessage = async (conversationId, role, content, sources = []) => {
  if (!['user', 'assistant'].includes(role)) throw new Error('Invalid chat message role.');

  const user = await requireUser();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role,
      content: String(content || ''),
      sources: Array.isArray(sources) ? sources : [],
      created_at: now
    })
    .select('id, conversation_id, role, content, sources, created_at')
    .single();

  if (error) throw error;

  const { error: touchError } = await supabase
    .from('chat_conversations')
    .update({ updated_at: now })
    .eq('id', conversationId)
    .eq('user_id', user.id);

  if (touchError) console.warn('Chat conversation timestamp update failed:', touchError);
  return data;
};

export const renameChatConversation = async (conversationId, title) => {
  const user = await requireUser();
  const { data, error } = await supabase
    .from('chat_conversations')
    .update({ title: normaliseTitle(title), updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .select('id, title, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
};

export const deleteChatConversation = async (conversationId) => {
  const user = await requireUser();
  const { error } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', user.id);

  if (error) throw error;
};
