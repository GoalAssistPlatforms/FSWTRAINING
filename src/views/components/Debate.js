import { chatWithDebater } from '../../api/ai.js';

export function renderDebate(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { topic, aiSide = 'devil_advocate', stances } = config;

    // State
    let userStance = null;
    let messages = [];
    let pointsDiscussed = 0;
    const TOTAL_POINTS = 5;

    // Button Labels
    const [stanceA, stanceB] = stances && stances.length === 2 ? stances : ['Agreement', 'Disagreement'];

    container.innerHTML = `
        <div class="debate-container fade-in" style="display: flex; flex-direction: column; height: 650px; border: 1px solid var(--glass-border); border-radius: var(--radius-lg); background: rgba(10, 10, 12, 0.6); backdrop-filter: blur(10px); overflow: hidden; color: white; position: relative;">
            <div class="debate-header" style="padding: 1.5rem; background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid var(--glass-border); text-align: center; display: flex; flex-direction: column; gap: 0.5rem; justify-content: center; align-items: center;">
                 <div style="font-size: 0.7rem; text-transform: uppercase; color: #f59e0b; letter-spacing: 3px; font-weight: 800;">Socratic Seminar</div>
                 <div class="debate-topic" style="font-size: 1.1rem; font-weight: 600; line-height: 1.4; max-width: 80%; color: #fff;">"${topic}"</div>
                 <div id="debate-progress-${containerId}" style="display: none; font-size: 0.75rem; background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 12px; color: #ccc; margin-top: 4px;">Point 0/${TOTAL_POINTS}</div>
            </div>

            <!-- Phase 1: Stance -->
            <div class="debate-stance-selector" id="stance-phase-${containerId}" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1.5rem;">
                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1.1rem;">Select a perspective to debate. You will defend this position.</p>
                <div style="display: flex; gap: 1rem; width: 100%; max-width: 400px;">
                    <button class="stance-btn btn-agree" id="agree-${containerId}" style="flex: 1; padding: 1.5rem; border-radius: var(--radius-md); font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.2s;">
                        <!-- Id: 30 Icon removed for neutrality -->
                        ${stanceA}
                    </button>
                    <button class="stance-btn btn-disagree" id="disagree-${containerId}" style="flex: 1; padding: 1.5rem; border-radius: var(--radius-md); font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.2s;">
                        <!-- Id: 34 Icon removed for neutrality -->
                        ${stanceB}
                    </button>
                </div>
            </div>

            <!-- Phase 2: Chat -->
            <div class="debate-chat-area" id="chat-${containerId}" style="flex: 1; overflow-y: auto; padding: 2rem; display: none; flex-direction: column; gap: 1.5rem; scrollbar-width: thin; background: rgba(0,0,0,0.1);"></div>
            
            <!-- Phase 3: Completion (Hidden initially) -->
             <div class="debate-complete-area" id="complete-${containerId}" style="flex: 1; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1rem; text-align: center;">
                <div style="font-size: 3rem;">🎓</div>
                <h3 style="font-size: 1.5rem; margin: 0; color: white;">Seminar Completed</h3>
                <p style="color: rgba(255,255,255,0.7); max-width: 400px; line-height: 1.5;">You've successfully analyzed the topic through Socratic inquiry.</p>
                <button id="complete-btn-${containerId}" style="background: #f59e0b; color: black; border: none; padding: 12px 32px; font-weight: 800; border-radius: 24px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; font-size: 0.9rem; letter-spacing: 1px; margin-top: 1rem;">Finish Activity</button>
            </div>

            <div class="input-bar" id="input-${containerId}" style="padding: 1.5rem; background: rgba(0, 0, 0, 0.4); border-top: 1px solid var(--glass-border); display: none; gap: 1rem; align-items: flex-end;">
                <textarea class="debate-input" placeholder="Defense your assumption..." rows="1" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 12px 1.5rem; border-radius: 20px; outline: none; font-size: 0.95rem; resize: none; min-height: 46px; line-height: 1.5; font-family: inherit; overflow-y: hidden;"></textarea>
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
        progressEl.textContent = `Point ${Math.min(pointsDiscussed + 1, TOTAL_POINTS)}/${TOTAL_POINTS}`;
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
        label.textContent = isUser ? 'Your Argument' : `Socratic Inquiry ${pointsDiscussed > 0 ? '#' + pointsDiscussed : ''}`;
        bubble.appendChild(label);

        const content = document.createElement('div');
        content.textContent = text;
        bubble.appendChild(content);

        chatArea.appendChild(bubble);
        chatArea.scrollTop = chatArea.scrollHeight;
    };

    const showCompletion = () => {
        chatArea.style.display = 'none';
        inputBar.style.display = 'none';
        progressEl.style.display = 'none';
        completeArea.style.display = 'flex';
        // Trigger generic completion event for tracking, though we wait for button to finalize
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

        // If we have discussed 5 points and the user just replied to the 5th, we are done.
        // Logic: 
        // Start: pt=1. AI asks Q1.
        // User replies.
        // AI asks Q2. pt=2.
        // ...
        // AI asks Q5. pt=5.
        // User replies. -> We are effectively done, but let AI give final closing.

        try {
            // "Thinking" indicator
            const loading = document.createElement('div');
            loading.style.cssText = 'align-self: flex-start; color: #f59e0b; font-size: 0.8rem; font-style: italic; margin-left: 1rem;';
            loading.textContent = 'Analysing assumptions...';
            chatArea.appendChild(loading);
            chatArea.scrollTop = chatArea.scrollHeight;

            // Determine next point context for AI
            const nextPoint = pointsDiscussed < TOTAL_POINTS ? pointsDiscussed + 1 : TOTAL_POINTS;
            const response = await chatWithDebater(messages, topic, aiSide === 'pro' ? 'pro' : 'con', nextPoint);

            loading.remove();

            // Check if AI indicates completion or if we hit limit
            // We increment points after AI responds with the NEXT point
            if (pointsDiscussed < TOTAL_POINTS) {
                pointsDiscussed++;
                updateProgress();
                addMessage('ai', response);
                messages.push({ role: 'assistant', content: response });
            } else {
                // Final response (closing)
                addMessage('ai', response);
                messages.push({ role: 'assistant', content: response });

                // Wait a moment then show completion
                setTimeout(showCompletion, 2000);
            }

        } catch (e) {
            console.error("Debate failed:", e);
            addMessage('ai', "I apologize, my train of thought was interrupted. Could you restate that?");
        } finally {
            if (pointsDiscussed <= TOTAL_POINTS && completeArea.style.display === 'none') {
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
    });

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
}
