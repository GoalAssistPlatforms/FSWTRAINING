// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const escalateQuestion = vi.fn();
const fetchAskableManagers = vi.fn();
const fetchMyQuestions = vi.fn();

vi.mock('./api/questions.js', () => ({
  escalateQuestion: (...args) => escalateQuestion(...args),
  fetchAskableManagers: (...args) => fetchAskableManagers(...args),
  fetchMyQuestions: (...args) => fetchMyQuestions(...args)
}));

const { createEscalationPanel, createManagerReplyWatcher, formatManagerReply } = await import('./guideChatEscalation.js');

const managers = [
  { id: 'mgr-1', full_name: 'Helen Shaw', avatar_url: 'https://example.test/helen.png', job_title: 'Operations Manager' },
  { id: 'mgr-2', full_name: 'Lindsay Bell', avatar_url: null, job_title: 'HR Manager' }
];

beforeEach(() => {
  escalateQuestion.mockReset();
  fetchAskableManagers.mockReset().mockResolvedValue(managers);
  fetchMyQuestions.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('manager escalation panel', () => {
  it('offers every manager as a picture button and waits for a choice', async () => {
    const panel = createEscalationPanel({ question: 'How do I book a company van?' });
    document.body.appendChild(panel);

    await vi.waitFor(() => expect(panel.querySelectorAll('.guide-escalation-manager')).toHaveLength(2));

    const [helen, lindsay] = panel.querySelectorAll('.guide-escalation-manager');
    expect(helen.querySelector('img').getAttribute('src')).toBe('https://example.test/helen.png');
    expect(helen.textContent).toContain('Helen Shaw');
    // Managers without a picture still get an avatar to click.
    expect(lindsay.querySelector('img').getAttribute('src')).toContain('ui-avatars.com');
    expect(panel.querySelector('.guide-escalation-send').disabled).toBe(true);
  });

  it('sends the question to the chosen manager and confirms it went', async () => {
    escalateQuestion.mockResolvedValue({ id: 'question-1' });
    const onEscalated = vi.fn();
    const panel = createEscalationPanel({
      question: 'How do I book a company van?',
      conversationId: 'conversation-9',
      onEscalated
    });
    document.body.appendChild(panel);

    await vi.waitFor(() => expect(panel.querySelectorAll('.guide-escalation-manager')).toHaveLength(2));

    panel.querySelectorAll('.guide-escalation-manager')[1].click();
    const sendButton = panel.querySelector('.guide-escalation-send');
    expect(sendButton.disabled).toBe(false);
    expect(sendButton.textContent).toBe('Send to Lindsay');

    sendButton.click();

    await vi.waitFor(() => expect(panel.textContent).toContain('Sent to Lindsay Bell'));
    expect(escalateQuestion).toHaveBeenCalledWith('How do I book a company van?', 'mgr-2', 'conversation-9');
    expect(onEscalated).toHaveBeenCalledWith({ id: 'question-1' });
  });

  it('keeps the panel usable when sending fails', async () => {
    escalateQuestion.mockRejectedValue(new Error('Network down'));
    const panel = createEscalationPanel({ question: 'Where is the fire assembly point?' });
    document.body.appendChild(panel);

    await vi.waitFor(() => expect(panel.querySelectorAll('.guide-escalation-manager')).toHaveLength(2));
    panel.querySelectorAll('.guide-escalation-manager')[0].click();
    panel.querySelector('.guide-escalation-send').click();

    await vi.waitFor(() => expect(panel.querySelector('.guide-escalation-feedback').textContent).toBe('Network down'));
    expect(panel.querySelector('.guide-escalation-send').disabled).toBe(false);
  });
});

describe('manager reply watcher', () => {
  it('matches the reply wording the database writes into the chat thread', () => {
    expect(formatManagerReply('Helen Shaw', ' Vans are booked through reception. '))
      .toBe('**Helen Shaw replied:**\n\nVans are booked through reception.');
  });

  it('surfaces a reply once, and only for the open chat', async () => {
    const onReply = vi.fn();
    const watcher = createManagerReplyWatcher({ onReply });

    fetchMyQuestions.mockResolvedValue([
      { id: 'q1', status: 'pending', conversation_id: 'conversation-9' }
    ]);
    await watcher.setConversation('conversation-9');
    expect(onReply).not.toHaveBeenCalled();

    fetchMyQuestions.mockResolvedValue([
      { id: 'q1', status: 'answered', conversation_id: 'conversation-9', manager_name: 'Helen Shaw', answer: 'Through reception.' },
      { id: 'q2', status: 'answered', conversation_id: 'another-chat', manager_name: 'Helen Shaw', answer: 'Not this one.' }
    ]);

    await watcher.check();
    await watcher.check();

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReply.mock.calls[0][0].id).toBe('q1');
    watcher.stop();
  });

  it('does not replay replies that were already in the loaded chat', async () => {
    const onReply = vi.fn();
    const watcher = createManagerReplyWatcher({ onReply });

    fetchMyQuestions.mockResolvedValue([
      { id: 'q1', status: 'answered', conversation_id: 'conversation-9', manager_name: 'Helen Shaw', answer: 'Through reception.' }
    ]);

    await watcher.setConversation('conversation-9');
    await watcher.check();

    expect(onReply).not.toHaveBeenCalled();
    watcher.stop();
  });
});
