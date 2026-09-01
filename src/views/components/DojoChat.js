import { chatWithDojo } from '../../api/ai.js';
import { generateChatAudio } from '../../api/elevenlabs.js';
import { fswAlert } from '../../utils/dialog.js';

const getSpeechRecognitionErrorMessage = error => {
    switch (error) {
        case 'not-allowed':
        case 'service-not-allowed':
            return 'Microphone access is blocked. Allow microphone access in your browser and try again.';
        case 'audio-capture':
            return 'No microphone was found. Check your microphone and try again.';
        case 'no-speech':
            return 'I did not hear anything. Tap the microphone and try again.';
        case 'network':
            return 'Speech recognition could not connect. Check your connection and try again.';
        default:
            return 'I could not hear that clearly. Tap the microphone and try again.';
    }
};

const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function renderDojoChat(containerId, config = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let rawRole = config.role || 'A customer interested in bulk refrigeration units';
    if (rawRole.toLowerCase().includes(' or ')) {
        const parts = rawRole.split(/ or /i);
        rawRole = parts[Math.floor(Math.random() * parts.length)].trim();
    }

    const scenario = {
        role: rawRole,
        objective: config.objective || 'Handle the inquiry professionally and suggest a site survey',
        intro: config.intro || "I've been looking at your Mitsubishi Electric range, but I'm worried about the lead times.",
        initialText: config.initialText || null,
        scenarioId: config.scenarioId || 'generic-fsw',
        skills: config.skills || ['Customer Service', 'Product Knowledge', 'Negotiation']
    };

    let chatHistory = [];
    let callTimerInterval;
    let callSeconds = 0;
    let activeAudio = null;
    let activeRecognition = null;

    try {
        const stored = localStorage.getItem(`dojo-chat-${scenario.scenarioId}`);
        if (stored) {
            chatHistory = JSON.parse(stored);
        } else {
            chatHistory = [{ role: 'ai', content: scenario.initialText || 'Hello?' }];
        }
    } catch (error) {
        chatHistory = [{ role: 'ai', content: scenario.initialText || 'Hello?' }];
    }

    const saveChat = () => {
        localStorage.setItem(`dojo-chat-${scenario.scenarioId}`, JSON.stringify(chatHistory));
    };

    const formatTime = secs => {
        const minutes = Math.floor(secs / 60).toString().padStart(2, '0');
        const seconds = (secs % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    };

    const stopActiveMedia = () => {
        try {
            activeRecognition?.abort?.();
        } catch (error) {
            console.warn('Speech recognition cleanup failed', error);
        }
        activeRecognition = null;

        if (activeAudio) {
            activeAudio.pause();
            if (activeAudio.src?.startsWith('blob:')) URL.revokeObjectURL(activeAudio.src);
            activeAudio = null;
        }
    };

    const startTimer = () => {
        clearInterval(callTimerInterval);
        callSeconds = 0;
        const timer = container.querySelector('#call-timer');
        if (timer) timer.textContent = '00:00';
        callTimerInterval = setInterval(() => {
            callSeconds += 1;
            const currentTimer = container.querySelector('#call-timer');
            if (currentTimer) currentTimer.textContent = formatTime(callSeconds);
        }, 1000);
    };

    const resetSimulation = () => {
        stopActiveMedia();
        clearInterval(callTimerInterval);
        chatHistory = [{ role: 'ai', content: scenario.initialText || 'Hello?' }];
        localStorage.removeItem(`dojo-chat-${scenario.scenarioId}`);
        renderIncomingCall();
    };

    const renderIncomingCall = () => {
        stopActiveMedia();
        container.innerHTML = `
            <div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;padding:1rem 0;">
                <div class="glass fade-in phone-frame" style="width:320px;height:650px;max-height:90vh;border-radius:36px;border:10px solid #000;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5),inset 0 0 0 2px #333;position:relative;overflow:hidden;background:linear-gradient(180deg,#1e293b 0%,#0f172a 100%);display:flex;flex-direction:column;flex-shrink:0;">
                    <div style="position:absolute;top:-1px;left:50%;transform:translateX(-50%);width:130px;height:26px;background:#000;border-bottom-left-radius:16px;border-bottom-right-radius:16px;z-index:50;display:flex;align-items:center;justify-content:center;gap:8px;">
                        <div style="width:34px;height:5px;border-radius:3px;background:#222;"></div>
                        <div style="width:8px;height:8px;border-radius:50%;background:#2a2a2a;border:1px solid #111;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:10px 18px;font-size:12px;color:white;font-weight:600;z-index:40;opacity:0.9;">
                        <span>12:36</span>
                        <div style="display:flex;gap:5px;align-items:center;">
                            <div style="display:flex;gap:2px;align-items:flex-end;height:9px;">
                                <div style="width:3px;height:3px;background:white;border-radius:1px;"></div>
                                <div style="width:3px;height:5px;background:white;border-radius:1px;"></div>
                                <div style="width:3px;height:7px;background:white;border-radius:1px;"></div>
                                <div style="width:3px;height:9px;background:white;border-radius:1px;"></div>
                            </div>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 3C7.95 3 4.21 4.34 1.2 6.6L3 9C5.5 7.12 8.62 6 12 6s6.5 1.12 9 3l1.8-2.4C19.79 4.34 16.05 3 12 3zm0 5C9.36 8 6.98 8.87 5.04 10.36L6.84 12.8C8.35 11.64 10.11 11 12 11s3.65.64 5.16 1.8l1.8-2.44C17.02 8.87 14.64 8 12 8zm0 5c-1.4 0-2.69.45-3.75 1.21L10 16.5C10.58 16.18 11.26 16 12 16s1.42.18 2 .5l1.75-2.29C14.69 13.45 13.4 16 12 16s1.42.18 2 .5l1.75-2.29C14.69 13.45 13.4 13 12 13zM12 18c-.83 0-1.5.67-1.5 1.5S11.17 21 12 21s1.5-.67 1.5-1.5S12.83 18 12 18z"/></svg>
                            <div style="width:18px;height:8px;border:1px solid white;border-radius:2px;padding:1px;position:relative;"><div style="width:11px;height:100%;background:white;border-radius:1px;"></div><div style="position:absolute;right:-3px;top:1px;width:2px;height:4px;background:white;border-radius:0 2px 2px 0;"></div></div>
                        </div>
                    </div>
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;z-index:1;padding:1.5rem 1.25rem 0;overflow:hidden;">
                        <div style="flex-shrink:0;width:70px;height:70px;background:linear-gradient(135deg,#475569,#334155);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:0.75rem;box-shadow:0 10px 25px rgba(0,0,0,0.3);border:2px solid rgba(255,255,255,0.1);"><svg width="35" height="35" viewBox="0 0 24 24" fill="white" opacity="0.9"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
                        <h2 style="margin:0;font-size:1.4rem;font-weight:300;color:#f8fafc;letter-spacing:0.5px;text-align:center;">Incoming Call...</h2>
                        <p style="color:#94a3b8;font-size:1rem;margin-top:0.3rem;font-weight:400;text-align:center;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(scenario.role)}</p>
                        <div style="margin-top:1.2rem;width:100%;">
                            <div style="background:rgba(0,0,0,0.25);padding:0.8rem;border-radius:12px;margin-bottom:0.6rem;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.08);"><strong style="color:#cbd5e1;display:block;margin-bottom:0.3rem;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;">Situation</strong><p style="color:#94a3b8;font-size:0.85rem;margin:0;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(scenario.intro)}</p></div>
                            <div style="background:rgba(0,0,0,0.25);padding:0.8rem;border-radius:12px;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.08);"><strong style="color:#cbd5e1;display:block;margin-bottom:0.3rem;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;">Goal</strong><p style="color:#94a3b8;font-size:0.85rem;margin:0;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(scenario.objective)}</p></div>
                        </div>
                    </div>
                    <div style="flex-shrink:0;display:flex;justify-content:space-between;padding:1.2rem 2.5rem 1.5rem;z-index:10;background:linear-gradient(to top,rgba(15,23,42,0.95) 0%,transparent 100%);">
                        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;"><button id="decline-btn" style="width:60px;height:60px;border-radius:50%;background:#ff3b30;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(255,59,48,0.4);"><svg width="28" height="28" viewBox="0 0 24 24" fill="white" style="transform:rotate(135deg);"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></button><span style="color:#fff;font-size:0.8rem;font-weight:500;">Decline</span></div>
                        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;"><button id="accept-btn" style="width:60px;height:60px;border-radius:50%;background:#34c759;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;animation:pulse-green 2s infinite;box-shadow:0 4px 15px rgba(52,199,89,0.4);"><svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></button><span style="color:#fff;font-size:0.8rem;font-weight:500;">Accept</span></div>
                    </div>
                    <div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);width:110px;height:4px;background:white;border-radius:2px;opacity:0.5;z-index:50;"></div>
                    <style>@keyframes pulse-green{0%{box-shadow:0 0 0 0 rgba(52,199,89,0.7)}70%{box-shadow:0 0 0 20px rgba(52,199,89,0)}100%{box-shadow:0 0 0 0 rgba(52,199,89,0)}}</style>
                </div>
            </div>`;

        container.querySelector('#accept-btn').onclick = renderModeSelection;
        container.querySelector('#decline-btn').onclick = async () => {
            await fswAlert('Simulation skipped (demo only)');
        };
    };

    const renderModeSelection = () => {
        container.innerHTML = `
            <div class="glass fade-in" style="height:600px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;background:#0f172a;border-radius:var(--radius-lg);border:1px solid var(--glass-border);">
                <div style="font-size:3.5rem;margin-bottom:1.5rem;">📱</div>
                <h2 style="color:white;margin:0 0 1rem;font-weight:300;">Choose Connection Mode</h2>
                <p style="color:#94a3b8;margin-bottom:3rem;max-width:80%;">How would you like to handle this interaction?</p>
                <div style="display:flex;gap:1.5rem;width:100%;max-width:400px;padding:0 2rem;box-sizing:border-box;">
                    <button id="mode-call-btn" style="flex:1;background:rgba(52,199,89,0.1);border:1px solid #34c759;color:#34c759;padding:1.5rem;border-radius:16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:0.75rem;"><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg><span style="font-weight:600;font-size:1.1rem;">Voice Call</span></button>
                    <button id="mode-text-btn" style="flex:1;background:rgba(56,189,248,0.1);border:1px solid #38bdf8;color:#38bdf8;padding:1.5rem;border-radius:16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:0.75rem;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span style="font-weight:600;font-size:1.1rem;">Text Chat</span></button>
                </div>
            </div>`;
        container.querySelector('#mode-call-btn').onclick = () => renderActiveCall('call');
        container.querySelector('#mode-text-btn').onclick = () => renderActiveCall('text');
    };

    const renderMessages = () => {
        const messageContainer = container.querySelector('#chat-messages');
        if (!messageContainer) return;
        messageContainer.innerHTML = chatHistory.map(message => {
            const isUser = message.role === 'user';
            const isSuccess = message.content.includes('[SUCCESS]');
            const displayContent = escapeHtml(message.content.replace('[SUCCESS]', '').replace('[FAILED]', ''));
            return `<div style="display:flex;gap:10px;${isUser ? 'flex-direction:row-reverse;' : ''}"><div style="width:32px;height:32px;border-radius:50%;background:${isUser ? 'var(--primary)' : '#475569'};display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:white;font-weight:bold;flex-shrink:0;">${isUser ? 'ME' : 'C'}</div><div style="max-width:75%;padding:0.75rem 1rem;border-radius:18px;${isUser ? 'background:var(--primary);color:white;border-bottom-right-radius:4px;' : 'background:#334155;color:#f1f5f9;border-bottom-left-radius:4px;'}font-size:0.95rem;line-height:1.5;">${displayContent}${isSuccess ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);color:#86efac;font-size:0.8rem;font-weight:bold;">✓ Simulator Goal Achieved</div>' : ''}</div></div>`;
        }).join('');
        messageContainer.scrollTop = messageContainer.scrollHeight;
    };

    const renderActiveCall = initialMode => {
        stopActiveMedia();
        container.innerHTML = `
            <div class="glass fade-in" data-mode="${initialMode}" style="display:flex;flex-direction:column;height:600px;border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--glass-border);background:#0f172a;position:relative;">
                <div id="mission-overlay" style="display:none;position:absolute;top:70px;right:10px;left:10px;background:rgba(15,23,42,0.98);border:1px solid var(--glass-border);border-radius:12px;padding:1.5rem;z-index:100;box-shadow:0 20px 50px rgba(0,0,0,0.5);"><div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem;"><h4 style="margin:0;color:white;">Mission Brief</h4><button id="close-mission-btn" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.2rem;">×</button></div><div style="font-size:0.9rem;color:#cbd5e1;line-height:1.5;"><p><strong style="color:var(--primary);">Context:</strong> ${escapeHtml(scenario.intro)}</p><p><strong style="color:var(--primary);">Goal:</strong> ${escapeHtml(scenario.objective)}</p></div></div>
                <div style="background:rgba(30,41,59,0.8);border-bottom:1px solid var(--glass-border);padding:1rem;display:flex;align-items:center;justify-content:space-between;z-index:50;"><div style="display:flex;align-items:center;gap:1rem;"><div style="width:40px;height:40px;background:#334155;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;">?</div><div><h4 style="margin:0;color:white;font-size:0.95rem;">${escapeHtml(scenario.role)}</h4><span id="call-status" style="font-size:0.75rem;color:#22c55e;display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;background:#22c55e;border-radius:50%;"></span>Connected <span id="call-timer" style="color:#94a3b8;margin-left:4px;">00:00</span></span></div></div><div style="display:flex;gap:0.5rem;"><button id="voice-toggle-btn" title="Toggle Voice Mode" style="background:rgba(255,255,255,0.1);color:#cbd5e1;border:1px solid rgba(255,255,255,0.1);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg></button><button id="mission-info-btn" title="Mission Info" style="background:rgba(255,255,255,0.1);color:#cbd5e1;border:1px solid rgba(255,255,255,0.1);border-radius:50%;width:36px;height:36px;cursor:pointer;">ⓘ</button><button id="end-call-btn" style="background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:20px;padding:6px 16px;font-size:0.8rem;cursor:pointer;">End Call</button></div></div>
                <div id="voice-call-ui" style="flex:1;display:${initialMode === 'call' ? 'flex' : 'none'};flex-direction:column;align-items:center;justify-content:center;padding:2rem;"><div style="width:120px;height:120px;background:linear-gradient(135deg,#475569,#334155);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,0.5);border:4px solid rgba(255,255,255,0.05);margin-bottom:2rem;position:relative;"><svg width="60" height="60" viewBox="0 0 24 24" fill="white" opacity="0.9"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg><div id="ai-speaking-ripple" style="display:none;position:absolute;inset:0;border-radius:50%;border:2px solid #22c55e;animation:voice-ripple 1.5s infinite;"></div></div><h3 style="color:white;margin:0 0 0.5rem;font-weight:400;font-size:1.4rem;text-align:center;">${escapeHtml(scenario.role)}</h3><p id="voice-status-text" style="color:#94a3b8;font-size:1.1rem;margin:0;">Connected</p><div style="margin-top:4rem;"><button id="big-dictate-btn" style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.1);color:#cbd5e1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 15px rgba(0,0,0,0.2);"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg></button></div><p id="voice-help-text" style="color:#64748b;font-size:0.9rem;margin-top:1rem;">Tap to speak</p></div>
                <div id="text-chat-ui" style="flex:1;display:${initialMode === 'text' ? 'flex' : 'none'};flex-direction:column;overflow:hidden;"><div id="chat-messages" style="flex:1;overflow-y:auto;padding:1.5rem;display:flex;flex-direction:column;gap:1rem;background-image:radial-gradient(rgba(255,255,255,0.03) 1px,transparent 1px);background-size:20px 20px;"></div><div style="display:flex;padding:1rem;background:rgba(30,41,59,0.95);border-top:1px solid var(--glass-border);gap:0.75rem;align-items:flex-end;"><div style="flex:1;min-width:0;"><textarea id="chat-input" rows="1" placeholder="Type your response..." style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:20px;padding:10px 1.25rem;outline:none;resize:none;font-family:inherit;font-size:0.95rem;line-height:1.5;"></textarea></div><button id="dictate-btn" title="Speak" style="background:rgba(255,255,255,0.1);color:#cbd5e1;border:1px solid rgba(255,255,255,0.1);border-radius:50%;width:42px;height:42px;cursor:pointer;">🎙</button><button id="send-btn" style="background:var(--primary);color:white;border:none;border-radius:50%;width:42px;height:42px;cursor:pointer;">➤</button></div></div>
                <div id="end-call-modal" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.8);z-index:200;align-items:center;justify-content:center;"><div style="background:#1e293b;padding:2rem;border-radius:12px;border:1px solid var(--glass-border);width:80%;max-width:320px;text-align:center;"><h3 style="margin-top:0;color:white;">End Call?</h3><p style="color:#94a3b8;font-size:0.9rem;margin-bottom:2rem;">Are you sure you want to hang up?</p><div style="display:flex;flex-direction:column;gap:0.75rem;"><button id="modal-resume" style="padding:10px;background:transparent;border:1px solid #475569;color:white;border-radius:8px;cursor:pointer;">Resume Call</button><button id="modal-end-incomplete" style="padding:10px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;color:#ef4444;border-radius:8px;cursor:pointer;">End (Retry Later)</button></div></div></div>
                <style>@keyframes voice-ripple{0%{transform:scale(1);opacity:.8}100%{transform:scale(1.35);opacity:0}}@keyframes pulse-recording{0%{box-shadow:0 0 0 0 rgba(239,68,68,.7)}70%{box-shadow:0 0 0 10px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}</style>
            </div>`;

        startTimer();
        bindActiveEvents(initialMode);
        renderMessages();
    };

    const bindActiveEvents = initialMode => {
        const input = container.querySelector('#chat-input');
        const sendBtn = container.querySelector('#send-btn');
        const dictateBtn = container.querySelector('#dictate-btn');
        const bigDictateBtn = container.querySelector('#big-dictate-btn');
        const voiceStatusText = container.querySelector('#voice-status-text');
        const voiceHelpText = container.querySelector('#voice-help-text');
        const voiceCallUi = container.querySelector('#voice-call-ui');
        const textChatUi = container.querySelector('#text-chat-ui');
        const voiceBtn = container.querySelector('#voice-toggle-btn');
        const endModal = container.querySelector('#end-call-modal');
        let isVoiceMode = initialMode === 'call';
        let isRecording = false;
        let isBusy = false;
        let voiceError = null;
        let openingAudioPlayed = false;

        const setVoiceStatus = text => {
            if (voiceStatusText) voiceStatusText.textContent = text;
        };

        const setMicRecordingState = recording => {
            isRecording = recording;
            [dictateBtn, bigDictateBtn].forEach(button => {
                if (!button) return;
                button.style.color = recording ? '#ef4444' : '#cbd5e1';
                button.style.borderColor = recording ? '#ef4444' : 'rgba(255,255,255,0.1)';
                button.style.animation = recording ? 'pulse-recording 1.5s infinite' : 'none';
            });
            if (bigDictateBtn) bigDictateBtn.style.background = recording ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)';
        };

        const setMicAvailable = available => {
            [dictateBtn, bigDictateBtn].forEach(button => {
                if (!button) return;
                button.disabled = !available;
                button.style.opacity = available ? '1' : '0.5';
                button.style.cursor = available ? 'pointer' : 'not-allowed';
            });
        };

        const renderCallEndedScreen = success => {
            stopActiveMedia();
            clearInterval(callTimerInterval);
            container.innerHTML = `<div class="glass fade-in" style="height:600px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;background:#0f172a;"><div style="font-size:3rem;margin-bottom:1rem;">${success ? '🎉' : '📞'}</div><h3 style="color:white;margin:0 0 .5rem;">Call Ended</h3><p style="color:#94a3b8;margin-bottom:2rem;">${success ? 'Mission Complete' : 'Simulation stopped'}</p><button id="restart-sim-btn" class="btn" style="background:transparent;border:1px solid var(--primary);color:var(--primary);padding:.75rem 2rem;border-radius:8px;cursor:pointer;">Restart Simulation</button></div>`;
            container.querySelector('#restart-sim-btn').onclick = resetSimulation;
        };

        const triggerCompletion = () => {
            container.dispatchEvent(new CustomEvent('lesson-activity-complete', { bubbles: true, composed: true }));
        };

        const playVoiceAudio = async text => {
            const cleanText = String(text || '').replace(/\[SUCCESS\]|\[FAILED\]/g, '').trim();
            if (!cleanText) return;
            const ripple = container.querySelector('#ai-speaking-ripple');
            setMicAvailable(false);
            setVoiceStatus('Caller is speaking...');
            if (ripple) ripple.style.display = 'block';
            let audioUrl = null;
            try {
                audioUrl = await generateChatAudio(cleanText);
                if (!audioUrl) throw new Error('No audio returned');
                await new Promise((resolve, reject) => {
                    const audio = new Audio(audioUrl);
                    activeAudio = audio;
                    audio.onended = resolve;
                    audio.onerror = reject;
                    audio.play().catch(reject);
                });
            } catch (error) {
                console.error('Voice playback failed:', error);
                setVoiceStatus('Voice playback unavailable. You can still speak.');
            } finally {
                if (ripple) ripple.style.display = 'none';
                if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
                activeAudio = null;
                setMicAvailable(true);
                if (!voiceError) setVoiceStatus('Connected');
            }
        };

        const handleSend = async () => {
            const text = input.value.trim();
            if (!text || isBusy) return;
            isBusy = true;
            input.value = '';
            input.style.height = 'auto';
            input.disabled = true;
            sendBtn.disabled = true;
            setMicAvailable(false);
            chatHistory.push({ role: 'user', content: text });
            renderMessages();
            let callComplete = false;

            try {
                chatHistory.push({ role: 'ai', content: '...' });
                renderMessages();
                if (isVoiceMode) setVoiceStatus('Caller is thinking...');
                const response = await chatWithDojo(chatHistory.filter(message => message.content !== '...'), scenario);
                chatHistory.pop();
                chatHistory.push({ role: 'ai', content: response });
                saveChat();
                renderMessages();

                if (isVoiceMode) await playVoiceAudio(response);

                if (response.includes('[SUCCESS]')) {
                    callComplete = true;
                    clearInterval(callTimerInterval);
                    const status = container.querySelector('#call-status');
                    if (status) status.innerHTML = '<span style="color:var(--accent)">✓ MISSION COMPLETE</span>';
                    triggerCompletion();
                    setTimeout(() => renderCallEndedScreen(true), 4000);
                } else if (response.includes('[FAILED]')) {
                    callComplete = true;
                    clearInterval(callTimerInterval);
                    const status = container.querySelector('#call-status');
                    if (status) status.innerHTML = '<span style="color:#ef4444">✕ MISSION FAILED</span>';
                    setTimeout(() => renderCallEndedScreen(false), 4000);
                }
            } catch (error) {
                console.error('Dojo Chat failed:', error);
                if (chatHistory.at(-1)?.content === '...') chatHistory.pop();
                renderMessages();
                if (isVoiceMode) setVoiceStatus('Connection failed. Please try again.');
                const toast = document.createElement('div');
                toast.innerHTML = `<div style="background:#ef4444;color:white;padding:.75rem 1.5rem;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.3);font-size:.9rem;font-weight:500;">⚠️ Connection failed: ${escapeHtml(error.message || 'Unknown error')}</div>`;
                toast.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);z-index:100;';
                container.querySelector('.glass')?.appendChild(toast);
                setTimeout(() => toast.remove(), 4000);
            } finally {
                isBusy = false;
                if (!callComplete) {
                    input.disabled = false;
                    sendBtn.disabled = false;
                    if (!isVoiceMode || !voiceError) setMicAvailable(true);
                    if (!isVoiceMode) input.focus();
                }
            }
        };

        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (Recognition) {
            const recognition = new Recognition();
            activeRecognition = recognition;
            recognition.lang = 'en-GB';
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            let transcript = '';
            let recognitionFailed = false;

            recognition.onstart = () => {
                transcript = '';
                recognitionFailed = false;
                voiceError = null;
                setMicRecordingState(true);
                setVoiceStatus('Listening...');
                input.placeholder = 'Listening...';
            };

            recognition.onresult = event => {
                transcript = Array.from(event.results || []).map(result => result?.[0]?.transcript || '').join(' ').trim();
            };

            recognition.onerror = event => {
                recognitionFailed = true;
                voiceError = event.error;
                console.error('Speech Recognition Error', event.error);
                setVoiceStatus(getSpeechRecognitionErrorMessage(event.error));
            };

            recognition.onend = () => {
                setMicRecordingState(false);
                input.placeholder = 'Type your response...';
                if (transcript) {
                    input.value = transcript;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    if (isVoiceMode) {
                        setVoiceStatus('Sending...');
                        handleSend();
                    }
                } else if (!recognitionFailed) {
                    setVoiceStatus(getSpeechRecognitionErrorMessage('no-speech'));
                }
            };

            const toggleDictation = () => {
                if (isBusy) return;
                if (isRecording) {
                    recognition.stop();
                    return;
                }
                try {
                    recognition.start();
                } catch (error) {
                    console.error('Speech Recognition start failed:', error);
                    setMicRecordingState(false);
                    setVoiceStatus('Microphone could not start. Check permission and try again.');
                }
            };

            dictateBtn.onclick = toggleDictation;
            bigDictateBtn.onclick = toggleDictation;
        } else {
            dictateBtn.style.display = 'none';
            bigDictateBtn.disabled = true;
            bigDictateBtn.style.opacity = '0.45';
            bigDictateBtn.style.cursor = 'not-allowed';
            setVoiceStatus('Voice input is not supported in this browser. Switch to Text Chat.');
            if (voiceHelpText) voiceHelpText.textContent = 'Use Text Chat instead';
        }

        const updateVoiceModeUI = () => {
            if (isVoiceMode) {
                voiceBtn.style.color = '#22c55e';
                voiceBtn.style.borderColor = '#22c55e';
                voiceCallUi.style.display = 'flex';
                textChatUi.style.display = 'none';
            } else {
                voiceBtn.style.color = '#cbd5e1';
                voiceBtn.style.borderColor = 'rgba(255,255,255,0.1)';
                voiceCallUi.style.display = 'none';
                textChatUi.style.display = 'flex';
                renderMessages();
            }
        };

        voiceBtn.onclick = () => {
            if (isRecording) activeRecognition?.stop?.();
            isVoiceMode = !isVoiceMode;
            updateVoiceModeUI();
        };

        container.querySelector('#mission-info-btn').onclick = () => { container.querySelector('#mission-overlay').style.display = 'block'; };
        container.querySelector('#close-mission-btn').onclick = () => { container.querySelector('#mission-overlay').style.display = 'none'; };
        container.querySelector('#end-call-btn').onclick = () => { endModal.style.display = 'flex'; };
        container.querySelector('#modal-resume').onclick = () => { endModal.style.display = 'none'; };
        container.querySelector('#modal-end-incomplete').onclick = () => renderCallEndedScreen(false);

        input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = `${this.scrollHeight}px`;
        });
        sendBtn.onclick = handleSend;
        input.onkeypress = event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
            }
        };

        updateVoiceModeUI();

        if (initialMode === 'call' && !openingAudioPlayed) {
            openingAudioPlayed = true;
            requestAnimationFrame(() => {
                const openingMessage = chatHistory.find(message => message.role === 'ai')?.content || scenario.initialText || 'Hello?';
                playVoiceAudio(openingMessage);
            });
        }
    };

    if (chatHistory.length > 1) {
        renderActiveCall('text');
    } else {
        renderIncomingCall();
    }
}
