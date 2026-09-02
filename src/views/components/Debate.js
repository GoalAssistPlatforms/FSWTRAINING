import { chatWithDebater } from '../../api/ai.js';
import { generateChatAudio } from '../../api/elevenlabs.js';

const meetingIcon = (name) => {
    const icons = {
        lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>',
        mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>',
        micOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9V6a3 3 0 0 0-5.9-.8M5 11a7 7 0 0 0 11.8 5.1M12 18v3M9 21h6M4 4l16 16"></path></svg>',
        video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"></rect><path d="m16 10 5-3v10l-5-3z"></path></svg>',
        people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M3.5 19c.5-3.5 2.4-5.3 5.5-5.3s5 1.8 5.5 5.3"></path><path d="M14 14.8c3.5-.4 5.6 1 6.5 4.2"></path></svg>',
        chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 3z"></path></svg>',
        send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-8-8 18-2-8z"></path><path d="m11 13 10-10"></path></svg>',
        cameraOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11a2 2 0 0 1 2 2v7H5a2 2 0 0 1-2-2z"></path><path d="m16 10 5-3v9l-5-3"></path><path d="M4 4l16 16"></path></svg>'
    };
    return icons[name] || '';
};

export function renderDebate(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { topic, aiSide = 'devil_advocate', stakeholderName = 'Colleague' } = config;

    let messages = [];
    let outcomesMetCount = 0;
    let failedAttemptsOnCurrentPoint = 0;
    let isAudioEnabled = true;
    let currentAudio = null;
    let activityCompletionDispatched = false;
    const TOTAL_OUTCOMES = 3;

    container.innerHTML = `
        <style>
            .zoom-btn { display: flex; flex-direction: column; align-items: center; cursor: pointer; color: #a3a3a3; font-size: 0.75rem; gap: 4px; transition: color 0.2s; }
            .zoom-btn:hover { color: white; }
            .zoom-btn svg, .debate-send svg, .meeting-security-icon svg, .meeting-self-icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
            .meeting-security-icon { display: inline-flex; width: 16px; height: 16px; margin-right: 5px; color: #4ade80; vertical-align: middle; }
            .meeting-security-icon svg { width: 16px; height: 16px; }
            .meeting-self-icon { display: inline-flex; color: #cbd5e1; }
            @keyframes ai-pulse {
                0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); border-color: rgba(34, 197, 94, 0.8); }
                70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); border-color: rgba(34, 197, 94, 0); }
                100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); border-color: rgba(34, 197, 94, 0); }
            }
            .ai-speaking { animation: ai-pulse 1.5s infinite; }
            .cc-text {
                background: rgba(0,0,0,0.6);
                padding: 8px 16px;
                border-radius: 8px;
                display: inline-block;
            }
        </style>
        <div class="debate-container fade-in" style="display: flex; flex-direction: column; height: 650px; background: #111; border-radius: var(--radius-lg); overflow: hidden; color: white; position: relative; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <div style="background: #222; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; border-bottom: 1px solid #333; z-index: 10;">
                <div><span class="meeting-security-icon">${meetingIcon('lock')}</span>End to end encrypted</div>
                <div style="font-weight: 600;">Meeting: ${topic}</div>
                <div id="debate-progress-${containerId}" style="display: none; flex-direction: row; gap: 4px;" aria-label="Challenge progress">
                    ${Array(TOTAL_OUTCOMES).fill(0).map((_, i) => `<div id="node-${i}-${containerId}" style="width: 20px; height: 4px; border-radius: 2px; background: #333;"></div>`).join('')}
                </div>
            </div>

            <div id="stance-phase-${containerId}" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1.5rem; background: #1a1a1a;">
                <div style="text-align: center; max-width: 650px;">
                    <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 10px;">Meeting waiting room</div>
                    <h2 style="margin: 0 0 10px 0;">Ready to join?</h2>
                    <p style="color: #e2e8f0; margin: 0 0 12px 0; font-size: 1.05rem; line-height: 1.5;">${topic}</p>
                    <p style="color: #a3a3a3; margin: 0; font-size: 0.95rem; line-height: 1.5;">You are about to join a short meeting with ${stakeholderName}. Listen to their opening point, then respond exactly as you would in a real conversation.</p>
                </div>
                <div style="display: flex; width: 100%; max-width: 280px;">
                    <button class="join-call-btn" id="join-${containerId}" style="width: 100%; padding: 1rem 1.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; background: #2563eb; color: white; border: none; font-size: 1rem;">
                        Join the call
                    </button>
                </div>
            </div>

            <div id="cinematic-${containerId}" style="flex: 1; display: none; flex-direction: column; position: relative;">
                <div style="flex: 1; position: relative; background: linear-gradient(rgba(15,23,42,0.7), rgba(15,23,42,0.9)), url('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80'); background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                    <div style="position: absolute; top: 1rem; right: 1rem; width: 160px; height: 100px; background: #000; border: 1px solid #333; border-radius: 6px; display: flex; flex-direction: column; justify-content: flex-end; padding: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
                        <div style="background: rgba(0,0,0,0.6); padding: 2px 6px; font-size: 0.75rem; border-radius: 4px; align-self: flex-start; display: flex; align-items: center; gap: 4px;">
                            <span class="meeting-self-icon">${meetingIcon('cameraOff')}</span> You
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <div id="ai-avatar-ring-${containerId}" style="width: 160px; height: 160px; border-radius: 50%; background: #252a35; border: 3px solid transparent; transition: all 0.3s; box-shadow: 0 10px 25px rgba(0,0,0,0.5);"></div>
                    </div>

                    <div style="position: absolute; bottom: 1.5rem; left: 1.5rem; background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 6px; font-size: 0.95rem; font-weight: 500; display: flex; align-items: center; gap: 8px;">
                        ${meetingIcon('mic')} ${stakeholderName}
                    </div>

                    <div style="position: absolute; bottom: 20%; width: 100%; text-align: center; padding: 0 15%; box-sizing: border-box; pointer-events: none;">
                        <div id="subtitle-text-${containerId}" class="cc-text" style="font-size: 1.4rem; line-height: 1.5; font-weight: 500; opacity: 0; transition: opacity 0.3s;"></div>
                    </div>
                    <div id="hint-text-${containerId}" style="position: absolute; top: 1rem; left: 1rem; background: rgba(245, 158, 11, 0.9); color: #000; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; display: none;"></div>
                </div>

                <div id="input-${containerId}" style="position: absolute; bottom: 1.5rem; left: 50%; transform: translateX(-50%); width: 60%; background: rgba(30, 41, 59, 0.9); backdrop-filter: blur(10px); border-radius: 24px; padding: 8px 16px; display: none; align-items: flex-end; gap: 8px; border: 1px solid #475569; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <textarea class="debate-input" placeholder="Type message to meeting..." rows="1" style="flex: 1; background: transparent; border: none; color: white; padding: 8px 0; outline: none; font-size: 1rem; resize: none; font-family: inherit; line-height: 1.5; max-height: 120px; overflow-y: hidden;"></textarea>
                    <button class="debate-send" aria-label="Send message" style="background: transparent; color: #3b82f6; border: none; padding: 8px; cursor: pointer; margin-bottom: 2px;">${meetingIcon('send')}</button>
                </div>
            </div>

            <div id="complete-${containerId}" style="flex: 1; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1rem; text-align: center; overflow-y: auto; background: #111;">
                <div id="verdict-icon-${containerId}" style="font-size: 3rem; margin-bottom: -10px;"></div>
                <h3 id="verdict-title-${containerId}" style="font-size: 1.5rem; margin: 0; color: white;">Meeting Ended</h3>
                <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 500px; text-align: left; margin-top: 1rem;">
                    <div style="display:flex; justify-content: space-between; align-items:center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 1rem;">
                        <span style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; color:#94a3b8;">Performance Score</span>
                        <span id="debate-score-${containerId}" style="font-size: 1.5rem; font-weight: 800; color: #f59e0b;">0/100</span>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #4ade80; margin-bottom: 4px; font-weight: 600;">Strengths</div>
                        <div id="debate-strongest-${containerId}" style="font-size: 0.95rem; line-height: 1.5; color: #cbd5e1;">...</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #f87171; margin-bottom: 4px; font-weight: 600;">Areas for Improvement</div>
                        <div id="debate-weakness-${containerId}" style="font-size: 0.95rem; line-height: 1.5; color: #cbd5e1;">...</div>
                    </div>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                    <button id="restart-btn-${containerId}" style="background: transparent; color: #f59e0b; border: 1px solid #f59e0b; padding: 12px 32px; font-weight: 800; border-radius: 24px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; font-size: 0.9rem; display: none;">Restart Activity</button>
                </div>
            </div>

            <div id="control-bar-${containerId}" style="height: 60px; background: #1e1e1e; display: none; justify-content: space-between; align-items: center; padding: 0 1.5rem; border-top: 1px solid #333;">
                <div style="display: flex; gap: 1.5rem;">
                    <div class="zoom-btn" id="audio-toggle-${containerId}" role="button" tabindex="0" style="color: #fff;">
                        <span id="audio-icon-${containerId}">${meetingIcon('mic')}</span>
                        <span id="audio-label-${containerId}">Mute Audio</span>
                    </div>
                    <div class="zoom-btn" role="button" tabindex="0"><span>${meetingIcon('video')}</span><span>Stop Video</span></div>
                </div>
                <div style="display: flex; gap: 2rem;">
                    <div class="zoom-btn" role="button" tabindex="0"><span>${meetingIcon('people')}</span><span>Participants</span></div>
                    <div class="zoom-btn" role="button" tabindex="0"><span>${meetingIcon('chat')}</span><span>Chat</span></div>
                </div>
                <div><button id="leave-call-${containerId}" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;">Leave</button></div>
            </div>
        </div>
    `;

    const stancePhase = container.querySelector(`#stance-phase-${containerId}`);
    const cinematicArea = container.querySelector(`#cinematic-${containerId}`);
    const completeArea = container.querySelector(`#complete-${containerId}`);
    const inputBar = container.querySelector(`#input-${containerId}`);
    const controlBar = container.querySelector(`#control-bar-${containerId}`);
    const input = inputBar.querySelector('textarea');
    const sendBtn = inputBar.querySelector('.debate-send');
    const progressEl = container.querySelector(`#debate-progress-${containerId}`);
    const restartBtn = container.querySelector(`#restart-btn-${containerId}`);
    const leaveBtn = container.querySelector(`#leave-call-${containerId}`);
    const audioToggle = container.querySelector(`#audio-toggle-${containerId}`);
    const subtitleText = container.querySelector(`#subtitle-text-${containerId}`);
    const hintText = container.querySelector(`#hint-text-${containerId}`);
    const avatarRing = container.querySelector(`#ai-avatar-ring-${containerId}`);

    input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = `${this.scrollHeight}px`;
    });

    const updateProgress = (outcomes = {}) => {
        const values = [outcomes.correct_position, outcomes.sound_reasoning, outcomes.handled_pushback];
        outcomesMetCount = values.filter(Boolean).length;
        progressEl.style.display = 'flex';
        for (let i = 0; i < TOTAL_OUTCOMES; i++) {
            const node = container.querySelector(`#node-${i}-${containerId}`);
            if (!node) continue;
            if (values[i]) {
                node.style.background = '#22c55e';
                node.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.5)';
            } else {
                node.style.background = '#333';
                node.style.boxShadow = 'none';
            }
        }
    };

    const toggleAudio = () => {
        isAudioEnabled = !isAudioEnabled;
        const icon = container.querySelector(`#audio-icon-${containerId}`);
        const label = container.querySelector(`#audio-label-${containerId}`);
        if (isAudioEnabled) {
            icon.innerHTML = meetingIcon('mic');
            label.textContent = 'Mute Audio';
            audioToggle.style.color = '#fff';
        } else {
            icon.innerHTML = meetingIcon('micOff');
            label.textContent = 'Unmute Audio';
            audioToggle.style.color = '#a3a3a3';
            if (currentAudio) currentAudio.pause();
        }
    };
    audioToggle.addEventListener('click', toggleAudio);
    audioToggle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleAudio();
        }
    });

    const playAiAudio = async (text) => {
        if (!isAudioEnabled) return;
        try {
            const cleanText = text.replace(/\[SUCCESS\]|\[FAILED\]/g, '').trim();
            const audioUrl = await generateChatAudio(cleanText);
            if (audioUrl) {
                currentAudio = new Audio(audioUrl);
                currentAudio.play().catch(e => console.error('Audio play failed:', e));
            }
        } catch (e) {
            console.error('Failed to generate audio:', e);
        }
    };

    const setSubtitle = (text, isThinking = false) => {
        if (isThinking) {
            subtitleText.innerHTML = '<span style="color: #94a3b8; font-style: italic;">...</span>';
            subtitleText.style.opacity = '1';
            avatarRing.classList.add('ai-speaking');
            return;
        }
        if (!text) {
            subtitleText.style.opacity = '0';
            avatarRing.classList.remove('ai-speaking');
            return;
        }
        subtitleText.textContent = text;
        subtitleText.style.opacity = '1';
        avatarRing.classList.remove('ai-speaking');
        playAiAudio(text);
    };

    const showCompletion = (feedback, failed = false) => {
        if (currentAudio) currentAudio.pause();
        cinematicArea.style.display = 'none';
        controlBar.style.display = 'none';
        progressEl.style.display = 'none';

        const verdictIcon = container.querySelector(`#verdict-icon-${containerId}`);
        const verdictTitle = container.querySelector(`#verdict-title-${containerId}`);

        verdictIcon.textContent = failed ? 'Challenge not completed' : 'Challenge completed';
        verdictIcon.style.fontSize = '0.82rem';
        verdictIcon.style.textTransform = 'uppercase';
        verdictIcon.style.letterSpacing = '0.08em';
        verdictIcon.style.color = failed ? '#ef4444' : '#10b981';

        if (failed) {
            verdictTitle.textContent = 'Meeting Ended: Challenge Failed';
            verdictTitle.style.color = '#ef4444';
        } else {
            verdictTitle.textContent = 'Meeting Ended: Challenge Passed';
            verdictTitle.style.color = '#10b981';
            if (!activityCompletionDispatched) {
                activityCompletionDispatched = true;
                container.dispatchEvent(new CustomEvent('lesson-activity-complete', { bubbles: true, composed: true }));
            }
        }

        restartBtn.style.display = 'block';

        if (feedback) {
            const scoreEl = container.querySelector(`#debate-score-${containerId}`);
            const strongEl = container.querySelector(`#debate-strongest-${containerId}`);
            const weakEl = container.querySelector(`#debate-weakness-${containerId}`);
            if (scoreEl) {
                scoreEl.textContent = `${feedback.score}/100`;
                scoreEl.style.color = feedback.score >= 75 ? '#10b981' : '#ef4444';
            }
            if (strongEl) strongEl.textContent = feedback.strongest_argument || 'No clear strength noted.';
            if (weakEl) weakEl.textContent = feedback.weakness || 'No obvious weaknesses noted.';
        }
        completeArea.style.display = 'flex';
    };

    const restoreInput = () => {
        inputBar.style.display = 'flex';
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    };

    const startMeeting = async () => {
        stancePhase.style.display = 'none';
        cinematicArea.style.display = 'flex';
        controlBar.style.display = 'flex';
        inputBar.style.display = 'none';
        messages = [];
        outcomesMetCount = 0;
        failedAttemptsOnCurrentPoint = 0;
        updateProgress({});

        try {
            setSubtitle('', true);
            const openingCue = [{
                role: 'user',
                content: `The meeting has just started. This is a stage direction, not something the learner said. Open the meeting in character with a brief natural greeting. Then state your own view in favour of the proposed shortcut described by this topic: "${topic}". Explain it conversationally in one or two sentences and ask the learner what they think. Do not imply that the learner has already expressed a position, and do not award any learner outcomes yet.`
            }];
            const responseData = await chatWithDebater(openingCue, topic, config.persona || aiSide, 0, 0);
            const reply = responseData?.reply || `Hi, thanks for joining. I wanted to talk about ${topic}. I think it could help us move this forward more quickly. What do you think?`;
            setSubtitle(reply);
            messages = [{ role: 'assistant', content: reply }];
            updateProgress({});
        } catch (e) {
            console.error('Failed to generate opening:', e);
            const fallbackReply = `Hi, thanks for joining. I wanted to talk about ${topic}. I think it could help us move this forward more quickly. What do you think?`;
            setSubtitle(fallbackReply);
            messages = [{ role: 'assistant', content: fallbackReply }];
            updateProgress({});
        }
        restoreInput();
    };

    const handleSend = async () => {
        const val = input.value.trim();
        if (!val || input.disabled) return;

        input.value = '';
        input.style.height = 'auto';
        input.disabled = true;
        sendBtn.disabled = true;
        hintText.style.display = 'none';
        inputBar.style.display = 'none';
        messages.push({ role: 'user', content: val });

        try {
            setSubtitle('', true);
            const responseData = await chatWithDebater(messages, topic, config.persona || aiSide, outcomesMetCount, failedAttemptsOnCurrentPoint);
            const { reply, outcomes_met, completed, failed_state, hint, final_feedback } = responseData;
            setSubtitle(reply);
            messages.push({ role: 'assistant', content: reply });

            const previousCount = outcomesMetCount;
            updateProgress(outcomes_met);
            failedAttemptsOnCurrentPoint = outcomesMetCount > previousCount ? 0 : failedAttemptsOnCurrentPoint + 1;

            if (failed_state) {
                setTimeout(() => showCompletion(final_feedback, true), 2500);
                return;
            }
            if (completed) {
                setTimeout(() => showCompletion(final_feedback, false), 2500);
                return;
            }
            if (hint) {
                hintText.textContent = `Hint: ${hint}`;
                hintText.style.display = 'block';
            }
            restoreInput();
        } catch (e) {
            console.error('Debate failed:', e);
            setSubtitle('I lost your last point. Could you restate it?');
            restoreInput();
        }
    };

    const resetActivity = () => {
        if (currentAudio) currentAudio.pause();
        messages = [];
        outcomesMetCount = 0;
        failedAttemptsOnCurrentPoint = 0;
        completeArea.style.display = 'none';
        stancePhase.style.display = 'flex';
        cinematicArea.style.display = 'none';
        controlBar.style.display = 'none';
        inputBar.style.display = 'none';
        progressEl.style.display = 'none';
        input.value = '';
        input.disabled = false;
        sendBtn.disabled = false;
    };

    container.querySelector(`#join-${containerId}`).addEventListener('click', startMeeting);
    restartBtn.addEventListener('click', resetActivity);
    leaveBtn.addEventListener('click', () => {
        showCompletion({ score: 0, strongest_argument: 'None', weakness: 'You left the meeting before resolving the issue.' }, true);
    });
    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
}
