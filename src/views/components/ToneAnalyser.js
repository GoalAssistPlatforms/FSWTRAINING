import { analyzeTone } from '../../api/ai';
import { getEscalatedToneFeedback } from '../../api/toneCoaching.js';

const escapeHtml = (unsafe = '') => String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export function renderToneAnalyser(containerId, config = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const context = config.context || 'Draft a professional response.';

    const SCENARIOS = {
        legislative: {
            subject: 'Legislative Changes & Absence Protocols',
            body: 'Dear Team,\n\nAs you may be aware, significant legislative changes are coming into effect that will impact our statutory sick pay and absence protocols.\n\nThese changes are designed to ensure compliance with the new regulations and to better support our workforce. It is crucial that everyone is familiar with these updates to avoid any potential compliance issues.\n\nI would appreciate it if you could review the attached documentation summarizing the key changes and provide your thoughts or confirmation that you have understood the new requirements by the end of the week.\n\nBest regards,\nDave'
        },
        simple_absence: {
            subject: 'Absence today',
            body: "Hi,\n\nI'm writing to let you know I won't be able to make it in today. I woke up feeling pretty unwell and don't think I'm up to coming in. I'll check emails if urgent.\n\nThanks,\nDave"
        }
    };

    let incomingEmail = config.incoming_email || '';
    let subject = config.subject || 'New Message';
    const instruction = '';

    const fullContext = `${context} ${incomingEmail}`.toLowerCase();
    const isLegislative = fullContext.includes('legislative')
        || fullContext.includes('statutory')
        || fullContext.includes('regulation')
        || fullContext.includes('compliance');
    const isAbsence = fullContext.includes('absence')
        || fullContext.includes('sick')
        || fullContext.includes('unwell');

    if (incomingEmail.length > 50) {
        if (!config.subject && isLegislative) subject = SCENARIOS.legislative.subject;
        else if (!config.subject && isAbsence) subject = SCENARIOS.simple_absence.subject;
    } else if (isLegislative) {
        incomingEmail = SCENARIOS.legislative.body;
        subject = config.subject || SCENARIOS.legislative.subject;
    } else if (isAbsence || incomingEmail.includes("notification about a team member's absence")) {
        incomingEmail = SCENARIOS.simple_absence.body;
        subject = config.subject || SCENARIOS.simple_absence.subject;
    } else if (!incomingEmail) {
        subject = 'New Message';
    }

    const initialText = '';
    let senderName = config.sender || 'Dave';
    let senderAvatar = 'D';

    if (!config.sender && incomingEmail) {
        const lines = incomingEmail.trim().split('\n');
        if (lines.length > 1) {
            const lastLine = lines[lines.length - 1].trim();
            const secondLastLine = lines[lines.length - 2].trim().toLowerCase();
            if (
                lastLine
                && lastLine.length < 30
                && !lastLine.includes('.')
                && (
                    secondLastLine.includes('thanks')
                    || secondLastLine.includes('regards')
                    || secondLastLine.includes('best')
                    || secondLastLine.includes('sincerely')
                    || secondLastLine.includes('cheers')
                    || secondLastLine.includes('from')
                    || secondLastLine.includes('respectfully')
                )
            ) {
                senderName = lastLine.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
            }
        }
    }

    if (senderName) senderAvatar = senderName.charAt(0).toUpperCase();

    let currentScore = 0;
    let isAnalyzing = false;
    let submissionAttempts = 0;

    container.innerHTML = `
        ${instruction ? `<div class="instruction-banner" style="margin-bottom: 1rem; color: #e4e4e7; font-size: 0.95rem; background: #27272a; padding: 1rem; border-radius: 8px; border: 1px solid #3f3f46;">${instruction}</div>` : ''}
        <div class="email-client-container fade-in">
            <div class="email-header-bar">
                <div class="email-subject">Subject: ${escapeHtml(subject)}</div>
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

            <div class="email-message-pane">
                <div class="email-meta-row">
                    <div class="avatar-circle">${escapeHtml(senderAvatar)}</div>
                    <div class="sender-info">
                        <span class="sender-name">${escapeHtml(senderName)}</span>
                        <span class="sender-details">To: You &bull; Today, 10:23 AM</span>
                    </div>
                </div>
                <div class="email-body-content">${escapeHtml(incomingEmail).replace(/\n/g, '<br>')}</div>
            </div>

            <div id="feedback-content" style="padding: 0.75rem 2rem; background: #27272a; color: #a1a1aa; font-size: 0.9rem; border-top: 1px solid #3f3f46; border-bottom: 1px solid #3f3f46; min-height: 20px; white-space: pre-line;"></div>

            <div class="email-reply-area">
                <div class="reply-container">
                    <div class="reply-header">
                        <span>Replying to: <strong>${escapeHtml(senderName.split(' ')[0])}</strong></span>
                    </div>
                    <div class="fake-toolbar">
                        <div class="toolbar-btn" style="font-weight: bold;">B</div>
                        <div class="toolbar-btn" style="font-style: italic;">I</div>
                        <div class="toolbar-btn" style="text-decoration: underline;">U</div>
                        <div class="toolbar-btn">🔗</div>
                    </div>

                    <textarea id="tone-input-area" class="reply-textarea" placeholder="Write your reply...">${initialText}</textarea>

                    <div class="reply-actions" style="padding: 1rem; border-top: 1px solid #27272a; background: #18181b; display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; gap: 1rem; align-items: center;">
                            <button id="analyze-btn" class="btn-send-email"><span>Send</span></button>
                            <button class="btn-discard"><span style="font-size: 1.1rem; opacity: 0.6;">🗑️</span></button>
                        </div>
                        <div id="word-count" style="color: var(--text-muted); font-size: 0.8rem;">0 words</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const textarea = container.querySelector('#tone-input-area');
    const analyzeBtn = container.querySelector('#analyze-btn');
    const scoreCircle = container.querySelector('#score-circle');
    const scoreDisplay = container.querySelector('#score-display');
    const feedbackBox = container.querySelector('#feedback-box');
    const feedbackTitle = container.querySelector('#feedback-title');
    const feedbackContent = container.querySelector('#feedback-content');
    const wordCount = container.querySelector('#word-count');

    const CIRCUMFERENCE = 2 * Math.PI * 45;
    scoreCircle.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
    scoreCircle.style.strokeDashoffset = CIRCUMFERENCE;

    const updateScoreRing = (score) => {
        const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
        scoreCircle.style.strokeDashoffset = offset;
        scoreDisplay.textContent = score;

        let color = '#ef4444';
        if (score >= 80) color = '#10b981';
        else if (score >= 60) color = '#f59e0b';

        scoreCircle.style.stroke = color;
        feedbackBox.style.borderLeftColor = color;
        scoreDisplay.style.color = color;
    };

    const runHeuristics = (text) => {
        const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
        wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;

        if (currentScore === 0 && !isAnalyzing) {
            if (words < 5) {
                feedbackContent.textContent = 'Keep writing...';
                feedbackBox.style.borderLeftColor = 'var(--text-muted)';
            } else if (words > 10) {
                feedbackContent.textContent = 'Looking good. Click Send when finished.';
            }
        }
    };

    const showSuccess = (result) => {
        container.dispatchEvent(new CustomEvent('lesson-activity-complete', { bubbles: true }));

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
                        "<em>${escapeHtml(result.feedback || 'Strong response.')}</em>"
                    </div>
                    <div style="color: #10b981; font-weight: bold; display: flex; align-items: center; gap: 0.5rem;">
                        <span>✓</span> Activity Complete
                    </div>
                </div>
            `;
        }, 1500);
    };

    const performAnalysis = async () => {
        const text = textarea.value.trim();
        if (!text || text.length < 10) {
            feedbackContent.textContent = 'Please write a bit more before sending.';
            return;
        }

        isAnalyzing = true;
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<span>⏳ Analysing...</span>';
        feedbackTitle.textContent = 'AI Analysis in Progress';
        feedbackContent.innerHTML = '<div class="feedback-loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';

        let countedAttempt = false;

        try {
            submissionAttempts += 1;
            countedAttempt = true;

            const result = await analyzeTone(text, context, incomingEmail);
            currentScore = result.score;
            updateScoreRing(currentScore);

            feedbackTitle.style.color = currentScore >= 80 ? '#10b981' : (currentScore >= 60 ? '#f59e0b' : '#ef4444');
            const icon = currentScore >= 80 ? '✅ ' : (currentScore >= 60 ? '⚠️ ' : '🛑 ');

            if (currentScore >= 75) {
                feedbackTitle.textContent = 'Coach Feedback';
                feedbackContent.textContent = icon + result.feedback;
                showSuccess(result);
                return;
            }

            if (submissionAttempts >= 2) {
                feedbackTitle.textContent = submissionAttempts >= 3 ? 'Detailed Coach Help' : 'Stronger Coach Help';
                feedbackContent.textContent = 'Preparing more specific guidance...';

                try {
                    const detailedFeedback = await getEscalatedToneFeedback({
                        userText: text,
                        context,
                        incomingEmail,
                        analysis: result,
                        attemptNumber: submissionAttempts
                    });
                    feedbackContent.textContent = `${icon}${detailedFeedback}`;
                } catch (coachingError) {
                    console.warn('Detailed tone coaching unavailable:', coachingError);
                    feedbackTitle.textContent = 'Coach Feedback';
                    feedbackContent.textContent = icon + result.feedback;
                }
            } else {
                feedbackTitle.textContent = 'Coach Feedback';
                feedbackContent.textContent = icon + result.feedback;
            }
        } catch (error) {
            if (countedAttempt) submissionAttempts = Math.max(0, submissionAttempts - 1);
            console.error('Tone Analysis Failed:', error);
            feedbackTitle.textContent = 'Analysis Failed';
            feedbackContent.textContent = 'Error: ' + (error.message || 'Could not reach the coaching server.');
        } finally {
            isAnalyzing = false;
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<span>Send</span>';
        }
    };

    textarea.addEventListener('input', event => runHeuristics(event.target.value));
    analyzeBtn.addEventListener('click', performAnalysis);

    if (initialText) runHeuristics(initialText);
}
