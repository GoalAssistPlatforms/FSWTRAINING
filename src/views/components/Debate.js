import { chatWithDebater } from '../../api/ai.js';
import { generateChatAudio } from '../../api/elevenlabs.js';

export function renderDebate(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { topic, aiSide = 'devil_advocate', stances, stakeholderName = 'Colleague' } = config;

    // State
    let userStance = null;
    let messages = [];
    let pointsDiscussed = 0;
    let failedAttemptsOnCurrentPoint = 0;
    let isAudioEnabled = false;
    let currentAudio = null;
    const TOTAL_POINTS = 5;

    const [stanceA, stanceB] = stances && stances.length === 2 ? stances : ['Defend Policy', 'Allow Shortcut'];

    container.innerHTML = `
        <style>
            .zoom-btn { display: flex; flex-direction: column; align-items: center; cursor: pointer; color: #a3a3a3; font-size: 0.75rem; gap: 4px; transition: color 0.2s; }
            .zoom-btn:hover { color: white; }
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
            
            <!-- Header -->
            <div style="background: #222; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; border-bottom: 1px solid #333; z-index: 10;">
                <div><span style="color: #4ade80; margin-right:4px;">🔒</span> End-to-end encrypted</div>
                <div style="font-weight: 600;">Meeting: ${topic}</div>
                <div id="debate-progress-${containerId}" style="display: none; flex-direction: row; gap: 4px;">
                    ${Array(TOTAL_POINTS).fill(0).map((_, i) => `<div id="node-${i}-${containerId}" style="width: 20px; height: 4px; border-radius: 2px; background: #333;"></div>`).join('')}
                </div>
            </div>

            <!-- Phase 1: Stance -->
            <div id="stance-phase-${containerId}" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 2rem; background: #1a1a1a;">
                <div style="text-align: center;">
                    <h2 style="margin: 0 0 10px 0;">Waiting Room</h2>
                    <p style="color: #a3a3a3; margin: 0; font-size: 1.1rem;">Select your stance before entering the meeting.</p>
                </div>
                <div style="display: flex; gap: 1.5rem; width: 100%; max-width: 500px;">
                    <button class="stance-btn btn-agree" id="agree-${containerId}" style="flex: 1; padding: 1.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; background: #2563eb; color: white; border: none; font-size: 1rem;">
                        ${stanceA}
                    </button>
                    <button class="stance-btn btn-disagree" id="disagree-${containerId}" style="flex: 1; padding: 1.5rem; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; background: #475569; color: white; border: none; font-size: 1rem;">
                        ${stanceB}
                    </button>
                </div>
            </div>

            <!-- Phase 2: Cinematic Chat -->
            <div id="cinematic-${containerId}" style="flex: 1; display: none; flex-direction: column; position: relative;">
                
                <div style="flex: 1; position: relative; background: linear-gradient(rgba(15,23,42,0.7), rgba(15,23,42,0.9)), url('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80'); background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                    
                    <!-- Self View -->
                    <div style="position: absolute; top: 1rem; right: 1rem; width: 160px; height: 100px; background: #000; border: 1px solid #333; border-radius: 6px; display: flex; flex-direction: column; justify-content: flex-end; padding: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
                        <div style="background: rgba(0,0,0,0.6); padding: 2px 6px; font-size: 0.75rem; border-radius: 4px; align-self: flex-start; display: flex; align-items: center; gap: 4px;">
                            <span style="color: #ef4444; font-size: 0.7rem;">📷</span> You
                        </div>
                    </div>

                    <!-- Central Avatar -->
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <div id="ai-avatar-ring-${containerId}" style="width: 160px; height: 160px; border-radius: 50%; background: url('https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=300&h=300') center/cover; border: 3px solid transparent; transition: all 0.3s; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                        </div>
                    </div>

                    <!-- Name Tag -->
                    <div style="position: absolute; bottom: 1.5rem; left: 1.5rem; background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 6px; font-size: 0.95rem; font-weight: 500; display: flex; align-items: center; gap: 8px;">
                        <span id="mic-icon-${containerId}">🎙️</span> ${stakeholderName}
                    </div>

                    <!-- Closed Captions -->
                    <div style="position: absolute; bottom: 20%; width: 100%; text-align: center; padding: 0 15%; box-sizing: border-box; pointer-events: none;">
                        <div id="subtitle-text-${containerId}" class="cc-text" style="font-size: 1.4rem; line-height: 1.5; font-weight: 500; opacity: 0; transition: opacity 0.3s;">
                        </div>
                    </div>
                    
                    <div id="hint-text-${containerId}" style="position: absolute; top: 1rem; left: 1rem; background: rgba(245, 158, 11, 0.9); color: #000; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; display: none;"></div>
                </div>

                <!-- Input overlay -->
                <div id="input-${containerId}" style="position: absolute; bottom: 1.5rem; left: 50%; transform: translateX(-50%); width: 60%; background: rgba(30, 41, 59, 0.9); backdrop-filter: blur(10px); border-radius: 24px; padding: 8px 16px; display: none; align-items: flex-end; gap: 8px; border: 1px solid #475569; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <textarea class="debate-input" placeholder="Type message to meeting..." rows="1" style="flex: 1; background: transparent; border: none; color: white; padding: 8px 0; outline: none; font-size: 1rem; resize: none; font-family: inherit; line-height: 1.5; max-height: 120px; overflow-y: hidden;"></textarea>
                    <button class="debate-send" style="background: transparent; color: #3b82f6; border: none; padding: 8px; cursor: pointer; font-size: 1.25rem; font-weight: bold; margin-bottom: 2px;">
                        ➤
                    </button>
                </div>
            </div>
            
            <!-- Phase 3: Completion -->
             <div id="complete-${containerId}" style="flex: 1; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1rem; text-align: center; overflow-y: auto; background: #111;">
                <div id="verdict-icon-${containerId}" style="font-size: 3rem; margin-bottom: -10px;">🎓</div>
                <h3 id="verdict-title-${containerId}" style="font-size: 1.5rem; margin: 0; color: white;">Meeting Ended</h3>
                
                <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 500px; text-align: left; margin-top: 1rem;">
                    <div style="display:flex; justify-content: space-between; align-items:center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 1rem;">
                        <span style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; color:#94a3b8;">Performance Score</span>
                        <span id="debate-score-${containerId}" style="font-size: 1.5rem; font-weight: 800; color: #f59e0b;">--/100</span>
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
                    <button id="restart-btn-${containerId}" style="background: transparent; color: #f59e0b; border: 1px solid #f59e0b; padding: 12px 32px; font-weight: 800; border-radius: 24px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; font-size: 0.9rem; display: none;">Rejoin Meeting</button>
                    <button id="complete-btn-${containerId}" style="background: #f59e0b; color: black; border: none; padding: 12px 32px; font-weight: 800; border-radius: 24px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; font-size: 0.9rem;">Continue Course</button>
                </div>
            </div>

            <!-- Control Bar -->
            <div id="control-bar-${containerId}" style="height: 60px; background: #1e1e1e; display: none; justify-content: space-between; align-items: center; padding: 0 1.5rem; border-top: 1px solid #333;">
                <div style="display: flex; gap: 1.5rem;">
                    <div class="zoom-btn" id="audio-toggle-${containerId}">
                        <span id="audio-icon-${containerId}" style="font-size: 1.25rem;">🔇</span>
                        <span id="audio-label-${containerId}">Unmute Audio</span>
                    </div>
                    <div class="zoom-btn" style="color: #ef4444;">
                        <span style="font-size: 1.25rem;">📷</span>
                        <span>Stop Video</span>
                    </div>
                </div>
                <div style="display: flex; gap: 2rem;">
                    <div class="zoom-btn">
                        <span style="font-size: 1.25rem;">👥</span>
                        <span>Participants</span>
                    </div>
                    <div class="zoom-btn" style="color: #3b82f6;">
                        <span style="font-size: 1.25rem;">💬</span>
                        <span>Chat</span>
                    </div>
                </div>
                <div>
                    <button id="leave-call-${containerId}" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;">Leave</button>
                </div>
            </div>
        </div>
    `;

    // Elements
    const stancePhase = container.querySelector(`#stance-phase-${containerId}`);
    const cinematicArea = container.querySelector(`#cinematic-${containerId}`);
    const completeArea = container.querySelector(`#complete-${containerId}`);
    const inputBar = container.querySelector(`#input-${containerId}`);
    const controlBar = container.querySelector(`#control-bar-${containerId}`);
    
    const input = inputBar.querySelector('textarea');
    const sendBtn = inputBar.querySelector('.debate-send');
    const progressEl = container.querySelector(`#debate-progress-${containerId}`);
    const completeBtn = container.querySelector(`#complete-btn-${containerId}`);
    const restartBtn = container.querySelector(`#restart-btn-${containerId}`);
    const leaveBtn = container.querySelector(`#leave-call-${containerId}`);
    const audioToggle = container.querySelector(`#audio-toggle-${containerId}`);
    
    const subtitleText = container.querySelector(`#subtitle-text-${containerId}`);
    const hintText = container.querySelector(`#hint-text-${containerId}`);
    const avatarRing = container.querySelector(`#ai-avatar-ring-${containerId}`);

    // Auto-resize textarea
    input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    const updateProgress = () => {
        progressEl.style.display = 'flex';
        for (let i = 0; i < TOTAL_POINTS; i++) {
            const node = container.querySelector(`#node-${i}-${containerId}`);
            if (i < pointsDiscussed) {
                node.style.background = '#22c55e'; // Green for success
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
            icon.textContent = '🔊';
            label.textContent = 'Mute Audio';
            audioToggle.style.color = '#fff';
        } else {
            icon.textContent = '🔇';
            label.textContent = 'Unmute Audio';
            audioToggle.style.color = '#a3a3a3';
            if (currentAudio) {
                currentAudio.pause();
            }
        }
    };
    audioToggle.addEventListener('click', toggleAudio);

    const playAiAudio = async (text) => {
        if (!isAudioEnabled) return;
        try {
            const cleanText = text.replace(/\[SUCCESS\]|\[FAILED\]/g, '').trim();
            const audioUrl = await generateChatAudio(cleanText);
            if (audioUrl) {
                currentAudio = new Audio(audioUrl);
                currentAudio.play().catch(e => console.error("Audio play failed:", e));
            }
        } catch (e) {
            console.error("Failed to generate audio:", e);
        }
    };

    const setSubtitle = (text, isThinking = false) => {
        if (isThinking) {
            subtitleText.innerHTML = '<span style="color: #94a3b8; font-style: italic;">...</span>';
            subtitleText.style.opacity = '1';
            avatarRing.classList.add('ai-speaking');
        } else {
            if (!text) {
                subtitleText.style.opacity = '0';
                avatarRing.classList.remove('ai-speaking');
            } else {
                subtitleText.textContent = text;
                subtitleText.style.opacity = '1';
                avatarRing.classList.remove('ai-speaking');
                playAiAudio(text);
            }
        }
    };

    const showCompletion = (feedback, failed = false) => {
        if (currentAudio) currentAudio.pause();
        cinematicArea.style.display = 'none';
        controlBar.style.display = 'none';
        progressEl.style.display = 'none';
        
        const verdictIcon = container.querySelector(`#verdict-icon-${containerId}`);
        const verdictTitle = container.querySelector(`#verdict-title-${containerId}`);
        
        if (failed) {
            verdictIcon.textContent = '❌';
            verdictTitle.textContent = 'Meeting Ended - Challenge Failed';
            verdictTitle.style.color = '#ef4444';
            completeBtn.style.display = 'none';
            restartBtn.style.display = 'block';
        } else {
            verdictIcon.textContent = '✅';
            verdictTitle.textContent = 'Meeting Ended - Challenge Passed';
            verdictTitle.style.color = '#10b981';
            completeBtn.style.display = 'block';
            restartBtn.style.display = 'none';
        }

        if (feedback) {
            const scoreEl = container.querySelector(`#debate-score-${containerId}`);
            const strongEl = container.querySelector(`#debate-strongest-${containerId}`);
            const weakEl = container.querySelector(`#debate-weakness-${containerId}`);
            
            if (scoreEl) {
                scoreEl.textContent = `${feedback.score}/100`;
                scoreEl.style.color = feedback.score >= 75 ? '#10b981' : '#ef4444';
            }
            if (strongEl) strongEl.textContent = feedback.strongest_argument || "No clear strength noted.";
            if (weakEl) weakEl.textContent = feedback.weakness || "No obvious weaknesses noted.";
        }
        
        completeArea.style.display = 'flex';
    };

    const startDebate = async (stance) => {
        userStance = stance;
        stancePhase.style.display = 'none';
        cinematicArea.style.display = 'flex';
        controlBar.style.display = 'flex';
        inputBar.style.display = 'none'; // Hide until AI finishes speaking

        pointsDiscussed = 1;
        updateProgress();

        try {
            setSubtitle('', true);
            messages.push({ role: 'user', content: `I have decided that my position is: ${stance}. I am defending this policy.` });
            const responseData = await chatWithDebater(messages, topic, config.persona || aiSide, pointsDiscussed, failedAttemptsOnCurrentPoint);
            const { reply } = responseData;
            setSubtitle(reply);
            messages.push({ role: 'assistant', content: reply });
        } catch (e) {
            console.error("Failed to generate opening:", e);
            setSubtitle(`So you want to "${stance}", huh? Let me tell you why that's not going to work for us today.`);
        } finally {
            inputBar.style.display = 'flex';
            input.focus();
        }
    };

    const handleSend = async () => {
        const val = input.value.trim();
        if (!val || input.disabled) return;

        input.value = '';
        input.style.height = 'auto';
        input.disabled = true;
        sendBtn.disabled = true;
        
        hintText.style.display = 'none';
        inputBar.style.display = 'none'; // Hide input while waiting

        messages.push({ role: 'user', content: val });

        try {
            setSubtitle('', true);
            const responseData = await chatWithDebater(messages, topic, config.persona || aiSide, pointsDiscussed, failedAttemptsOnCurrentPoint);
            const { reply, advance_progress, failed_state, hint, final_feedback } = responseData;

            setSubtitle(reply);
            messages.push({ role: 'assistant', content: reply });

            if (failed_state) {
                setTimeout(() => showCompletion(final_feedback, true), 4000);
            } else if (advance_progress) {
                failedAttemptsOnCurrentPoint = 0;
                if (pointsDiscussed >= TOTAL_POINTS) {
                    setTimeout(() => showCompletion(final_feedback, false), 4000);
                } else {
                    pointsDiscussed++;
                    updateProgress();
                    inputBar.style.display = 'flex';
                    input.disabled = false;
                    sendBtn.disabled = false;
                    input.focus();
                }
            } else {
                failedAttemptsOnCurrentPoint++;
                if (hint) {
                    hintText.textContent = `Hint: ${hint}`;
                    hintText.style.display = 'block';
                }
                inputBar.style.display = 'flex';
                input.disabled = false;
                sendBtn.disabled = false;
                input.focus();
            }

        } catch (e) {
            console.error("Debate failed:", e);
            setSubtitle("I apologize, my train of thought was interrupted. Could you restate that?");
            inputBar.style.display = 'flex';
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    };

    const resetActivity = () => {
        if (currentAudio) currentAudio.pause();
        userStance = null;
        messages = [];
        pointsDiscussed = 0;
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

    // Listeners
    container.querySelector(`#agree-${containerId}`).addEventListener('click', () => startDebate(stanceA));
    container.querySelector(`#disagree-${containerId}`).addEventListener('click', () => startDebate(stanceB));

    restartBtn.addEventListener('click', resetActivity);
    
    leaveBtn.addEventListener('click', () => {
        // Manually trigger fail state
        showCompletion({ score: 0, strongest_argument: 'None', weakness: 'You left the meeting before resolving the issue.' }, true);
    });

    completeBtn.addEventListener('click', () => {
        container.dispatchEvent(new CustomEvent('lesson-activity-complete', { bubbles: true, composed: true }));
        const wrapper = container.closest('.activity-wrapper.fullscreen');
        if (wrapper) {
            const btn = document.querySelector(`.activity-expand-btn[data-target="${wrapper.id}"]`);
            if (btn) btn.click();
        }
    });

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
}
