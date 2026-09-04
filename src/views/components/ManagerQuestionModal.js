import { answerQuestion, fetchQuestion } from '../../api/questions.js';

const escapeHTML = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const MODAL_ID = 'manager-question-modal';

const modalHTML = (question) => `
    <div id="${MODAL_ID}" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 100001; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); padding: 1rem; box-sizing: border-box;">
        <div style="background: rgba(15, 23, 42, 0.97); border: 1px solid rgba(255,255,255,0.15); border-radius: var(--radius-lg, 16px); width: 100%; max-width: 560px; padding: 1.5rem; box-shadow: 0 20px 50px rgba(0,0,0,0.5); box-sizing: border-box; max-height: 90vh; overflow-y: auto;">
            <h3 style="margin: 0 0 0.35rem 0; color: #fff; font-size: 1.15rem;">Answer this question</h3>
            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">
                Asked by ${escapeHTML(question.asker_name || 'a team member')} &middot; ${escapeHTML(new Date(question.created_at).toLocaleString())}
            </div>

            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-left: 3px solid var(--primary, #3b82f6); border-radius: 8px; padding: 0.85rem 1rem; color: rgba(255,255,255,0.9); font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.25rem; white-space: pre-wrap;">${escapeHTML(question.question)}</div>

            <label for="manager-answer-input" style="display: block; color: rgba(255,255,255,0.85); font-size: 0.85rem; font-weight: 600; margin-bottom: 0.4rem;">Your answer</label>
            <textarea id="manager-answer-input" rows="6" placeholder="Write the answer this person should see..." style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 0.75rem; color: white; font: inherit; font-size: 0.95rem; line-height: 1.5; resize: vertical; outline: none;"></textarea>

            <label style="display: flex; gap: 0.65rem; align-items: flex-start; margin-top: 1rem; cursor: pointer;">
                <input type="checkbox" id="manager-answer-save-kb" checked style="margin-top: 3px; width: 16px; height: 16px; accent-color: var(--primary, #3b82f6); cursor: pointer;">
                <span>
                    <span style="display: block; color: white; font-size: 0.9rem; font-weight: 600;">Save this answer to the knowledge base</span>
                    <span style="display: block; color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;">The assistant will use it to answer the same question for anyone. Untick this if the answer is sensitive or only for this person.</span>
                </span>
            </label>

            <div id="manager-answer-error" style="display: none; color: #fca5a5; font-size: 0.85rem; margin-top: 0.85rem;"></div>

            <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem;">
                <button type="button" id="manager-answer-cancel" style="background: transparent; border: 1px solid rgba(255,255,255,0.12); color: var(--text-muted); padding: 0.55rem 1.1rem; border-radius: 8px; font: inherit; font-size: 0.9rem; cursor: pointer;">Cancel</button>
                <button type="button" id="manager-answer-send" class="btn-primary" style="padding: 0.55rem 1.25rem; min-width: 130px;">Send answer</button>
            </div>
        </div>
    </div>
`;

/**
 * Opens the reply dialog for a question a learner forwarded from the guides chat.
 *
 * @param {object|string} questionOrId The question record, or its id.
 * @returns {Promise<object|null>} The answer result, or null when the manager cancels.
 */
export const openManagerQuestionModal = async (questionOrId) => {
  const question = typeof questionOrId === 'string' ? await fetchQuestion(questionOrId) : questionOrId;

  if (!question) {
    const { fswAlert } = await import('../../utils/dialog.js');
    await fswAlert('That question could not be found. It may have been removed.');
    return null;
  }

  if (question.status === 'answered') {
    const { fswAlert } = await import('../../utils/dialog.js');
    await fswAlert(`This question has already been answered${question.manager_name ? ` by ${question.manager_name}` : ''}.`);
    return null;
  }

  document.getElementById(MODAL_ID)?.remove();
  document.body.insertAdjacentHTML('beforeend', modalHTML(question));

  const overlay = document.getElementById(MODAL_ID);
  const input = overlay.querySelector('#manager-answer-input');
  const saveToKb = overlay.querySelector('#manager-answer-save-kb');
  const errorBox = overlay.querySelector('#manager-answer-error');
  const cancelBtn = overlay.querySelector('#manager-answer-cancel');
  const sendBtn = overlay.querySelector('#manager-answer-send');

  input.focus();

  return new Promise(resolve => {
    let sending = false;

    const close = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
      resolve(result);
    };

    const showError = message => {
      errorBox.textContent = message;
      errorBox.style.display = 'block';
    };

    const onKeyDown = event => {
      if (event.key === 'Escape' && !sending) close(null);
    };

    const send = async () => {
      const answer = input.value.trim();
      if (!answer) {
        showError('Please write an answer before sending.');
        input.focus();
        return;
      }

      sending = true;
      sendBtn.disabled = true;
      cancelBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
      errorBox.style.display = 'none';

      try {
        const result = await answerQuestion(question.id, answer, saveToKb.checked);

        if (saveToKb.checked && !result.savedToKnowledgeBase) {
          const { fswAlert } = await import('../../utils/dialog.js');
          await fswAlert('Your answer was sent, but it could not be added to the knowledge base. You can add it manually from Guides & Policies.');
        }

        close(result);
      } catch (error) {
        console.error('Unable to send the answer:', error);
        sending = false;
        sendBtn.disabled = false;
        cancelBtn.disabled = false;
        sendBtn.textContent = 'Send answer';
        showError(error?.message || 'That answer could not be sent. Please try again.');
      }
    };

    sendBtn.addEventListener('click', send);
    cancelBtn.addEventListener('click', () => !sending && close(null));
    overlay.addEventListener('click', event => {
      if (event.target === overlay && !sending) close(null);
    });
    document.addEventListener('keydown', onKeyDown);
  });
};
