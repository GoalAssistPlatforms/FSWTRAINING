import { analyzeTone } from '../../api/ai';


const escapeHtml = (unsafe) => {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function renderToneAnalyser(containerId, config = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Config defaults
    const context = config.context || "Draft a professional response.";

    // Use realistic default if none provided, or override if it matches the generic prompt
    let incomingEmail = config.incoming_email || "";

    // Hard override for the specific scenario mentioned by user if it matches the generic text
    let instruction = "";
    if (!incomingEmail || incomingEmail.includes("notification about a team member's absence") || incomingEmail.includes("You receive an email from a team member")) {
        instruction = "You receive a notification about a team member's absence. Draft an appropriate response.";
        incomingEmail = "Hi,\n\nI'm writing to let you know I won't be able to make it in today. I woke up feeling pretty unwell and don't think I'm up to coming in. I'll check emails if urgent.\n\nThanks,\nDave";
    }

    const initialText = "";

    // Internal State
    let currentScore = 0;
    let isAnalyzing = false;

    // Inject HTML Structure
    container.innerHTML = `
        ${instruction ? `<div class="instruction-banner" style="margin-bottom: 1rem; color: #e4e4e7; font-size: 0.95rem; background: #27272a; padding: 1rem; border-radius: 8px; border: 1px solid #3f3f46;">${instruction}</div>` : ''}
        <div class="email-client-container fade-in">
        <!-- Header Bar -->
        <div class="email-header-bar">
            <div class="email-subject">Subject: Absence today</div>

            <!-- Coach Widget (Top Right) -->
            <div class="email-coach-widget" id="feedback-box">
                <div class="tone-score-ring" style="width: 24px; height: 24px; margin-right: 0.5rem;">
                    <svg viewBox="0 0 100 100">
                        <circle class="ring-bg" cx="50" cy="50" r="45"></circle>
                        <circle class="ring-progress" id="score-circle" cx="50" cy="50" r="45" stroke-dasharray="0 283"></circle>
                    </svg>
                </div>
                <div class="coach-status-text" id="feedback-title">Ready to Coach</div>
                <span id="score-display" style="display:none">0</span>
            </div>
        </div>

        <!-- Message Pane (Incoming) -->
        <div class="email-message-pane">
            <div class="email-meta-row">
                <div class="avatar-circle">D</div>
                <div class="sender-info">
                    <span class="sender-name">Dave (Stakeholder)</span>
                    <span class="sender-details">To: You &bull; Today, 10:23 AM</span>
                </div>
            </div>
            <div class="email-body-content">${escapeHtml(incomingEmail).replace(/\n/g, '<br>')}</div>
        </div>

        <!-- Coach Feedback Banner (Dynamic) -->
        <div id="feedback-content" style="padding: 0.75rem 2rem; background: #27272a; color: #a1a1aa; font-size: 0.9rem; border-top: 1px solid #3f3f46; border-bottom: 1px solid #3f3f46; min-height: 20px;">
            
        </div>

        <!-- Reply Area -->
        <div class="email-reply-area">
            <div class="reply-container">
                <div class="reply-header">
                    <span>Replying to: <strong>Dave</strong></span>
                </div>
                <!-- Fake Toolbar -->
                <div class="fake-toolbar">
                    <div class="toolbar-btn" style="font-weight: bold;">B</div>
                    <div class="toolbar-btn" style="font-style: italic;">I</div>
                    <div class="toolbar-btn" style="text-decoration: underline;">U</div>
                    <div class="toolbar-btn">🔗</div>
                </div>

                <textarea id="tone-input-area" class="reply-textarea" placeholder="Write your reply...">${initialText}</textarea>

                <div class="reply-actions" style="padding: 1rem; border-top: 1px solid #27272a; background: #18181b; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; gap: 1rem; align-items: center;">
                        <button id="analyze-btn" class="btn-send-email">
                            <span>Send</span>
                        </button>
                        <button class="btn-discard">
                            <span style="font-size: 1.1rem; opacity: 0.6;">🗑️</span>
                        </button>
                    </div>
                    <div id="word-count" style="color: var(--text-muted); font-size: 0.8rem;">0 words</div>
                </div>
            </div>
        </div>
    </div>
    `;

    // Elements
    const textarea = container.querySelector('#tone-input-area');
    const analyzeBtn = container.querySelector('#analyze-btn');
    const scoreCircle = container.querySelector('#score-circle');
    const scoreDisplay = container.querySelector('#score-display');
    const feedbackBox = container.querySelector('#feedback-box');
    const feedbackTitle = container.querySelector('#feedback-title');
    const feedbackContent = container.querySelector('#feedback-content');
    const wordCount = container.querySelector('#word-count');

    // Ring Calculations (r=45 -> circumference ~283)
    const CIRCUMFERENCE = 2 * Math.PI * 45;
    scoreCircle.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE} `;
    scoreCircle.style.strokeDashoffset = CIRCUMFERENCE;

    const updateScoreRing = (score) => {
        const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
        scoreCircle.style.strokeDashoffset = offset;
        scoreDisplay.textContent = score;

        // Color Logic
        let color = '#ef4444'; // Red
        if (score >= 80) color = '#10b981'; // Green
        else if (score >= 60) color = '#f59e0b'; // Amber

        scoreCircle.style.stroke = color;
        feedbackBox.style.borderLeftColor = color;
        scoreDisplay.style.color = color;
    };

    // Heuristics (Real-time)
    const runHeuristics = (text) => {
        const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
        wordCount.textContent = `${words} word${words !== 1 ? 's' : ''} `;

        // Basic "typing" feedback if analysis hasn't happened yet
        if (currentScore === 0 && !isAnalyzing) {
            if (words < 5) {
                feedbackContent.textContent = "Keep writing...";
                feedbackBox.style.borderLeftColor = "var(--text-muted)";
            } else if (words > 10) {
                feedbackContent.textContent = "Looking good. Click Analyze when finished.";
            }
        }
    };

    // AI Analysis
    const performAnalysis = async () => {
        const text = textarea.value.trim();
        if (!text || text.length < 10) {
            feedbackContent.textContent = "Please write a bit more before analyzing.";
            return;
        }

        isAnalyzing = true;
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = `<span>⏳ Analyzing...</span>`;

        // Loader State
        feedbackTitle.textContent = "AI Analysis in Progress";
        feedbackContent.innerHTML = `<div class="feedback-loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;

        try {
            // Call API
            const result = await analyzeTone(text, context, incomingEmail);

            // Update State
            currentScore = result.score;
            updateScoreRing(currentScore);

            // Update Feedback
            feedbackTitle.textContent = "Coach Feedback";
            feedbackTitle.style.color = currentScore >= 80 ? "#10b981" : (currentScore >= 60 ? "#f59e0b" : "#ef4444");

            // Add icon prefix
            // Add icon prefix
            const icon = currentScore >= 80 ? "✅ " : (currentScore >= 60 ? "⚠️ " : "🛑 ");
            feedbackContent.textContent = icon + result.feedback;

            // Success Logic
            if (currentScore >= 75) {
                // Dispatch event for CoursePlayer
                container.dispatchEvent(new CustomEvent('lesson-activity-complete', { bubbles: true }));

                // Show Success Screen
                setTimeout(() => {
                    container.innerHTML = `
                        <div class="tone-analyser-ui fade-in" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 3rem;">
                            <div style="background: rgba(16, 185, 129, 0.1); border: 2px solid #10b981; border-radius: 50%; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem;">
                                <span style="font-size: 3rem;">🎉</span>
                            </div>
                            <h2 style="color: white; margin-bottom: 1rem; font-size: 2rem;">Excellent Work!</h2>
                            <p style="color: var(--text-muted); font-size: 1.2rem; max-width: 500px; margin-bottom: 2rem; line-height: 1.6;">
                                You've demonstrated a professional command of the situation with a score of <strong style="color: #10b981;">${currentScore}</strong>.
                            </p>
                            <div style="padding: 1rem 2rem; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 2rem;">
                                "<em>${result.feedback}</em>"
                            </div>
                            <div style="color: #10b981; font-weight: bold; display: flex; align-items: center; gap: 0.5rem;">
                                <span>✓</span> Activity Complete
                            </div>
                            </div>
                        </div>
        `;
                }, 1500); // Small delay to let them see the ring update first
            }

        } catch (error) {
            console.error("Tone Analysis Failed:", error);
            feedbackTitle.textContent = "Analysis Failed";
            feedbackContent.textContent = "Error: " + (error.message || "Could not reach the coaching server.");
        } finally {
            isAnalyzing = false;
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = `<span>✨ Analyze Tone</span>`;
        }
    };

    // Event Listeners
    textarea.addEventListener('input', (e) => runHeuristics(e.target.value));

    analyzeBtn.addEventListener('click', () => {
        performAnalysis();
    });

    // Initial check
    if (initialText) runHeuristics(initialText);
}

