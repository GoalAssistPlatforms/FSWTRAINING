import { chatWithDojo } from '../../api/ai.js';
import { generateChatAudio } from '../../api/elevenlabs.js';
import { fswAlert } from '../../utils/dialog.js';

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
        initialText: config.initialText || null,
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
            // Start with a specific greeting if provided, otherwise generic
            const greeting = scenario.initialText || "Hello?";
            chatHistory = [{ role: 'ai', content: greeting }];
        }
    } catch (e) {
        chatHistory = [{ role: 'ai', content: "Hello?" }];
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
        const greeting = scenario.initialText || "Hello?";
        chatHistory = [{ role: 'ai', content: greeting }];
        localStorage.removeItem(`dojo-chat-${scenario.scenarioId}`);
        renderIncomingCall();
    }

    // --- RENDER STATES ---

    const renderIncomingCall = () => {
        playRingtone();
        container.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; padding: 1rem 0;">
                <!-- Phone Frame -->
                <div class="glass fade-in phone-frame" style="width: 320px; height: 650px; max-height: 90vh; border-radius: 36px; border: 10px solid #000; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), inset 0 0 0 2px #333; position: relative; overflow: hidden; background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); display: flex; flex-direction: column; flex-shrink: 0;">
                    
                    <!-- Hardware Notch -->
                    <div style="position: absolute; top: -1px; left: 50%; transform: translateX(-50%); width: 130px; height: 26px; background: #000; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; z-index: 50; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <div style="width: 34px; height: 5px; border-radius: 3px; background: #222;"></div>
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: #2a2a2a; border: 1px solid #111;"></div>
                    </div>
                    
                    <!-- Top Status Bar (fake) -->
                    <div style="display: flex; justify-content: space-between; padding: 10px 18px; font-size: 12px; color: white; font-weight: 600; z-index: 40; opacity: 0.9;">
                        <span>12:36</span>
                        <div style="display: flex; gap: 5px; align-items: center;">
                            <!-- Signal Bars -->
                            <div style="display: flex; gap: 2px; align-items: flex-end; height: 9px;">
                                <div style="width: 3px; height: 3px; background: white; border-radius: 1px;"></div>
                                <div style="width: 3px; height: 5px; background: white; border-radius: 1px;"></div>
                                <div style="width: 3px; height: 7px; background: white; border-radius: 1px;"></div>
                                <div style="width: 3px; height: 9px; background: white; border-radius: 1px;"></div>
                            </div>
                            <!-- WiFi -->
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 3C7.95 3 4.21 4.34 1.2 6.6L3 9C5.5 7.12 8.62 6 12 6s6.5 1.12 9 3l1.8-2.4C19.79 4.34 16.05 3 12 3zm0 5C9.36 8 6.98 8.87 5.04 10.36L6.84 12.8C8.35 11.64 10.11 11 12 11s3.65.64 5.16 1.8l1.8-2.44C17.02 8.87 14.64 8 12 8zm0 5c-1.4 0-2.69.45-3.75 1.21L10 16.5C10.58 16.18 11.26 16 12 16s1.42.18 2 .5l1.75-2.29C14.69 13.45 13.4 13 12 13zM12 18c-.83 0-1.5.67-1.5 1.5S11.17 21 12 21s1.5-.67 1.5-1.5S12.83 18 12 18z"/></svg>
                            <!-- Battery -->
                            <div style="width: 18px; height: 8px; border: 1px solid white; border-radius: 2px; padding: 1px; position: relative;">
                                <div style="width: 11px; height: 100%; background: white; border-radius: 1px;"></div>
                                <div style="position: absolute; right: -3px; top: 1px; width: 2px; height: 4px; background: white; border-radius: 0 2px 2px 0;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Background Pulse Animation -->
                    <div style="position: absolute; top:0; left:0; right:0; bottom:0; overflow:hidden; z-index:0; pointer-events: none;">
                        <div style="position: absolute; top: 35%; left: 50%; transform: translate(-50%, -50%); width: 70%; aspect-ratio: 1; background: rgba(18, 142, 205, 0.15); border-radius: 50%; animation: pulse-ring 2.5s infinite;"></div>
                    </div>

                    <!-- Main Content Area -->
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; z-index: 1; padding: 1.5rem 1.25rem 0 1.25rem; overflow: hidden;">
                        
                        <div style="flex-shrink: 0; width: 70px; height: 70px; background: linear-gradient(135deg, #475569, #334155); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 0.75rem; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 2px solid rgba(255,255,255,0.1);">
                            <svg width="35" height="35" viewBox="0 0 24 24" fill="white" opacity="0.9"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        </div>
                        
                        <h2 style="margin: 0; font-size: 1.4rem; font-weight: 300; color: #f8fafc; letter-spacing: 0.5px; text-align: center;">Incoming Call...</h2>
                        <p style="color: #94a3b8; font-size: 1rem; margin-top: 0.3rem; font-weight: 400; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${scenario.role}</p>
                        
                        <div style="margin-top: 1.2rem; width: 100%;">
                            <!-- Situation Brief -->
                            <div style="background: rgba(0,0,0,0.25); padding: 0.8rem; border-radius: 12px; margin-bottom: 0.6rem; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08);">
                                <strong style="color: #cbd5e1; display: block; margin-bottom: 0.3rem; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px;">Situation</strong>
                                <p style="color: #94a3b8; font-size: 0.85rem; margin: 0; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${scenario.intro}</p>
                            </div>
                            
                            <!-- Goal -->
                            <div style="background: rgba(0,0,0,0.25); padding: 0.8rem; border-radius: 12px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08);">
                                <strong style="color: #cbd5e1; display: block; margin-bottom: 0.3rem; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px;">Goal</strong>
                                <p style="color: #94a3b8; font-size: 0.85rem; margin: 0; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${scenario.objective}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Footer / Actions - iOS Style -->
                    <div style="flex-shrink: 0; display: flex; justify-content: space-between; padding: 1.2rem 2.5rem 1.5rem 2.5rem; z-index: 10; background: linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, transparent 100%);">
                        <!-- Decline -->
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                            <button id="decline-btn" style="width: 60px; height: 60px; border-radius: 50%; background: #ff3b30; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; box-shadow: 0 4px 15px rgba(255, 59, 48, 0.4);">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="white" style="transform: rotate(135deg);"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                            </button>
                            <span style="color: #fff; font-size: 0.8rem; font-weight: 500;">Decline</span>
                        </div>
                        
                        <!-- Accept -->
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                            <button id="accept-btn" style="width: 60px; height: 60px; border-radius: 50%; background: #34c759; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; animation: pulse-green 2s infinite; box-shadow: 0 4px 15px rgba(52, 199, 89, 0.4);">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                            </button>
                            <span style="color: #fff; font-size: 0.8rem; font-weight: 500;">Accept</span>
                        </div>
                    </div>
                    
                    <!-- Home indicator -->
                    <div style="position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); width: 110px; height: 4px; background: white; border-radius: 2px; opacity: 0.5; z-index: 50;"></div>
                    
                    <style>
                        @keyframes pulse-ring { 0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; } 50% { opacity: 0.5; } 100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; } }
                        @keyframes pulse-green { 0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.7); } 70% { box-shadow: 0 0 0 20px rgba(52, 199, 89, 0); } 100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); } }
                    </style>
                </div>
            </div>
        `;

        container.querySelector('#accept-btn').onclick = () => {
            stopRingtone();
            renderActiveCall();
        };

        container.querySelector('#decline-btn').onclick = async () => {
            stopRingtone();
            await fswAlert("Simulation skipped (demo only)"); // Could also just reset
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
                         <button id="voice-toggle-btn" title="Toggle Voice Mode" style="background: rgba(255, 255, 255, 0.1); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                        </button>
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
                    <button id="dictate-btn" title="Hold to Speak" style="background: rgba(255, 255, 255, 0.1); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 50%; width: 42px; height: 42px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    </button>
                    <button id="send-btn" style="background: var(--primary); color: white; border: none; border-radius: 50%; width: 42px; height: 42px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
                
                 <!-- End Call Modal (Hidden by default) -->
                <div id="end-call-modal" style="display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.8); z-index: 200; backdrop-filter: blur(5px); flex-direction: column; align-items: center; justify-content: center;">
                    <div style="background: #1e293b; padding: 2rem; border-radius: 12px; border: 1px solid var(--glass-border); width: 80%; max-width: 320px; text-align: center;">
                        <h3 style="margin-top: 0; color: white;">End Call?</h3>
                        <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 2rem;">Are you sure you want to hang up? The AI will automatically end the simulation once you successfully achieve the goal.</p>
                        
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                             <button id="modal-resume" style="padding: 10px; background: transparent; border: 1px solid #475569; color: white; border-radius: 8px; cursor: pointer;">Resume Call</button>
                             <button id="modal-end-incomplete" style="padding: 10px; background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #ef4444; border-radius: 8px; cursor: pointer;">End (Retry Later)</button>
                        </div>
                    </div>
                </div>

                <style>
                    @keyframes pulse-recording { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
                </style>
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

        // Voice Mode Toggle
        let isVoiceMode = false;
        const voiceBtn = container.querySelector('#voice-toggle-btn');
        const voiceIconContent = voiceBtn.querySelector('svg');
        const iconVolumeX = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>`;
        const iconVolume2 = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;

        voiceBtn.onclick = () => {
            isVoiceMode = !isVoiceMode;
            if (isVoiceMode) {
                voiceBtn.style.color = '#22c55e';
                voiceBtn.style.borderColor = '#22c55e';
                voiceIconContent.innerHTML = iconVolume2;
            } else {
                voiceBtn.style.color = '#cbd5e1';
                voiceBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                voiceIconContent.innerHTML = iconVolumeX;
            }
        };

        // Dictation (Speech to Text)
        const dictateBtn = container.querySelector('#dictate-btn');
        let recognition = null;
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            
            let isRecording = false;

            recognition.onstart = () => {
                isRecording = true;
                dictateBtn.style.color = '#ef4444';
                dictateBtn.style.borderColor = '#ef4444';
                dictateBtn.style.animation = 'pulse-recording 1.5s infinite';
                input.placeholder = "Listening...";
                input.focus();
            };

            recognition.onresult = (event) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                if (finalTranscript) {
                   input.value = (input.value + " " + finalTranscript).trim();
                   input.style.height = 'auto';
                   input.style.height = (input.scrollHeight) + 'px';
                }
            };

            recognition.onerror = (event) => {
                console.error("Speech Recognition Error", event.error);
                stopDictation();
            };

            recognition.onend = () => {
                stopDictation();
            };

            const toggleDictation = () => {
                if (isRecording) {
                    recognition.stop();
                } else {
                    recognition.start();
                }
            };

            const stopDictation = () => {
                isRecording = false;
                dictateBtn.style.color = '#cbd5e1';
                dictateBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                dictateBtn.style.animation = 'none';
                input.placeholder = "Type your response...";
            };

            dictateBtn.onclick = toggleDictation;
        } else {
            dictateBtn.style.display = 'none';
        }

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

            let callComplete = false;

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

                if (isVoiceMode) {
                    const cleanResponseForAudio = response.replace(/\[SUCCESS\]/g, '').trim();
                    if (cleanResponseForAudio) {
                        generateChatAudio(cleanResponseForAudio).then(audioUrl => {
                            if (audioUrl) {
                                const audio = new Audio(audioUrl);
                                audio.play().catch(e => console.error("Audio play failed:", e));
                            }
                        });
                    }
                }

                if (response.includes('[SUCCESS]')) {
                    callComplete = true;
                    clearInterval(callTimerInterval);
                    container.querySelector('#call-status').innerHTML = '<span style="color:var(--accent)">✓ MISSION COMPLETE</span>';

                    // Explicitly trigger completion event
                    triggerCompletion();

                    // Automatically end the call after a short delay so the user can read the final message
                    setTimeout(() => {
                        renderCallEndedScreen(true);
                    }, 4000);
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
                if (!callComplete) {
                    if (input) {
                        input.disabled = false;
                        input.focus();
                    }
                    if (sendBtn) sendBtn.disabled = false;
                }
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
