/**
 * Decision Swipe Component
 * A "Tinder-style" binary choice game for rapid reinforcement.
 */

export function renderDecisionSwipe(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Config defaults
    const cards = config.cards || [];
    const labels = config.labels || { left: "Reject", right: "Accept" };
    let currentIndex = 0;
    let score = 0;

    // Render Container
    container.innerHTML = `
        <div class="swipe-game-container fade-in">
            <h3 style="color: rgba(255, 255, 255, 0.9); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 1.5rem; text-align: center;">
                ${config.title || 'Rapid Decisions'}
            </h3>
            <div class="card-stack" id="stack-${containerId}"></div>
            <div class="swipe-labels" style="display: flex; width: 300px; justify-content: space-between; margin-top: 1rem; margin-bottom: 0.5rem; font-size: 0.8rem; color: rgba(255, 255, 255, 0.7); pointer-events: none; z-index: 20; position: relative;">
                <span>${labels.left}</span>
                <span>${labels.right}</span>
            </div>
            <div class="swipe-controls" id="controls-${containerId}">
                <button class="swipe-btn btn-left" id="btn-left-${containerId}">✕</button>
                <button class="swipe-btn btn-right" id="btn-right-${containerId}">✓</button>
            </div>
        </div>
    `;

    const stackEl = container.querySelector(`#stack-${containerId}`);
    const controlsEl = container.querySelector(`#controls-${containerId}`);

    // Render Cards
    const renderCards = () => {
        stackEl.innerHTML = '';

        // Only render current and next 2 for performance (limit visual stack to 3)
        const queue = cards.slice(currentIndex, currentIndex + 3).reverse();

        if (queue.length === 0) {
            controlsEl.style.display = 'none';

            const isPerfect = score === cards.length;

            if (isPerfect) {
                stackEl.innerHTML = `
                    <div class="game-over-panel" style="animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                        <div style="font-size: 4rem; margin-bottom: 0.5rem;">🎉</div>
                        <h2 style="font-size: 2rem; margin-bottom: 0.5rem; color: #10b981;">Perfect Score!</h2>
                        <p style="font-size: 1.1rem; color: rgba(255,255,255,0.8);">You've mastered this activity.</p>
                    </div>
                `;
                // Dispatch completion event
                container.dispatchEvent(new CustomEvent('lesson-activity-complete', {
                    bubbles: true,
                    composed: true,
                    detail: { score: score, max: cards.length }
                }));
            } else {
                stackEl.innerHTML = `
                    <div class="game-over-panel">
                        <h2 style="font-size: 3rem; margin-bottom: 0; color: #ef4444;">${score}/${cards.length}</h2>
                        <p style="margin-bottom: 1.5rem;">Correct Decisions</p>
                        <p style="font-size: 0.9rem; color: rgba(255,255,255,0.6); margin-bottom: 1.5rem; max-width: 80%;">
                            You need a perfect score to proceed. Review the feedback and try again!
                        </p>
                        <button id="reset-${containerId}" class="btn-primary" style="padding: 0.75rem 2rem; color: white; border: none; border-radius: 50px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">Try Again</button>
                    </div>
                `;
                const resetBtn = container.querySelector(`#reset-${containerId}`);
                if (resetBtn) resetBtn.addEventListener('click', () => {
                    currentIndex = 0;
                    score = 0;
                    controlsEl.style.display = 'flex';
                    renderCards();
                });
            }
            return;
        }

        queue.forEach((card, queueIdx) => { // queueIdx 0 is Last card (bottom), length-1 is top
            const isTop = queueIdx === queue.length - 1;
            const cardEl = document.createElement('div');
            cardEl.className = 'swipe-card';
            cardEl.style.zIndex = queueIdx;

            // Random slight rotation for stack effect
            if (!isTop) {
                const rot = (Math.random() * 4) - 2;
                cardEl.style.transform = `scale(${1 - (queue.length - queueIdx - 1) * 0.05}) rotate(${rot}deg) translateY(${(queue.length - queueIdx - 1) * 10}px)`;
                cardEl.style.opacity = '0.5';
            }

            cardEl.innerHTML = `
                <h4>${card.text}</h4>
                <div class="feedback-overlay feedback-left">${labels.left}</div>
                <div class="feedback-overlay feedback-right">${labels.right}</div>
            `;

            stackEl.appendChild(cardEl);
        });
    };

    const handleSwipe = (direction) => {
        const cardEl = stackEl.lastElementChild; // The visual top is the last DOM element
        if (!cardEl) return;

        const currentCard = cards[currentIndex];

        // Check Correctness
        // AI Registry says "isCorrect", but ai.js prompt says "isRight". 
        // Component was checking currentCard.isCorrect === choice.
        // Let's stick with "isCorrect" as the standard but make it robust.
        const cardTarget = currentCard.isCorrect !== undefined ? currentCard.isCorrect : currentCard.isRight;
        const choice = direction === 'right';
        const isCorrect = cardTarget === choice;

        if (isCorrect) score++;

        // Animate
        const xMove = direction === 'right' ? 400 : -400;
        const rotate = direction === 'right' ? 30 : -30;

        cardEl.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease';
        cardEl.style.transform = `translate(${xMove}px, -20px) rotate(${rotate}deg)`;
        cardEl.style.opacity = '0';

        // Show feedback overlay color
        cardEl.classList.add(isCorrect ? 'swipe-correct' : 'swipe-incorrect');

        // Show feedback text if provided
        if (currentCard.feedback) {
            const feedbackMsg = document.createElement('div');
            feedbackMsg.className = `swipe-feedback-toast ${isCorrect ? 'success' : 'error'}`;
            feedbackMsg.textContent = currentCard.feedback;
            container.appendChild(feedbackMsg);
            setTimeout(() => feedbackMsg.remove(), 2000);
        }

        setTimeout(() => {
            currentIndex++;
            renderCards();
        }, 300);
    };

    // Listeners
    container.querySelector(`#btn-left-${containerId}`).addEventListener('click', () => handleSwipe('left'));
    container.querySelector(`#btn-right-${containerId}`).addEventListener('click', () => handleSwipe('right'));

    renderCards();
}
