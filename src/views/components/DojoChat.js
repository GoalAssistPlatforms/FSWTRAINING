import { chatWithDojo } from '../../api/ai.js';

export function renderDojoChat(containerId, config = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // --- 1. Handle Role Ambiguity (Split " or ") ---
    let rawRole = config.role || "A customer interested in bulk refrigeration units";
    // Check if role contains " or " (case insensitive) and pick one
    if (rawRole.toLowerCase().includes(' or ')) {
        const parts = rawRole.split(/ or /i);
        // deterministically random or just random? Random is better for replayability.
        rawRole = parts[Math.floor(Math.random() * parts.length)].trim();
    }

    // Config defaults
    const scenario = {
        role: rawRole,
        objective: config.objective || "Handle the inquiry professionally and suggest a site survey",
        intro: config.intro || "I've been looking at your Mitsubishi Electric range, but I'm worried about the lead times.",
        scenarioId: config.scenarioId || 'generic-fsw',
        skills: config.skills || ["Customer Service", "Product Knowledge", "Negotiation"]
    };

    let chatHistory = [];
    let callTimerInterval;
    let callSeconds = 0;
    let audioContext = null;
    let isRinging = false;

    // --- AUDIO SYSTEM (Web Audio API) ---
    const initAudio = () => {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    };

    const playRingtone = () => {
        // 1. Check if we are in Cinema Mode
        const grid = document.querySelector('.cp-grid');
        if (grid && grid.classList.contains('cinema-mode')) return;

        // 2. Check if other audio/video is playing
        const lessonAudio = document.getElementById('lesson-audio');
        const introVideo = document.getElementById('intro-video');

        if (lessonAudio && !lessonAudio.paused) return;
        if (introVideo && !introVideo.paused) return;

        if (isRinging) return;
        initAudio();
        isRinging = true;

        // Safety: Stop ringtone if other media starts
        const stopOnMediaStart = () => stopRingtone();
        if (lessonAudio) lessonAudio.addEventListener('play', stopOnMediaStart, { once: true });
        if (introVideo) introVideo.addEventListener('play', stopOnMediaStart, { once: true });


        const playPulse = () => {
            if (!isRinging) return;

            // UK Phone Ring Style: Double beat
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();

            osc.frequency.setValueAtTime(400, audioContext.currentTime); // 400Hz
            osc.frequency.setValueAtTime(450, audioContext.currentTime + 0.1); // Modulation for "burr" effect

            gain.gain.setValueAtTime(0, audioContext.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
            gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4); // Short pulse

            osc.connect(gain);
            gain.connect(audioContext.destination);

            osc.start();
            osc.stop(audioContext.currentTime + 0.5);

            // Second pulse shortly after
            setTimeout(() => {
                if (!isRinging) return;
                const osc2 = audioContext.createOscillator();
                const gain2 = audioContext.createGain();
                osc2.frequency.setValueAtTime(400, audioContext.currentTime);
                gain2.gain.setValueAtTime(0, audioContext.currentTime);
                gain2.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
                gain2.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);

                osc2.connect(gain2);
                gain2.connect(audioContext.destination);
                osc2.start();
                osc2.stop(audioContext.currentTime + 0.5);
            }, 600);

            // Repeat every 2.5 seconds
            setTimeout(playPulse, 2500);
        };

        playPulse();
    };

    const stopRingtone = () => {
        isRinging = false;
        // Clean up handled by timeouts checking flag
    };


    try {
        const stored = localStorage.getItem(`dojo-chat-${scenario.scenarioId}`);
        if (stored) {
            chatHistory = JSON.parse(stored);
        } else {
            // Start with a realistic greeting instead of the scenario context
            // If the role is generic, use a generic greeting.
            chatHistory = [{ role: 'ai', content: "Hello? Is this FSW?" }];
        }
    } catch (e) {
        chatHistory = [{ role: 'ai', content: "Hello? Is this FSW?" }];
    }

    const saveChat = () => {
        localStorage.setItem(`dojo-chat-${scenario.scenarioId}`, JSON.stringify(chatHistory));
    };

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const startTimer = () => {
        clearInterval(callTimerInterval);
        callSeconds = 0;
        const timerEl = container.querySelector('#call-timer');
        if (timerEl) timerEl.innerText = "00:00";

        callTimerInterval = setInterval(() => {
            callSeconds++;
            if (timerEl) timerEl.innerText = formatTime(callSeconds);
        }, 1000);
    };

    const resetSimulation = () => {
        stopRingtone();
        clearInterval(callTimerInterval);
        chatHistory = [{ role: 'ai', content: "Hello? Is this FSW?" }];
        localStorage.removeItem(`dojo-chat-${scenario.scenarioId}`);
        renderIncomingCall();
    }

    // --- RENDER STATES ---

    const renderIncomingCall = () => {
        playRingtone();
        container.innerHTML = `
            <div class="glass fade-in" style="display: flex; flex-direction: column; height: 600px; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--glass-border); background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); position: relative;">
                <!-- Background Pulse Animation -->
                <div style="position: absolute; top:0; left:0; right:0; bottom:0; overflow:hidden; z-index:0; pointer-events: none;">
                    <div style="position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%); width: 200px; height: 200px; background: rgba(18, 142, 205, 0.2); border-radius: 50%; animation: pulse-ring 2s infinite;"></div>
                </div>

                <!-- Main Content Area - Scrollable for long text -->
                <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; z-index: 1; padding: 2rem 1.5rem 0 1.5rem; overflow-y: auto; overflow-x: hidden;">
                    
                    <div style="flex-shrink: 0; width: 100px; height: 100px; background: #334155; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; border: 4px solid var(--glass-border); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                        <svg width="50" height="50" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    </div>
                    
                    <h2 style="margin: 0; font-size: 1.8rem; letter-spacing: -0.5px; text-align: center;">Incoming Call...</h2>
                    <p style="color: var(--primary); font-size: 1.1rem; margin-top: 0.5rem; font-weight: 500; text-align: center;">${scenario.role}</p>
                    
                    <div style="margin-top: 1.5rem; margin-bottom: 2rem; background: rgba(0,0,0,0.4); padding: 1.5rem; border-radius: var(--radius-md); border-left: 4px solid var(--accent); width: 100%; max-width: 90%; box-sizing: border-box;">
                        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; justify-content: center;">
                            ${scenario.skills.map(s => `<span style="font-size: 0.7rem; background: rgba(18, 142, 205, 0.2); color: var(--primary); padding: 4px 8px; border-radius: 12px; border: 1px solid rgba(18, 142, 205, 0.3);">${s}</span>`).join('')}
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <strong style="color: #e2e8f0; display: block; margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1px;">SITUATION BRIEF</strong>
                            <p style="color: #94a3b8; font-size: 0.95rem; margin: 0; line-height: 1.4;">${scenario.intro}</p>
                        </div>
                         <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 0.5rem 0 1rem 0;">
                         <div>
                            <strong style="color: #e2e8f0; display: block; margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1px;">YOUR GOAL</strong>
                            <p style="color: #94a3b8; font-size: 0.95rem; margin: 0; line-height: 1.4;">${scenario.objective}</p>
                        </div>
                    </div>
                </div>

                <!-- Footer / Actions - Pinned to bottom -->
                <div style="flex-shrink: 0; display: flex; justify-content: center; gap: 3rem; padding: 1.5rem 0 2.5rem 0; z-index: 10; background: linear-gradient(to top, #0f172a 0%, transparent 100%);">
                    <!-- Decline Button (Reset) -->
                    <button id="decline-btn" style="width: 70px; height: 70px; border-radius: 50%; background: #ef4444; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
                    </button>
                    
                    <!-- Accept Button -->
                    <button id="accept-btn" style="width: 70px; height: 70px; border-radius: 50%; background: #22c55e; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; animation: pulse-green 1.5s infinite; box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.44-5.15-3.75-6.59-6.59l1.97-1.57c.26-.27.36-.66.25-1.01-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3.28 3 3.93 3 4.96c0 10.96 7.6 18.04 18.04 18.04.81 0 1.25-.56 1.25-1.25v-3.79c-.01-.54-.46-.99-1.28-.58z"/></svg>
                    </button>
                </div>
                
                <style>
                    @keyframes pulse-ring { 0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; } 50% { opacity: 0.5; } 100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; } }
                    @keyframes pulse-green { 0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(34, 197, 94, 0); } 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); } }
                </style>
            </div>
        `;

        container.querySelector('#accept-btn').onclick = () => {
            stopRingtone();
            renderActiveCall();
        };

        container.querySelector('#decline-btn').onclick = () => {
            stopRingtone();
            alert("Simulation skipped (demo only)"); // Could also just reset
        };
    };

    const renderActiveCall = () => {
        container.innerHTML = `
            <div class="glass fade-in" style="display: flex; flex-direction: column; height: 600px; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--glass-border); background: #0f172a; position: relative;">
                
                <!-- Mission Info Overlay (Hidden by default) -->
                <div id="mission-overlay" style="display: none; position: absolute; top: 70px; right: 10px; left: 10px; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1.5rem; z-index: 100; backdrop-filter: blur(10px); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                        <h4 style="margin: 0; color: white; font-size: 1rem;">Mission Brief</h4>
                        <button id="close-mission-btn" style="background:none; border:none; color: #94a3b8; cursor: pointer; font-size: 1.2rem;">&times;</button>
                    </div>
                    <div style="font-size: 0.9rem; color: #cbd5e1; line-height: 1.5;">
                        <p style="margin-bottom: 0.5rem;"><strong style="color: var(--primary);">Context:</strong> ${scenario.intro}</p>
                        <p><strong style="color: var(--primary);">Goal:</strong> ${scenario.objective}</p>
                    </div>
                </div>

                <!-- Call Header -->
                <div style="background: rgba(30, 41, 59, 0.8); border-bottom: 1px solid var(--glass-border); padding: 1rem; display: flex; align-items: center; justify-content: space-between; backdrop-filter: blur(10px);">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 40px; height: 40px; background: #334155; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">?</div>
                        <div>
                            <h4 style="margin: 0; color: white; font-size: 0.95rem;">${scenario.role}</h4>
                            <span id="call-status" style="font-size: 0.75rem; color: #22c55e; display: flex; align-items: center; gap: 4px;">
                                <span style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%;"></span>
                                Connected <span id="call-timer" style="color: #94a3b8; margin-left: 4px;">00:00</span>
                            </span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                         <button id="mission-info-btn" title="Mission Info" style="background: rgba(255, 255, 255, 0.1); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        </button>
                        <button id="end-call-btn" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 20px; padding: 6px 16px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s;">
                            End Call
                        </button>
                    </div>
                </div>

                <!-- Chat Area -->
                <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; scrollbar-width: thin; background-image: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px); background-size: 20px 20px;">
                    <!-- Messages injected here -->
                </div>

                <!-- Input Area -->
                <div style="display: flex; padding: 1rem; background-color: rgba(30, 41, 59, 0.95); border-top: 1px solid var(--glass-border); gap: 0.75rem; align-items: flex-end;">
                    <div style="flex: 1; position: relative; min-width: 0;">
                         <textarea id="chat-input" rows="1" placeholder="Type your response..." style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 20px; padding: 10px 1.25rem; outline: none; transition: all 0.2s; resize: none; font-family: inherit; font-size: 0.95rem; line-height: 1.5;"></textarea>
                    </div>
                    <button id="send-btn" style="background: var(--primary); color: white; border: none; border-radius: 50%; width: 42px; height: 42px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
                
                 <!-- End Call Modal (Hidden by default) -->
                <div id="end-call-modal" style="display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.8); z-index: 200; backdrop-filter: blur(5px); flex-direction: column; align-items: center; justify-content: center;">
                    <div style="background: #1e293b; padding: 2rem; border-radius: 12px; border: 1px solid var(--glass-border); width: 80%; max-width: 320px; text-align: center;">
                        <h3 style="margin-top: 0; color: white;">End Call?</h3>
                        <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 2rem;">If you have achieved the goal, you can mark this as complete.</p>
                        
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                             <button id="modal-resume" style="padding: 10px; background: transparent; border: 1px solid #475569; color: white; border-radius: 8px; cursor: pointer;">Resume Call</button>
                             <button id="modal-end-incomplete" style="padding: 10px; background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #ef4444; border-radius: 8px; cursor: pointer;">End (Retry Later)</button>
                             <button id="modal-end-complete" style="padding: 10px; background: #22c55e; border: none; color: black; font-weight: bold; border-radius: 8px; cursor: pointer;">Mark as Complete</button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        startTimer();
        bindActiveEvents();
        renderMessages();
    };

    const bindActiveEvents = () => {
        const input = container.querySelector('#chat-input');
        const sendBtn = container.querySelector('#send-btn');
        const endBtn = container.querySelector('#end-call-btn');

        // Modal & Info elements
        const missionBtn = container.querySelector('#mission-info-btn');
        const missionOverlay = container.querySelector('#mission-overlay');
        const closeMissionBtn = container.querySelector('#close-mission-btn');
        const endModal = container.querySelector('#end-call-modal');
        const modalResume = container.querySelector('#modal-resume');
        const modalEndIncomplete = container.querySelector('#modal-end-incomplete');
        const modalEndComplete = container.querySelector('#modal-end-complete');

        // Toggle Mission Info
        missionBtn.onclick = () => missionOverlay.style.display = 'block';
        closeMissionBtn.onclick = () => missionOverlay.style.display = 'none';

        // Auto-resize textarea
        input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.value === '') this.style.height = 'auto';
        });

        // End Call Flow
        endBtn.onclick = () => {
            endModal.style.display = 'flex';
        };

        modalResume.onclick = () => {
            endModal.style.display = 'none';
        }

        modalEndIncomplete.onclick = () => {
            clearInterval(callTimerInterval);
            renderCallEndedScreen(false);
        }

        modalEndComplete.onclick = () => {
            clearInterval(callTimerInterval);
            triggerCompletion();
            renderCallEndedScreen(true);
        }

        const triggerCompletion = () => {
            container.dispatchEvent(new CustomEvent('lesson-activity-complete', {
                bubbles: true,
                composed: true
            }));
        }

        const renderCallEndedScreen = (success) => {
            container.innerHTML = `
                <div class="glass fade-in" style="height:600px; display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center; background: #0f172a;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">${success ? '🎉' : '📞'}</div>
                    <h3 style="color:white; margin: 0 0 0.5rem 0;">Call Ended</h3>
                    <p style="color: #94a3b8; margin-bottom: 2rem;">${success ? 'Mission Complete' : 'Simulation stopped'}</p>
                    
                    <button id="restart-sim-btn" class="btn" style="background: transparent; border: 1px solid var(--primary); color: var(--primary); padding: 0.75rem 2rem; border-radius: 8px; cursor: pointer;">
                        Restart Simulation
                    </button>
                </div>
             `;

            // Fix Restart Bug: Use Event Listener
            container.querySelector('#restart-sim-btn').onclick = () => {
                resetSimulation();
            };
        }

        const handleSend = async () => {
            const text = input.value.trim();
            if (!text) return;

            input.value = '';
            input.style.height = 'auto';
            input.disabled = true;
            sendBtn.disabled = true;

            chatHistory.push({ role: 'user', content: text });
            renderMessages();

            try {
                // Typing effect indicator
                const loadingMsg = { role: 'ai', content: '...' };
                chatHistory.push(loadingMsg);
                renderMessages();

                const response = await chatWithDojo(chatHistory.filter(m => m.content !== '...'), scenario);

                chatHistory.pop(); // remove loading
                chatHistory.push({ role: 'ai', content: response });
                saveChat();
                renderMessages();

                if (response.includes('[SUCCESS]')) {
                    clearInterval(callTimerInterval);
                    container.querySelector('#call-status').innerHTML = '<span style="color:var(--accent)">✓ MISSION COMPLETE</span>';

                    // Explicitly trigger completion event
                    triggerCompletion();
                }
            } catch (error) {
                console.error("Dojo Chat failed:", error);
                chatHistory.pop(); // remove loading indicator

                // Show error toast
                const toast = document.createElement('div');
                toast.innerHTML = `<div style="background: #ef4444; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 0.9rem; font-weight: 500; display: flex; align-items: center; gap: 0.5rem;">
                    <span>⚠️ Connection failed: ${error.message || 'Unknown error'}</span>
                </div>`;
                toast.style.cssText = "position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 100; animation: fade-in 0.3s forwards;";
                // Ensure we append to correct active container (which is updated now)
                if (container.querySelector('.glass')) {
                    container.querySelector('.glass').appendChild(toast);
                }
                setTimeout(() => toast.remove(), 4000);

                renderMessages();
            } finally {
                if (input) {
                    input.disabled = false;
                    input.focus();
                }
                if (sendBtn) sendBtn.disabled = false;
            }
        };

        sendBtn.onclick = handleSend;
        input.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        };
    };

    const renderMessages = () => {
        const messageContainer = container.querySelector('#chat-messages');
        if (!messageContainer) return;

        messageContainer.innerHTML = chatHistory.map(msg => {
            const isUser = msg.role === 'user';
            const isSuccess = msg.content.includes('[SUCCESS]');
            const displayContent = msg.content.replace('[SUCCESS]', '');
            // Simple avatar generation based on role
            const avatar = isUser ? 'ME' : 'C';

            return `
                <div style="display: flex; gap: 10px; ${isUser ? 'flex-direction: row-reverse;' : ''}">
                    <!-- Avatar -->
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isUser ? 'var(--primary)' : '#475569'}; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: white; font-weight: bold; flex-shrink: 0; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                        ${avatar}
                    </div>
                    
                    <!-- Bubble -->
                    <div style="
                        max-width: 75%;
                        padding: 0.75rem 1rem;
                        border-radius: 18px;
                        ${isUser ? 'background: var(--primary); color: white; border-bottom-right-radius: 4px;' : 'background: #334155; color: #f1f5f9; border-bottom-left-radius: 4px;'}
                        font-size: 0.95rem;
                        line-height: 1.5;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                        position: relative;
                    ">
                        ${displayContent}
                        ${isSuccess ? '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); color: #86efac; font-size: 0.8rem; font-weight: bold; display: flex; align-items: center; gap: 4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Simulator Goal Achieved</div>' : ''}
                    </div>
                </div>
            `;
        }).join('');
        messageContainer.scrollTop = messageContainer.scrollHeight;
    };

    // --- CHECK FOR RE-ENTRY ---
    const hasHistory = chatHistory.length > 1; // More than just intro
    if (hasHistory) {
        // Resume active call
        renderActiveCall();
    } else {
        // Start from ringtone
        renderIncomingCall();
    }
}
