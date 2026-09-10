// "Ask a manager" panel shown under a chat answer the knowledge base could not give, plus
// the watcher that drops the manager's reply back into the learner's chat when it arrives.

import { escalateQuestion, fetchAskableManagers, fetchMyQuestions } from './api/questions.js';

const STYLE_ID = 'guide-chat-escalation-styles';
const POLL_INTERVAL_MS = 25000;

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const managerDisplayName = manager => manager?.full_name?.trim() || manager?.email || 'Manager';

export const managerAvatarUrl = manager => manager?.avatar_url
  || `https://ui-avatars.com/api/?name=${encodeURIComponent(managerDisplayName(manager))}&background=random`;

/**
 * The wording used for a manager's reply in the chat thread. answer_guide_question() builds
 * the same string when it stores the reply, so a live reply and a reloaded chat match.
 */
export const formatManagerReply = (managerName, answer) =>
  `**${managerName || 'Your manager'} replied:**\n\n${String(answer || '').trim()}`;

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .guide-escalation-panel {
      align-self: flex-start;
      width: 100%;
      max-width: 640px;
      margin: 0.25rem 0 1rem;
      padding: 1rem 1.15rem;
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      background: rgba(30, 31, 32, 0.6);
      color: #e5e7eb;
      font-size: 0.92rem;
      line-height: 1.5;
    }

    .guide-escalation-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      color: white;
      margin-bottom: 0.25rem;
    }

    .guide-escalation-title svg {
      width: 17px;
      height: 17px;
      flex-shrink: 0;
      color: var(--primary, #3b82f6);
    }

    .guide-escalation-hint {
      color: #a5adba;
      margin-bottom: 0.9rem;
    }

    .guide-escalation-managers {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 0.9rem;
    }

    .guide-escalation-manager {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      width: 84px;
      padding: 0.5rem 0.25rem;
      border: 1px solid transparent;
      border-radius: 14px;
      background: transparent;
      color: #cbd5e1;
      font: inherit;
      font-size: 0.75rem;
      text-align: center;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
    }

    .guide-escalation-manager img {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(255, 255, 255, 0.18);
      transition: border-color 0.2s, transform 0.2s;
    }

    .guide-escalation-manager:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.06);
      color: white;
    }

    .guide-escalation-manager:hover:not(:disabled) img {
      transform: translateY(-1px);
    }

    .guide-escalation-manager:focus-visible {
      outline: 2px solid var(--primary, #3b82f6);
      outline-offset: 2px;
    }

    .guide-escalation-manager[aria-pressed="true"] {
      background: rgba(59, 130, 246, 0.14);
      border-color: rgba(59, 130, 246, 0.5);
      color: white;
    }

    .guide-escalation-manager[aria-pressed="true"] img {
      border-color: var(--primary, #3b82f6);
    }

    .guide-escalation-manager-name {
      display: block;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .guide-escalation-manager-role {
      display: block;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.68rem;
      color: #8b95a5;
    }

    .guide-escalation-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    .guide-escalation-send,
    .guide-escalation-dismiss {
      padding: 0.5rem 1rem;
      border-radius: 999px;
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, background 0.2s, border-color 0.2s;
    }

    .guide-escalation-send {
      border: 1px solid var(--primary, #3b82f6);
      background: var(--primary, #3b82f6);
      color: white;
    }

    .guide-escalation-dismiss {
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: transparent;
      color: #a5adba;
    }

    .guide-escalation-dismiss:hover {
      background: rgba(255, 255, 255, 0.06);
      color: white;
    }

    .guide-escalation-send:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .guide-escalation-status {
      margin-top: 0.6rem;
      font-size: 0.85rem;
      color: #a5adba;
    }

    .guide-escalation-status.is-error {
      color: #fca5a5;
    }

    .guide-escalation-sent {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      color: #6ee7b7;
      font-weight: 600;
    }

    .guide-escalation-sent img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(16, 185, 129, 0.5);
    }

    @media (max-width: 640px) {
      .guide-escalation-manager {
        width: 72px;
      }

      .guide-escalation-manager img {
        width: 42px;
        height: 42px;
      }
    }
  `;

  document.head.appendChild(style);
};

const questionIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>';

/**
 * Builds the panel offering to forward an unanswered question to a manager.
 *
 * @param {object} options
 * @param {string} options.question   The learner's original question.
 * @param {string|null} options.conversationId  Chat thread the question came from.
 * @param {(record: object) => void} [options.onEscalated] Called once the question is sent.
 * @returns {HTMLElement}
 */
export const createEscalationPanel = ({ question, conversationId = null, onEscalated } = {}) => {
  ensureStyles();

  const panel = document.createElement('div');
  panel.className = 'guide-escalation-panel';
  panel.dataset.escalationPanel = 'true';
  panel.innerHTML = `
    <div class="guide-escalation-title">${questionIcon}<span>Ask a manager instead?</span></div>
    <div class="guide-escalation-hint">Nobody has added this to the knowledge base yet. Pick who should answer it and we will bring their reply back to this chat.</div>
    <div class="guide-escalation-managers" role="group" aria-label="Choose a manager">
      <span class="guide-escalation-status">Loading managers...</span>
    </div>
    <div class="guide-escalation-actions" hidden>
      <button type="button" class="guide-escalation-send" disabled>Send question</button>
      <button type="button" class="guide-escalation-dismiss">No thanks</button>
    </div>
    <div class="guide-escalation-status guide-escalation-feedback" hidden></div>
  `;

  const managerList = panel.querySelector('.guide-escalation-managers');
  const actions = panel.querySelector('.guide-escalation-actions');
  const sendButton = panel.querySelector('.guide-escalation-send');
  const dismissButton = panel.querySelector('.guide-escalation-dismiss');
  const status = panel.querySelector('.guide-escalation-feedback');

  let selectedManager = null;
  let sending = false;

  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
    status.hidden = !message;
  };

  const selectManager = (manager, button) => {
    selectedManager = manager;
    managerList.querySelectorAll('.guide-escalation-manager').forEach(item => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    sendButton.disabled = false;
    sendButton.textContent = `Send to ${managerDisplayName(manager).split(' ')[0]}`;
    showStatus('');
  };

  const renderManagers = managers => {
    if (!managers.length) {
      managerList.innerHTML = '<span class="guide-escalation-status">No managers are set up to take questions yet.</span>';
      return;
    }

    managerList.innerHTML = managers.map(manager => `
      <button type="button" class="guide-escalation-manager" aria-pressed="false" data-id="${escapeHtml(manager.id)}" title="Send this question to ${escapeHtml(managerDisplayName(manager))}">
        <img src="${escapeHtml(managerAvatarUrl(manager))}" alt="${escapeHtml(managerDisplayName(manager))}">
        <span class="guide-escalation-manager-name">${escapeHtml(managerDisplayName(manager))}</span>
        ${manager.job_title ? `<span class="guide-escalation-manager-role">${escapeHtml(manager.job_title)}</span>` : ''}
      </button>
    `).join('');

    managerList.querySelectorAll('.guide-escalation-manager').forEach(button => {
      const manager = managers.find(item => item.id === button.dataset.id);
      button.addEventListener('click', () => selectManager(manager, button));
    });

    actions.hidden = false;
  };

  const send = async () => {
    if (!selectedManager || sending) return;
    sending = true;
    sendButton.disabled = true;
    dismissButton.disabled = true;
    showStatus('Sending...');

    try {
      const record = await escalateQuestion(question, selectedManager.id, conversationId);
      const name = managerDisplayName(selectedManager);
      panel.innerHTML = `
        <div class="guide-escalation-sent">
          <img src="${escapeHtml(managerAvatarUrl(selectedManager))}" alt="${escapeHtml(name)}">
          <span>Sent to ${escapeHtml(name)}</span>
        </div>
        <div class="guide-escalation-status">They have been notified. Their reply will appear here in this chat.</div>
      `;
      onEscalated?.(record);
    } catch (error) {
      console.error('Unable to send the question to a manager:', error);
      sending = false;
      sendButton.disabled = false;
      dismissButton.disabled = false;
      showStatus(error?.message || 'That question could not be sent. Please try again.', true);
    }
  };

  sendButton.addEventListener('click', send);
  dismissButton.addEventListener('click', () => panel.remove());

  // Fetched per panel rather than cached, so a change of manager shows up without a reload.
  fetchAskableManagers()
    .then(renderManagers)
    .catch(error => {
      console.error('Unable to load managers:', error);
      managerList.innerHTML = '<span class="guide-escalation-status is-error">Managers could not be loaded right now.</span>';
    });

  return panel;
};

/**
 * Watches for managers answering this learner's forwarded questions so the reply can be
 * appended to the open chat without a refresh.
 *
 * @param {object} options
 * @param {(question: object) => void} options.onReply
 * @param {number} [options.intervalMs]
 */
export const createManagerReplyWatcher = ({ onReply, intervalMs = POLL_INTERVAL_MS } = {}) => {
  const seen = new Set();
  const tracked = new Set();
  let conversationId = null;
  let timer = null;
  let checking = false;
  let stopped = false;

  const relevant = record => (conversationId
    ? record.conversation_id === conversationId
    : tracked.has(record.id));

  const check = async () => {
    if (checking || stopped) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    checking = true;
    try {
      const questions = await fetchMyQuestions(conversationId);
      questions
        .filter(record => record.status === 'answered' && !seen.has(record.id) && relevant(record))
        .forEach(record => {
          seen.add(record.id);
          onReply?.(record);
        });
    } catch (error) {
      console.warn('Could not check for manager replies:', error);
    } finally {
      checking = false;
    }
  };

  const start = () => {
    if (timer || stopped || typeof setInterval !== 'function') return;
    timer = setInterval(check, intervalMs);
  };

  return {
    /**
     * Point the watcher at a chat thread. Replies already in the loaded transcript are
     * marked as seen so they are not appended a second time.
     */
    setConversation: async (id) => {
      conversationId = id || null;
      try {
        const questions = await fetchMyQuestions(conversationId);
        questions.filter(record => record.status === 'answered').forEach(record => seen.add(record.id));
      } catch (error) {
        console.warn('Could not load forwarded questions:', error);
      }
      start();
    },
    /** Follow a question sent from this session, even before the chat thread is saved. */
    track: (questionId) => {
      if (questionId) tracked.add(questionId);
      start();
    },
    check,
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
};
