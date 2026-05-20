/**
 * Redline Component
 * A document inspection game where users find hidden errors in text.
 */
export function renderRedline(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { title, text, mistakes = [], items, intro, outro } = config;

    // State
    const foundMistakes = new Set();
    const totalMistakes = items ? items.filter(i => i.isRisk).length : mistakes.length;
    let falsePositiveCount = 0;

    // Render Function to support both modes
    const renderContent = () => {
        if (items && Array.isArray(items)) {
            // New Bullet Point Mode with Context
            return `
                <div class="redline-document-wrapper">
                    ${intro ? `<div class="redline-context-text intro">${intro}</div>` : ''}
                    
                    <div class="redline-list">
                        ${items.map((item, index) => `
                            <div class="redline-item ${item.isRisk ? 'is-risk' : 'is-safe'}" data-id="${index}" data-feedback="${(item.feedback || '').replace(/"/g, '&quot;')}">
                                <div class="redline-bullet"></div>
                                <div class="redline-content">${item.content}</div>
                            </div>
                        `).join('')}
                    </div>

                    ${outro ? `<div class="redline-context-text outro">${outro}</div>` : ''}
                </div>
            `;
        } else {
            // Legacy Text Mode
            const sortedMistakes = [...mistakes].sort((a, b) => a.start - b.start);
            let lastIndex = 0;
            let html = '';

            sortedMistakes.forEach((mistake, index) => {
                if (mistake.start > lastIndex) {
                    html += `<span class="file-segment">${text.substring(lastIndex, mistake.start)}</span>`;
                }
                const end = Math.min(mistake.end, text.length);
                const mistakeText = text.substring(mistake.start, end);
                html += `<span class="file-segment is-error" data-id="${index}" data-feedback="${mistake.feedback.replace(/"/g, '&quot;')}">${mistakeText}</span>`;
                lastIndex = end;
            });

            if (lastIndex < text.length) {
                html += `<span class="file-segment">${text.substring(lastIndex)}</span>`;
            }
            return `<div class="redline-text" id="text-${containerId}">${html}</div>`;
        }
    };

    // Render Layout
    container.innerHTML = `
        <div class="redline-wrapper">
            <!-- Email Context View -->
            <div class="redline-email-view fade-in" id="email-view-${containerId}">
                <div class="email-header-area">
                    <div class="email-meta">
                        <div class="email-meta-label">From:</div>
                        <div class="email-meta-value">Lindsay Morris (People & Development)</div>
                    </div>
                    <div class="email-meta">
                        <div class="email-meta-label">Subject:</div>
                        <div class="email-meta-value fw-bold">Review Required: ${title || 'Internal Policy Document'}</div>
                    </div>
                    <div class="email-meta attachments-row">
                        <div class="email-meta-label">Attachments:</div>
                        <div class="email-meta-value">
                            <button class="redline-email-attachment" id="open-doc-${containerId}">
                                📄 ${title || 'Policy_Document'}.docx
                            </button>
                        </div>
                    </div>
                </div>
                <div class="email-body-area">
                    <p>Hi,</p>
                    <p>Can you please review the attached document?</p>
                    <p>I need you to cross out any mistakes or non-compliant statements before we finalise it.</p>
                    <p>Thanks,<br>Lindsay</p>
                </div>
            </div>

            <div class="redline-container fade-in" id="game-view-${containerId}" style="display: none;">
                <div class="redline-header">
                    <div class="redline-title-group">
                        <div class="redline-label">Risk & Compliance Audit</div>
                        <div class="redline-doc-title">📄 ${title || 'Internal Policy Document'}</div>
                    </div>
                    <div class="redline-counter" id="counter-${containerId}">
                        0/${totalMistakes} Mistakes Found
                    </div>
                </div>
                
                <div class="redline-content-area">
                    ${renderContent()}
                </div>

                 <div class="redline-success-overlay" id="success-${containerId}">
                    <div class="glass" style="padding: 3.5rem; border-radius: var(--radius-lg); text-align: center; max-width: 90%; width: 500px; border: 1px solid var(--glass-border);">
                        <div class="success-icon-large">🛡️</div>
                        <h2 id="success-title-${containerId}" style="color: white; margin-bottom: 0.5rem; font-size: 2.2rem; font-weight: 800; letter-spacing: -1px;">Audit Complete</h2>
                        <div id="accuracy-score-${containerId}" style="font-size: 1.5rem; color: #10b981; font-weight: bold; margin-bottom: 2rem;"></div>
                        <p id="success-desc-${containerId}" style="color: #a0a0a0; margin-bottom: 2.5rem; font-size: 1.1rem; line-height: 1.6;">You successfully identified all compliance risks.</p>
                        <button id="success-btn-${containerId}" class="btn-primary" style="padding: 1rem 3.5rem; font-weight: bold; width: 100%; box-shadow: 0 4px 15px rgba(18, 142, 205, 0.4);">Finalise Review</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Logic
    const counterEl = container.querySelector(`#counter-${containerId}`);
    const successEl = container.querySelector(`#success-${containerId}`);
    const accuracyEl = container.querySelector(`#accuracy-score-${containerId}`);
    const emailView = container.querySelector(`#email-view-${containerId}`);
    const gameView = container.querySelector(`#game-view-${containerId}`);
    const openDocBtn = container.querySelector(`#open-doc-${containerId}`);

    if (openDocBtn && emailView && gameView) {
        openDocBtn.addEventListener('click', () => {
            emailView.style.opacity = '0';
            setTimeout(() => {
                emailView.style.display = 'none';
                gameView.style.display = 'block';
                // Trigger reflow before adding opacity 1
                void gameView.offsetWidth;
                gameView.style.opacity = '1';
            }, 300);
        });
    }

    // Update Counter Helper
    const updateCounter = () => {
        counterEl.textContent = `${foundMistakes.size}/${totalMistakes} Mistakes Found`;
        counterEl.style.transform = 'scale(1.05)';
        setTimeout(() => counterEl.style.transform = 'scale(1)', 150);

        if (foundMistakes.size === totalMistakes) {
            // Calculate Accuracy
            const totalClicks = foundMistakes.size + falsePositiveCount;
            const accuracy = Math.round((foundMistakes.size / totalClicks) * 100) || 0;
            
            const titleEl = container.querySelector(`#success-title-${containerId}`);
            const descEl = container.querySelector(`#success-desc-${containerId}`);
            const btnEl = container.querySelector(`#success-btn-${containerId}`);

            if (accuracy === 100) {
                if (accuracyEl) {
                    accuracyEl.innerText = `100% Detection Accuracy`;
                    accuracyEl.style.color = '#10b981';
                }
                if (titleEl) titleEl.innerText = 'Audit Complete';
                if (descEl) descEl.innerText = 'You successfully identified all compliance risks perfectly.';
                if (btnEl) {
                    btnEl.innerText = 'Finalise Review';
                    btnEl.onclick = () => {
                        successEl.classList.remove('visible');
                        container.dispatchEvent(new CustomEvent('lesson-activity-complete', { bubbles: true, composed: true }));
                    };
                }
            } else {
                if (accuracyEl) {
                    accuracyEl.innerText = `${accuracy}% Detection Accuracy`;
                    accuracyEl.style.color = '#ef4444';
                }
                if (titleEl) titleEl.innerText = 'Audit Failed';
                if (descEl) descEl.innerText = 'You made some incorrect classifications. You must achieve 100% accuracy to pass.';
                if (btnEl) {
                    btnEl.innerText = 'Retry Audit';
                    btnEl.onclick = () => {
                        successEl.classList.remove('visible');
                        // Reset state
                        foundMistakes.clear();
                        falsePositiveCount = 0;
                        counterEl.textContent = `0/${totalMistakes} Mistakes Found`;
                        container.querySelectorAll('.redline-item').forEach(el => {
                            el.classList.remove('found', 'checked-safe');
                        });
                    };
                }
            }

            setTimeout(() => {
                successEl.classList.add('visible');
            }, 800);
        }
    };

    // Attach Listeners
    if (items && Array.isArray(items)) {
        // New Mode Listeners
        container.querySelectorAll('.redline-item').forEach(el => {
            el.addEventListener('click', () => {
                const feedback = el.dataset.feedback;

                if (el.classList.contains('found') || el.classList.contains('checked-safe')) return;

                const isRisk = el.classList.contains('is-risk');

                if (isRisk) {
                    // Correct identification of a risk
                    el.classList.add('found');
                    foundMistakes.add(el.dataset.id);
                    updateCounter();

                    if (feedback) {
                        const toast = document.createElement('div');
                        toast.className = 'swipe-feedback-toast success';
                        toast.innerText = `✅ Correct: ${feedback}`;
                        toast.style.backgroundColor = '#10b981';
                        toast.style.color = 'white';
                        container.appendChild(toast);
                        setTimeout(() => toast.remove(), 6000);
                    }

                } else {
                    // False Positive (User clicked a safe item)
                    el.classList.add('checked-safe');
                    falsePositiveCount++;

                    // Shake animation for feedback
                    el.style.animation = 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both';
                    setTimeout(() => el.style.animation = '', 400);

                    if (feedback) {
                        const toast = document.createElement('div');
                        toast.className = 'swipe-feedback-toast error';
                        toast.innerText = `❌ Incorrect: ${feedback}`;
                        container.appendChild(toast);
                        setTimeout(() => toast.remove(), 6000);
                    }
                }
            });
        });
    } else {
        // Legacy Mode Listeners (Deprecate soon)
        container.querySelectorAll('.is-error').forEach(el => {
            el.addEventListener('click', () => {
                if (el.classList.contains('found')) return;

                el.classList.add('found');
                foundMistakes.add(el.dataset.id);
                updateCounter();
            });
        });
    }
}
