import { marked } from 'marked';
import { chatWithGuides } from './api/guides.js';
import { getCurrentUser } from './api/auth.js';
import {
  addChatMessage,
  createChatConversation,
  deleteChatConversation,
  listChatConversations,
  listChatMessages,
  renameChatConversation
} from './api/chatHistory.js';
import { fswAlert, fswConfirm } from './utils/dialog';

const ACTIVE_CHAT_KEY = 'fsw_active_guide_chat_id';
const CONTEXT_MESSAGE_LIMIT = 10;
const HISTORY_LIMIT = 50;

const isMissingSchemaError = error => {
  const code = error?.code || '';
  const message = String(error?.message || error || '');
  return code === '42P01'
    || code === 'PGRST205'
    || /chat_conversations|chat_messages/i.test(message) && /does not exist|schema cache|not found/i.test(message);
};

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const cleanTitle = value => {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (!title) return 'New chat';
  return title.length > 72 ? `${title.slice(0, 69).trim()}...` : title;
};

const relativeDate = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const sanitiseSources = sources => {
  if (!Array.isArray(sources)) return [];
  const seen = new Set();
  return sources
    .filter(source => source?.document_title && !seen.has(source.document_title) && seen.add(source.document_title))
    .map(source => ({
      document_title: source.document_title,
      file_url: source.file_url || null,
      is_interactive: Boolean(source.is_interactive),
      courseData: source.is_interactive && source.courseData ? source.courseData : null
    }));
};

const buildContextualQuestion = (question, messages) => {
  const context = messages
    .slice(-CONTEXT_MESSAGE_LIMIT)
    .filter(message => message?.content && ['user', 'assistant'].includes(message.role));

  if (context.length === 0) return question;

  const transcript = context
    .map(message => `${message.role === 'user' ? 'User' : 'Helen & Lindsay'}: ${message.content}`)
    .join('\n');

  return `The user is continuing an existing conversation. Use the conversation below only to understand follow-up references, pronouns and what topic they are discussing. The official FSW knowledge base remains the authority for factual answers.\n\nConversation so far:\n${transcript}\n\nCurrent user question: ${question}\n\nAnswer the current user question directly. Do not mention this hidden conversation context.`;
};

const removeRenderedMessages = chatHistory => {
  const greeting = chatHistory.querySelector('#chat-greeting');
  Array.from(chatHistory.children).forEach(child => {
    if (child !== greeting) child.remove();
  });
  return greeting;
};

const setEmptyState = (chatHistory, suggestions, input) => {
  const greeting = removeRenderedMessages(chatHistory);
  if (greeting) greeting.style.display = 'flex';
  if (suggestions) suggestions.style.display = 'flex';
  if (input) input.value = '';
  chatHistory.scrollTop = 0;
  requestAnimationFrame(() => input?.focus());
};

const appendMessage = async (chatHistory, user, content, isUser = false, sources = []) => {
  const msgDiv = document.createElement('div');
  msgDiv.dataset.persistedChatMessage = 'true';
  msgDiv.style.alignSelf = isUser ? 'flex-end' : 'flex-start';
  msgDiv.style.maxWidth = isUser ? '70%' : '100%';
  msgDiv.style.background = isUser ? 'rgba(40, 41, 42, 0.9)' : 'transparent';
  msgDiv.style.color = 'white';
  msgDiv.style.padding = isUser ? '1rem 1.5rem' : '1rem 0';
  msgDiv.style.borderRadius = isUser ? '20px' : '0';
  msgDiv.style.lineHeight = '1.6';
  msgDiv.style.fontSize = '1.05rem';

  const formattedContent = marked.parse(String(content || ''));
  let sourceHtml = '';
  let embedHtml = '';
  const uniqueSources = sanitiseSources(sources);

  if (uniqueSources.length > 0) {
    sourceHtml = `<div style="margin-top: 15px; display: flex; gap: 0.5rem; flex-wrap: wrap;">${uniqueSources.map(source => {
      if (source.is_interactive && source.courseData) {
        const courseData = escapeHtml(JSON.stringify(source.courseData));
        const embedId = `sim-embed-${Math.random().toString(36).slice(2, 11)}`;
        embedHtml += `<div id="${embedId}" class="interactive-chat-embed" data-course="${courseData}"></div>`;
        return `<button type="button" class="source-link interactive-source-link" data-course="${courseData}" style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; color: white;"><span style="color: #34a853;">🖱️</span> ${escapeHtml(source.document_title.replace('Interactive Guide: ', ''))}</button>`;
      }

      const fileUrl = source.file_url || '';
      const isYoutube = fileUrl.includes('youtube.com') || fileUrl.includes('youtu.be');
      if (isYoutube) {
        const match = fileUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
        if (match) {
          embedHtml += `<div style="margin-top: 20px; margin-bottom: 5px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);"><iframe width="100%" height="280" src="https://www.youtube.com/embed/${match[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        }
      }

      return `<button type="button" class="source-link web-source-link" data-url="${escapeHtml(fileUrl)}" style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; color: white;"><span style="color: #fbbc04;">${isYoutube ? '▶️' : '📄'}</span> ${escapeHtml(source.document_title)}</button>`;
    }).join('')}</div>`;
  }

  msgDiv.innerHTML = `<div style="display: flex; align-items: flex-start;"><div style="flex: 1; width: 100%;">${formattedContent}${embedHtml}${sourceHtml}</div></div>`;

  msgDiv.querySelectorAll('.interactive-chat-embed').forEach(async container => {
    try {
      const courseData = JSON.parse(container.dataset.course);
      const { renderSimulationPlayer } = await import('./views/components/SimulationPlayer.js');
      renderSimulationPlayer(courseData, user, container.id);
    } catch (error) {
      console.warn('Unable to restore interactive guide embed:', error);
    }
  });

  msgDiv.querySelectorAll('.interactive-source-link').forEach(button => {
    button.addEventListener('click', async event => {
      const courseData = JSON.parse(event.currentTarget.dataset.course);
      const { renderCoursePlayer } = await import('./views/CoursePlayer.js');
      renderCoursePlayer(courseData, user);
    });
  });

  msgDiv.querySelectorAll('.web-source-link').forEach(button => {
    button.addEventListener('click', event => {
      const url = event.currentTarget.dataset.url;
      if (!url) return;
      if (url.includes('/storage/')) {
        const iframe = document.getElementById('pdf-iframe');
        const modal = document.getElementById('pdf-modal');
        if (iframe && modal) {
          iframe.src = url;
          modal.style.display = 'flex';
        }
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  });

  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
};

const createLoadingIndicator = chatHistory => {
  const loading = document.createElement('div');
  loading.id = 'chat-loading';
  loading.innerHTML = '<span>Thinking...</span>';
  loading.style.alignSelf = 'flex-start';
  loading.style.color = 'var(--text-muted)';
  loading.style.padding = '1rem 0';
  loading.style.display = 'flex';
  loading.style.alignItems = 'center';
  chatHistory.appendChild(loading);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return loading;
};

const createControls = chatView => {
  chatView.querySelector('#guides-chat-controls')?.remove();

  const controls = document.createElement('div');
  controls.id = 'guides-chat-controls';
  controls.innerHTML = `
    <button id="guides-chat-history-btn" type="button" aria-expanded="false">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l3 2"></path></svg>
      <span>History</span>
    </button>
    <button id="new-guides-chat-btn" type="button">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
      <span>New chat</span>
    </button>
    <div id="guides-chat-history-panel" hidden></div>
  `;

  const chatHistory = chatView.querySelector('#chat-history');
  chatView.insertBefore(controls, chatHistory);
  return controls;
};

const renderConversationList = (panel, conversations, activeConversationId) => {
  if (!conversations.length) {
    panel.innerHTML = '<div class="guide-chat-history-empty">No saved chats yet.</div>';
    return;
  }

  panel.innerHTML = `
    <div class="guide-chat-history-heading">Chat history</div>
    <div class="guide-chat-history-list">
      ${conversations.slice(0, HISTORY_LIMIT).map(conversation => `
        <div class="guide-chat-history-item ${conversation.id === activeConversationId ? 'active' : ''}" data-id="${conversation.id}">
          <button type="button" class="guide-chat-history-open" data-id="${conversation.id}">
            <span class="guide-chat-history-title">${escapeHtml(conversation.title)}</span>
            <span class="guide-chat-history-date">${escapeHtml(relativeDate(conversation.updated_at))}</span>
          </button>
          <div class="guide-chat-history-actions">
            <button type="button" class="guide-chat-rename" data-id="${conversation.id}" data-title="${escapeHtml(conversation.title)}" aria-label="Rename chat" title="Rename">✎</button>
            <button type="button" class="guide-chat-delete" data-id="${conversation.id}" aria-label="Delete chat" title="Delete">×</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

export const initGuideChatHistory = async chatView => {
  if (!chatView || chatView.dataset.persistentChatReady === 'true') return () => {};
  chatView.dataset.persistentChatReady = 'true';

  const chatHistory = chatView.querySelector('#chat-history');
  const originalInput = chatView.querySelector('#chat-input');
  const originalSend = chatView.querySelector('#send-chat-btn');
  const suggestions = chatView.querySelector('#chat-suggestions');
  if (!chatHistory || !originalInput || !originalSend) return () => {};

  const user = await getCurrentUser();
  if (!user) return () => {};

  // Replace only the controls that own chat submission. This removes the old one-question
  // listeners without touching guide search, curation, source retrieval or OpenRouter calls.
  const input = originalInput.cloneNode(true);
  originalInput.replaceWith(input);
  const sendButton = originalSend.cloneNode(true);
  originalSend.replaceWith(sendButton);

  const suggestionButtons = Array.from(suggestions?.querySelectorAll('.suggestion-chip') || []).map(button => {
    const replacement = button.cloneNode(true);
    button.replaceWith(replacement);
    return replacement;
  });

  const controls = createControls(chatView);
  const historyButton = controls.querySelector('#guides-chat-history-btn');
  const newChatButton = controls.querySelector('#new-guides-chat-btn');
  const historyPanel = controls.querySelector('#guides-chat-history-panel');

  let activeConversationId = sessionStorage.getItem(ACTIVE_CHAT_KEY) || null;
  let messages = [];
  let conversations = [];
  let busy = false;
  let persistenceAvailable = true;
  let destroyed = false;

  const markPersistenceUnavailable = error => {
    if (!isMissingSchemaError(error)) return false;
    persistenceAvailable = false;
    activeConversationId = null;
    sessionStorage.removeItem(ACTIVE_CHAT_KEY);
    historyButton.disabled = true;
    historyButton.title = 'Chat history database setup is required in Supabase';
    console.warn('Chat history tables are not available yet. Chat will continue without persistence.');
    return true;
  };

  const refreshConversations = async () => {
    if (!persistenceAvailable) return [];
    try {
      conversations = await listChatConversations();
      renderConversationList(historyPanel, conversations, activeConversationId);
      return conversations;
    } catch (error) {
      if (!markPersistenceUnavailable(error)) console.error('Unable to load chat history:', error);
      return [];
    }
  };

  const renderMessages = async () => {
    const greeting = removeRenderedMessages(chatHistory);
    if (messages.length === 0) {
      if (greeting) greeting.style.display = 'flex';
      if (suggestions) suggestions.style.display = 'flex';
      return;
    }

    if (greeting) greeting.style.display = 'none';
    if (suggestions) suggestions.style.display = 'none';
    for (const message of messages) {
      await appendMessage(chatHistory, user, message.content, message.role === 'user', message.sources || []);
    }
  };

  const startNewChat = () => {
    if (busy) return;
    activeConversationId = null;
    messages = [];
    sessionStorage.removeItem(ACTIVE_CHAT_KEY);
    historyPanel.hidden = true;
    historyButton.setAttribute('aria-expanded', 'false');
    setEmptyState(chatHistory, suggestions, input);
    refreshConversations();
  };

  const openConversation = async conversationId => {
    if (busy || !persistenceAvailable) return;
    try {
      busy = true;
      sendButton.disabled = true;
      newChatButton.disabled = true;
      const loaded = await listChatMessages(conversationId);
      if (destroyed) return;
      activeConversationId = conversationId;
      messages = loaded;
      sessionStorage.setItem(ACTIVE_CHAT_KEY, conversationId);
      historyPanel.hidden = true;
      historyButton.setAttribute('aria-expanded', 'false');
      await renderMessages();
      await refreshConversations();
    } catch (error) {
      if (!markPersistenceUnavailable(error)) {
        console.error('Unable to reopen chat:', error);
        await fswAlert('This chat could not be opened. Please try again.');
      }
    } finally {
      busy = false;
      sendButton.disabled = false;
      newChatButton.disabled = false;
      input.focus();
    }
  };

  const persistMessage = async (role, content, sources = []) => {
    if (!persistenceAvailable || !activeConversationId) return null;
    try {
      return await addChatMessage(activeConversationId, role, content, sanitiseSources(sources));
    } catch (error) {
      if (!markPersistenceUnavailable(error)) console.error('Unable to save chat message:', error);
      return null;
    }
  };

  const ensureConversation = async firstQuestion => {
    if (activeConversationId || !persistenceAvailable) return activeConversationId;
    try {
      const conversation = await createChatConversation(cleanTitle(firstQuestion));
      activeConversationId = conversation.id;
      sessionStorage.setItem(ACTIVE_CHAT_KEY, conversation.id);
      conversations = [conversation, ...conversations.filter(item => item.id !== conversation.id)];
      return activeConversationId;
    } catch (error) {
      if (!markPersistenceUnavailable(error)) console.error('Unable to create chat conversation:', error);
      return null;
    }
  };

  const handleChat = async suppliedQuestion => {
    const question = String(suppliedQuestion ?? input.value).trim();
    if (!question || busy) return;

    busy = true;
    input.disabled = true;
    sendButton.disabled = true;
    newChatButton.disabled = true;
    historyButton.disabled = true;

    const greeting = chatHistory.querySelector('#chat-greeting');
    if (greeting) greeting.style.display = 'none';
    if (suggestions) suggestions.style.display = 'none';

    const previousMessages = [...messages];
    await ensureConversation(question);

    const userMessage = {
      role: 'user',
      content: question,
      sources: [],
      created_at: new Date().toISOString()
    };
    messages.push(userMessage);
    await appendMessage(chatHistory, user, question, true, []);
    input.value = '';
    await persistMessage('user', question, []);

    const loading = createLoadingIndicator(chatHistory);

    try {
      const contextualQuestion = buildContextualQuestion(question, previousMessages);
      const result = await chatWithGuides(contextualQuestion, previousMessages);
      loading.remove();

      const assistantMessage = {
        role: 'assistant',
        content: result.answer,
        sources: sanitiseSources(result.sources),
        created_at: new Date().toISOString()
      };
      messages.push(assistantMessage);
      await appendMessage(chatHistory, user, result.answer, false, result.sources);
      await persistMessage('assistant', result.answer, result.sources);
      await refreshConversations();
    } catch (error) {
      console.error(error);
      loading.remove();
      const fallback = "I'm sorry, I'm having trouble accessing the knowledge base right now. Please try again later.";
      messages.push({ role: 'assistant', content: fallback, sources: [] });
      await appendMessage(chatHistory, user, fallback, false, []);
      await persistMessage('assistant', fallback, []);
    } finally {
      busy = false;
      input.disabled = false;
      sendButton.disabled = false;
      newChatButton.disabled = false;
      historyButton.disabled = !persistenceAvailable;
      input.focus();
    }
  };

  const onSend = () => handleChat();
  const onKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleChat();
    }
  };
  const onNewChat = () => startNewChat();
  const onHistoryToggle = async () => {
    if (!persistenceAvailable) return;
    const opening = historyPanel.hidden;
    historyPanel.hidden = !opening;
    historyButton.setAttribute('aria-expanded', String(opening));
    if (opening) await refreshConversations();
  };

  sendButton.addEventListener('click', onSend);
  input.addEventListener('keydown', onKeyDown);
  newChatButton.addEventListener('click', onNewChat);
  historyButton.addEventListener('click', onHistoryToggle);

  suggestionButtons.forEach(button => {
    button.addEventListener('click', () => handleChat(button.innerText.trim()));
  });

  historyPanel.addEventListener('click', async event => {
    const openButton = event.target.closest('.guide-chat-history-open');
    if (openButton) {
      await openConversation(openButton.dataset.id);
      return;
    }

    const renameButton = event.target.closest('.guide-chat-rename');
    if (renameButton) {
      const currentTitle = renameButton.dataset.title || 'New chat';
      const nextTitle = window.prompt('Rename chat', currentTitle);
      if (!nextTitle?.trim()) return;
      try {
        await renameChatConversation(renameButton.dataset.id, nextTitle);
        await refreshConversations();
      } catch (error) {
        console.error('Unable to rename chat:', error);
        await fswAlert('This chat could not be renamed.');
      }
      return;
    }

    const deleteButton = event.target.closest('.guide-chat-delete');
    if (deleteButton) {
      if (!await fswConfirm('Delete this chat history? This cannot be undone.')) return;
      const deletingActive = deleteButton.dataset.id === activeConversationId;
      try {
        await deleteChatConversation(deleteButton.dataset.id);
        if (deletingActive) startNewChat();
        else await refreshConversations();
      } catch (error) {
        console.error('Unable to delete chat:', error);
        await fswAlert('This chat could not be deleted.');
      }
    }
  });

  // Restore the conversation the learner was using before navigating away.
  if (activeConversationId && persistenceAvailable) {
    try {
      messages = await listChatMessages(activeConversationId);
      if (messages.length > 0) await renderMessages();
      else startNewChat();
    } catch (error) {
      if (!markPersistenceUnavailable(error)) console.warn('Previous chat could not be restored:', error);
      startNewChat();
    }
  }

  await refreshConversations();

  return () => {
    destroyed = true;
    sendButton.removeEventListener('click', onSend);
    input.removeEventListener('keydown', onKeyDown);
    newChatButton.removeEventListener('click', onNewChat);
    historyButton.removeEventListener('click', onHistoryToggle);
  };
};
