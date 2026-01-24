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
    const incomingEmail = config.incoming_email || "Subject: Urgent Update Required\n\nHi,\n\nI haven't heard back about the project status yet. We are getting worried. What is going on?\n\n- Dave";
    const initialText = "";

    // Internal State
    let currentScore = 0;
    let isAnalyzing = false;

    // Inject HTML Structure
    container.innerHTML = `
        <div class="tone-analyser-ui fade-in">
            
            <!-- Header Row: Title & Score -->
            <div class="tone-header-row">
                <h3 style="margin: 0; color: var(--primary); font-size: 1.4rem;">Communication Lab</h3>
                
                <!-- Score Ring (Top Right) -->
                <div class="tone-score-ring">
                    <svg viewBox="0 0 100 100">
                        <circle class="ring-bg" cx="50" cy="50" r="45"></circle>
                        <circle class="ring-progress" id="score-circle" cx="50" cy="50" r="45" stroke-dasharray="0 283"></circle>
                    </svg>
                    <div class="tone-score-value">
                        <span class="tone-score-number" id="score-display">--</span>
                        <span class="tone-score-label">Score</span>
                    </div>
                </div>
            </div>

            <!-- Context Section -->
            <div class="tone-section">
                <label class="tone-editor-label">Context: Incoming Email</label>
                <div class="email-context-card">
                    <div class="email-meta">
                        <span>From: <strong>Stakeholder</strong></span>
                        <span>To: <strong>You</strong></span>
                    </div>
                    <div class="email-body">${escapeHtml(incomingEmail)}</div>
                </div>
            </div>

            <!-- Editor Section -->
            <div class="tone-section">
                 <label class="tone-editor-label">Your Draft Response</label>
                 <textarea id="tone-input-area" placeholder="Draft your professional reply here..." class="tone-input">${initialText}</textarea>
            </div>

            <!-- Actions -->
            <div class="tone-actions-row">
                <div id="word-count" style="color: var(--text-muted); font-size: 0.8rem;">0 words</div>
                <button id="analyze-btn" class="btn-primary" style="display: flex; align-items: center; gap: 0.5rem; padding-left: 2rem; padding-right: 2rem;">
                    <span>✨ Analyze Tone</span>
                </button>
            </div>

            <!-- Results Section (Feedback Only) -->
            <div class="tone-results-area" style="justify-content: center;">
                
                <!-- Feedback Box -->
                <div class="ai-feedback-box" id="feedback-box">
                    <div class="feedback-status" id="feedback-title">Ready to Coach</div>
                    <div class="feedback-text" id="feedback-content">
                        Start typing your email draft. When you're ready, click <strong>Analyze Tone</strong> for detailed AI feedback.
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
    scoreCircle.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
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
        wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;

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

