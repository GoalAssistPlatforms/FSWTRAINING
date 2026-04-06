import { chatWithDebater } from '../../api/ai.js';

export function renderDebate(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { topic, aiSide = 'devil_advocate', stances } = config;

    // State
    let userStance = null;
    let messages = [];
    let pointsDiscussed = 0;
    let failedAttemptsOnCurrentPoint = 0;
    const TOTAL_POINTS = 5;

    // Button Labels
    const [stanceA, stanceB] = stances && stances.length === 2 ? stances : ['Agreement', 'Disagreement'];

    container.innerHTML = `
        <style>
            @keyframes debate-typing-bounce {
                0%, 80%, 100% { transform: translateY(0); }
                40% { transform: translateY(-5px); }
            }
            .debate-typing-dot {
                display: inline-block;
                width: 6px;
                height: 6px;
                background: #f59e0b;
                border-radius: 50%;
                margin: 0 2px;
                animation: debate-typing-bounce 1.4s infinite ease-in-out both;
            }
            .debate-typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .debate-typing-dot:nth-child(2) { animation-delay: -0.16s; }
        </style>
        <div class="debate-container fade-in" style="display: flex; flex-direction: column; height: 650px; border: 1px solid var(--glass-border); border-radius: var(--radius-lg); background: rgba(10, 10, 12, 0.6); backdrop-filter: blur(10px); overflow: hidden; color: white; position: relative;">
            <div class="debate-header" style="padding: 1.5rem; background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid var(--glass-border); text-align: center; display: flex; flex-direction: column; gap: 0.5rem; justify-content: center; align-items: center;">
                 <div style="font-size: 0.7rem; text-transform: uppercase; color: #f59e0b; letter-spacing: 3px; font-weight: 800;">The Hot Seat</div>
                 <div class="debate-topic" style="font-size: 1.1rem; font-weight: 600; line-height: 1.4; max-width: 80%; color: #fff;">"${topic}"</div>
                 <div id="debate-progress-${containerId}" style="display: none; font-size: 0.75rem; background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 12px; color: #ccc; margin-top: 4px;">Point 0/${TOTAL_POINTS}</div>
            </div>

            <!-- Phase 1: Stance -->
            <div class="debate-stance-selector" id="stance-phase-${containerId}" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1.5rem;">
                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1.1rem;">Select a perspective to debate. You will defend this position.</p>
                <div style="display: flex; gap: 1rem; width: 100%; max-width: 400px;">
                    <button class="stance-btn btn-agree" id="agree-${containerId}" style="flex: 1; padding: 1.5rem; border-radius: var(--radius-md); font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.2s;">
                        ${stanceA}
                    </button>
                    <button class="stance-btn btn-disagree" id="disagree-${containerId}" style="flex: 1; padding: 1.5rem; border-radius: var(--radius-md); font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.2s;">
                        ${stanceB}
                    </button>
                </div>
            </div>

            <!-- Phase 2: Chat -->
            <div class="debate-chat-area" id="chat-${containerId}" style="flex: 1; overflow-y: auto; padding: 2rem; display: none; flex-direction: column; gap: 1.5rem; scrollbar-width: thin; background: rgba(0,0,0,0.1);"></div>
            
            <!-- Phase 3: Completion (Hidden initially) -->
             <div class="debate-complete-area" id="complete-${containerId}" style="flex: 1; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1rem; text-align: center; overflow-y: auto;">
                <div style="font-size: 3rem; margin-bottom: -10px;">🎓</div>
                <h3 style="font-size: 1.5rem; margin: 0; color: white;">The Hot Seat Verdict</h3>
                
                <div style="background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 1.5rem; width: 100%; max-width: 500px; text-align: left; margin-top: 1rem;">
                    <div style="display:flex; justify-content: space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1rem;">
                        <span style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; color:#ccc;">Critical Thinking Score</span>
                        <span id="debate-score-${containerId}" style="font-size: 1.5rem; font-weight: 800; color: #f59e0b;">--/100</span>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #4ade80; margin-bottom: 4px; font-weight: 600;">Strongest Argument</div>
                        <div id="debate-strongest-${containerId}" style="font-size: 0.95rem; line-height: 1.5; color: #e5e7eb;">...</div>
                    </div>

                    <div>
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: #f87171; margin-bottom: 4px; font-weight: 600;">Areas for Improvement</div>
                        <div id="debate-weakness-${containerId}" style="font-size: 0.95rem; line-height: 1.5; color: #e5e7eb;">...</div>
                    </div>
                </div>

                <button id="complete-btn-${containerId}" style="background: #f59e0b; color: black; border: none; padding: 12px 32px; font-weight: 800; border-radius: 24px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; font-size: 0.9rem; letter-spacing: 1px; margin-top: 1rem;">Finish Activity</button>
            </div>

            <div class="input-bar" id="input-${containerId}" style="padding: 1.5rem; background: rgba(0, 0, 0, 0.4); border-top: 1px solid var(--glass-border); display: none; gap: 1rem; align-items: flex-end;">
                <textarea class="debate-input" placeholder="Defend your position..." rows="1" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 12px 1.5rem; border-radius: 20px; outline: none; font-size: 0.95rem; resize: none; min-height: 46px; line-height: 1.5; font-family: inherit; overflow-y: hidden;"></textarea>
                <button class="debate-send" style="background: white; color: black; border: none; padding: 0 1.5rem; height: 46px; font-weight: 800; border-radius: 23px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1px;">Argue</button>
            </div>
        </div>
    `;

    // Elements
    const stancePhase = container.querySelector(`#stance-phase-${containerId}`);
    const chatArea = container.querySelector(`#chat-${containerId}`);
    const completeArea = container.querySelector(`#complete-${containerId}`);
    const inputBar = container.querySelector(`#input-${containerId}`);
    const input = inputBar.querySelector('textarea');
    const sendBtn = inputBar.querySelector('.debate-send');
    const progressEl = container.querySelector(`#debate-progress-${containerId}`);
    const completeBtn = container.querySelector(`#complete-btn-${containerId}`);

    // Auto-resize textarea
    input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        // Cap max height
        if (this.scrollHeight > 150) {
            this.style.overflowY = 'auto';
            this.style.height = '150px';
        } else {
            this.style.overflowY = 'hidden';
        }
    });

    const updateProgress = () => {
        progressEl.textContent = `Point ${Math.min(pointsDiscussed, TOTAL_POINTS)}/${TOTAL_POINTS}`;
        progressEl.style.display = 'block';
    };

    const addMessage = (role, text) => {
        const isUser = role === 'user';
        const bubble = document.createElement('div');
        bubble.className = `debate-bubble bubble-${role}`;
        bubble.style.cssText = `
            max-width: 85%;
            padding: 1.25rem;
            border-radius: var(--radius-md);
            line-height: 1.6;
            position: relative;
            font-size: 0.95rem;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            ${isUser ? 'align-self: flex-end; background: linear-gradient(135deg, #333, #111); border: 1px solid #444; border-bottom-right-radius: 2px;' : 'align-self: flex-start; background: rgba(255,255,255,0.03); border-left: 4px solid #f59e0b; border-bottom-left-radius: 2px; color: #e5e7eb;'}
        `;

        // Label
        const label = document.createElement('div');
        label.style.cssText = 'font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.5; margin-bottom: 8px; font-weight: 800;';
        label.textContent = isUser ? 'Your Argument' : `Pressure Test ${pointsDiscussed > 0 ? '#' + pointsDiscussed : ''}`;
        bubble.appendChild(label);

        const content = document.createElement('div');
        content.textContent = text;
        bubble.appendChild(content);

        chatArea.appendChild(bubble);
        chatArea.scrollTop = chatArea.scrollHeight;
    };

    const showCompletion = (feedback) => {
        chatArea.style.display = 'none';
        inputBar.style.display = 'none';
        progressEl.style.display = 'none';
        
        if (feedback) {
            const scoreEl = container.querySelector(`#debate-score-${containerId}`);
            const strongEl = container.querySelector(`#debate-strongest-${containerId}`);
            const weakEl = container.querySelector(`#debate-weakness-${containerId}`);
            if (scoreEl) scoreEl.textContent = `${feedback.score}/100`;
            if (strongEl) strongEl.textContent = feedback.strongest_argument || "No clear strength noted.";
            if (weakEl) weakEl.textContent = feedback.weakness || "No obvious weaknesses noted.";
        }
        
        completeArea.style.display = 'flex';
    };

    const startDebate = async (stance) => {
        userStance = stance;
        stancePhase.style.display = 'none';
        chatArea.style.display = 'flex';
        inputBar.style.display = 'flex';

        // Initial point (0 -> 1)
        pointsDiscussed = 1;
        updateProgress();

        addMessage('ai', `I see you chose "${stance}". Interesting. I will assume the role of your critic. Let's explore 5 key aspects of this topic. First, what fundamental principle leads you to this conclusion?`);
    };

    const handleSend = async () => {
        const val = input.value.trim();
        if (!val || input.disabled) return;

        input.value = '';
        input.style.height = '46px'; // Reset height
        input.disabled = true;
        sendBtn.disabled = true;

        addMessage('user', val);
        messages.push({ role: 'user', content: val });

        try {
            // Typing indicator
            const loading = document.createElement('div');
            loading.style.cssText = 'align-self: flex-start; margin-left: 1rem; display: flex; align-items: center; height: 32px; padding: 0 12px; background: rgba(255,255,255,0.03); border-radius: 16px; border-left: 2px solid #f59e0b;';
            loading.innerHTML = 'Wait<span style="margin: 0 6px;"></span><div class="debate-typing-dot"></div><div class="debate-typing-dot"></div><div class="debate-typing-dot"></div>';
            chatArea.appendChild(loading);
            chatArea.scrollTop = chatArea.scrollHeight;

            const responseData = await chatWithDebater(messages, topic, config.persona || aiSide, pointsDiscussed, failedAttemptsOnCurrentPoint);

            loading.remove();

            const { reply, advance_progress, hint, final_feedback } = responseData;

            if (advance_progress) {
                // User gave a good response
                failedAttemptsOnCurrentPoint = 0;
                addMessage('ai', reply);
                messages.push({ role: 'assistant', content: reply });
                
                if (pointsDiscussed >= TOTAL_POINTS) {
                    // It's over.
                    setTimeout(() => showCompletion(final_feedback), 2000);
                } else {
                    pointsDiscussed++;
                    updateProgress();
                }
            } else {
                // User gave a weak response
                failedAttemptsOnCurrentPoint++;
                addMessage('ai', reply);
                messages.push({ role: 'assistant', content: reply });
                
                if (hint) {
                    const hintDiv = document.createElement('div');
                    hintDiv.style.cssText = 'align-self: flex-start; color: #f59e0b; font-size: 0.8rem; font-style: italic; margin-left: 1rem; border-left: 2px solid #f59e0b; padding-left: 8px; margin-top: -8px; max-width: 80%; line-height: 1.4;';
                    hintDiv.textContent = `Hint: ${hint}`;
                    chatArea.appendChild(hintDiv);
                }
                chatArea.scrollTop = chatArea.scrollHeight;
            }

        } catch (e) {
            console.error("Debate failed:", e);
            addMessage('ai', "I apologize, my train of thought was interrupted. Could you restate that?");
        } finally {
            if (completeArea.style.display === 'none') {
                input.disabled = false;
                sendBtn.disabled = false;
                input.focus();
            }
        }
    };

    // Listeners
    container.querySelector(`#agree-${containerId}`).addEventListener('click', () => startDebate(stanceA));
    container.querySelector(`#disagree-${containerId}`).addEventListener('click', () => startDebate(stanceB));

    // Complete Phase listener
    completeBtn.addEventListener('click', () => {
        container.dispatchEvent(new CustomEvent('lesson-activity-complete', {
            bubbles: true,
            composed: true
        }));

        // Automatically exit fullscreen to return to the course player
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
