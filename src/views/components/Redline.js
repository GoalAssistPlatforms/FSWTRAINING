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
        <div class="redline-container fade-in">

            
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
                    <h2 style="color: white; margin-bottom: 0.5rem; font-size: 2.2rem; font-weight: 800; letter-spacing: -1px;">Audit Complete</h2>
                    <div id="accuracy-score-${containerId}" style="font-size: 1.5rem; color: #10b981; font-weight: bold; margin-bottom: 2rem;"></div>
                    <p style="color: #a0a0a0; margin-bottom: 2.5rem; font-size: 1.1rem; line-height: 1.6;">You successfully identified all compliance risks.</p>
                    <button class="btn-primary" style="padding: 1rem 3.5rem; font-weight: bold; width: 100%; box-shadow: 0 4px 15px rgba(18, 142, 205, 0.4);" onclick="this.closest('.redline-success-overlay').classList.remove('visible')">Finalize Review</button>
                </div>
            </div>
        </div>
    `;

    // Logic
    const counterEl = container.querySelector(`#counter-${containerId}`);
    const successEl = container.querySelector(`#success-${containerId}`);
    const accuracyEl = container.querySelector(`#accuracy-score-${containerId}`);

    // Update Counter Helper
    const updateCounter = () => {
        counterEl.textContent = `${foundMistakes.size}/${totalMistakes} Mistakes Found`;
        counterEl.style.transform = 'scale(1.05)';
        setTimeout(() => counterEl.style.transform = 'scale(1)', 150);

        if (foundMistakes.size === totalMistakes) {
            // Calculate Accuracy
            const totalClicks = foundMistakes.size + falsePositiveCount;
            const accuracy = Math.round((foundMistakes.size / totalClicks) * 100) || 0;

            if (accuracyEl) {
                accuracyEl.innerText = `${accuracy}% Detection Accuracy`;
                // Color grading
                if (accuracy < 50) accuracyEl.style.color = '#ef4444';
                else if (accuracy < 80) accuracyEl.style.color = '#f59e0b';
                else accuracyEl.style.color = '#10b981';
            }

            setTimeout(() => {
                successEl.classList.add('visible');
                container.dispatchEvent(new CustomEvent('lesson-activity-complete', {
                    bubbles: true,
                    composed: true
                }));
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
                        toast.className = 'swipe-feedback-toast error';
                        toast.innerText = `⚠️ ${feedback}`;
                        container.appendChild(toast);
                        setTimeout(() => toast.remove(), 3000);
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
                        toast.className = 'swipe-feedback-toast success';
                        toast.innerText = `✅ Verified Safe: ${feedback}`;
                        toast.style.backgroundColor = '#10b981';
                        toast.style.color = 'white';
                        container.appendChild(toast);
                        setTimeout(() => toast.remove(), 4000);
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
