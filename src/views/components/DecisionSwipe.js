export function renderDecisionSwipe(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const cards = config.cards || config.items || config.questions || config.scenarios || [];
    const labels = config.labels || { left: "Reject", right: "Accept" };
    let currentIndex = 0;
    let score = 0;

    // Sticky note colors
    const colors = ['#fef08a', '#fbcfe8', '#bfdbfe', '#bbf7d0']; // Yellow, Pink, Blue, Green

    container.innerHTML = `
        <style>
            @keyframes crumple-toss {
                0% { 
                    transform: scale(1) rotate(0deg); 
                    box-shadow: 3px 5px 15px rgba(0,0,0,0.3);
                }
                15% {
                    transform: scaleX(0.8) scaleY(0.9) rotate(-5deg);
                    box-shadow: inset 10px 10px 30px rgba(0,0,0,0.3), 0 10px 20px rgba(0,0,0,0.4);
                    border-radius: 10px 30px 10px 20px;
                }
                30% { 
                    transform: scaleX(0.6) scaleY(0.6) rotate(15deg); 
                    box-shadow: inset 20px 20px 50px rgba(0,0,0,0.6), inset -20px -20px 40px rgba(0,0,0,0.4), 0 10px 20px rgba(0,0,0,0.5);
                    border-radius: 40% 30% 50% 40%;
                    color: transparent; 
                }
                50% { 
                    transform: scale(0.3) rotate(45deg); 
                    box-shadow: inset 30px 30px 60px rgba(0,0,0,0.8), inset -30px -30px 60px rgba(0,0,0,0.8), 0 5px 10px rgba(0,0,0,0.6);
                    border-radius: 50%;
                    color: transparent;
                }
                100% { 
                    transform: translate(-300px, 200px) scale(0) rotate(120deg); 
                    opacity: 0; 
                }
            }
            @keyframes pin-right {
                0% { transform: scale(1) rotate(0deg); }
                100% { transform: translate(250px, -150px) scale(0.5) rotate(15deg); opacity: 0; }
            }
            @keyframes taped-memo {
                0% { opacity: 0; transform: translate(-50%, -100%) scale(0.9); }
                10% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                90% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, 0) scale(0.9); }
            }
            
            .sticky-card {
                position: absolute;
                width: 280px;
                height: 280px;
                padding: 1.5rem;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                box-sizing: border-box;
                color: #1e293b;
                font-family: 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', 'Segoe UI', sans-serif;
                font-weight: 600;
                font-size: 1.1rem;
                line-height: 1.4;
                box-shadow: 3px 5px 15px rgba(0,0,0,0.3);
                border-radius: 2px 2px 20px 2px;
                transform-origin: center center;
                background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 30%);
            }
            
            .office-board {
                background-color: #b5805f;
                background-image: url('https://www.transparenttextures.com/patterns/cork-board.png');
                border: 12px solid #5c4033;
                border-radius: 8px;
                box-shadow: inset 0 0 40px rgba(0,0,0,0.6);
            }

            .taped-toast {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #f8fafc;
                color: #0f172a;
                padding: 1.5rem 2rem;
                max-width: 80%;
                text-align: center;
                font-weight: 600;
                font-size: 1.1rem;
                box-shadow: 0 10px 25px rgba(0,0,0,0.4);
                border: 1px solid #cbd5e1;
                z-index: 100;
                animation: taped-memo 2.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            }
            .taped-toast::before {
                content: '';
                position: absolute;
                top: -10px;
                left: 50%;
                transform: translateX(-50%) rotate(-2deg);
                width: 80px;
                height: 25px;
                background: rgba(255,255,255,0.5);
                border: 1px solid rgba(0,0,0,0.1);
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                backdrop-filter: blur(2px);
            }
            
            .action-zone {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                background: rgba(0,0,0,0.5);
                padding: 15px;
                border-radius: 12px;
                cursor: pointer;
                transition: transform 0.1s, background 0.2s;
                border: 2px dashed rgba(255,255,255,0.2);
                color: white;
            }
            .action-zone:hover {
                transform: scale(1.05);
                background: rgba(0,0,0,0.7);
            }
            .zone-reject:hover { border-color: #ef4444; color: #ef4444; }
            .zone-accept:hover { border-color: #22c55e; color: #22c55e; }
        </style>
        
        <div class="swipe-game-container office-board fade-in" style="display: flex; flex-direction: column; height: 650px; position: relative; overflow: hidden;">
            <div style="background: rgba(0,0,0,0.7); padding: 10px; text-align: center; border-bottom: 2px solid #5c4033;">
                <h3 style="color: #f8fafc; font-size: 1rem; text-transform: uppercase; letter-spacing: 3px; margin: 0;">
                    THE CORKBOARD
                </h3>
            </div>
            
            <div id="pinned-notes-${containerId}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; z-index: 1;"></div>
            
            <div class="card-stack" id="stack-${containerId}" style="flex: 1; position: relative; display: flex; align-items: center; justify-content: center; z-index: 10;"></div>

            <div id="fx-layer-${containerId}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; z-index: 100;"></div>
            
            <div class="swipe-controls" id="controls-${containerId}" style="display: flex; justify-content: space-between; padding: 2rem; z-index: 20;">
                <div class="action-zone zone-reject" id="btn-left-${containerId}">
                    <span style="font-size: 2.5rem;">🗑️</span>
                    <span style="font-weight: bold; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1px;">Bin It</span>
                </div>
                <div class="action-zone zone-accept" id="btn-right-${containerId}">
                    <span style="font-size: 2.5rem;">📌</span>
                    <span style="font-weight: bold; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1px;">Approved</span>
                </div>
            </div>
        </div>
    `;

    const stackEl = container.querySelector(`#stack-${containerId}`);
    const controlsEl = container.querySelector(`#controls-${containerId}`);

    const renderCards = () => {
        stackEl.innerHTML = '';

        const queue = cards.slice(currentIndex, currentIndex + 5).reverse();

        if (queue.length === 0) {
            controlsEl.style.display = 'none';
            const isPerfect = score === cards.length;

            if (isPerfect) {
                stackEl.innerHTML = `
                    <div style="background: rgba(255,255,255,0.95); padding: 3rem; border-radius: 8px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); transform: rotate(-2deg); position: relative; max-width: 80%;">
                        <div style="position: absolute; top: -15px; left: 50%; transform: translateX(-50%); font-size: 2.5rem;">📌</div>
                        <div style="font-size: 4rem; margin-bottom: 0.5rem;">✅</div>
                        <h2 style="font-size: 2rem; margin-bottom: 0.5rem; color: #10b981;">Inbox Cleared!</h2>
                        <p style="font-size: 1.1rem; color: #334155;">Perfect score. Great job sorting these out.</p>
                    </div>
                `;
                container.dispatchEvent(new CustomEvent('lesson-activity-complete', {
                    bubbles: true,
                    composed: true,
                    detail: { score: score, max: cards.length }
                }));
            } else {
                stackEl.innerHTML = `
                    <div style="background: rgba(255,255,255,0.95); padding: 3rem; border-radius: 8px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); transform: rotate(1deg); position: relative; max-width: 80%;">
                        <div style="position: absolute; top: -15px; left: 50%; transform: translateX(-50%); font-size: 2.5rem;">📌</div>
                        <h2 style="font-size: 3rem; margin: 0; color: #ef4444;">${score}/${cards.length}</h2>
                        <p style="margin-bottom: 1rem; color: #64748b; font-weight: 600;">Correct Sorts</p>
                        <p style="font-size: 0.95rem; color: #334155; margin-bottom: 1.5rem;">
                            Some of those didn't belong there. Review the notes and try again to clear your inbox properly.
                        </p>
                        <button id="reset-${containerId}" style="background: #ef4444; padding: 0.75rem 2rem; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; text-transform: uppercase;">Sort Again</button>
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

        queue.forEach((card, queueIdx) => {
            const isTop = queueIdx === queue.length - 1;
            const cardEl = document.createElement('div');
            cardEl.className = 'sticky-card';
            cardEl.style.zIndex = queueIdx;
            
            // Assign a consistent random color based on the card text length to keep it visually stable
            const color = colors[card.text.length % colors.length];
            cardEl.style.backgroundColor = color;

            if (!isTop) {
                const rot = (Math.random() * 8) - 4;
                cardEl.style.transform = `scale(${1 - (queue.length - queueIdx - 1) * 0.05}) rotate(${rot}deg) translateY(${(queue.length - queueIdx - 1) * 15}px)`;
                cardEl.style.boxShadow = '1px 2px 5px rgba(0,0,0,0.2)';
            } else {
                const rot = (Math.random() * 4) - 2;
                cardEl.style.transform = `rotate(${rot}deg)`;
            }

            cardEl.innerHTML = `
                <div style="position: absolute; top: 10px; width: 100%; text-align: center; opacity: 0.3;">
                    <hr style="border: none; border-top: 1px solid #000; width: 80%; margin: 0 auto 5px auto;">
                </div>
                <h4 style="margin: 0; position: relative; z-index: 2;">${card.text}</h4>
            `;

            stackEl.appendChild(cardEl);
        });
    };

    const handleSwipe = (direction) => {
        const cardEl = stackEl.lastElementChild; 
        if (!cardEl) return;

        const currentCard = cards[currentIndex];
        const cardTarget = currentCard.isCorrect !== undefined ? currentCard.isCorrect : currentCard.isRight;
        const choice = direction === 'right';
        const isCorrect = cardTarget === choice;

        if (isCorrect) score++;

        // Clone for animation so original can be removed instantly
        const clone = cardEl.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.margin = '0 auto';

        if (direction === 'left') {
            const fxLayer = container.querySelector(`#fx-layer-${containerId}`);
            
            // Adjust clone position to center since fxLayer is full size
            clone.style.left = '50%';
            clone.style.top = '50%';
            clone.style.transform = `translate(-50%, -50%) ${cardEl.style.transform}`;
            
            fxLayer.appendChild(clone);
            clone.style.animation = 'crumple-toss 1.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
            setTimeout(() => clone.remove(), 1200);
        } else {
            const pinnedContainer = container.querySelector(`#pinned-notes-${containerId}`);
            pinnedContainer.appendChild(clone);
            
            // Distribute alternating left and right columns
            const isLeft = score % 2 === 1; // First is left, second is right, etc.
            const baseX = isLeft ? 15 : 85; 
            // Stagger downwards based on how many are on that side
            const countOnSide = Math.floor((score - 1) / 2);
            const baseY = 20 + ((countOnSide * 20) % 60);

            // Add slight randomness so they don't look perfectly aligned
            const randX = baseX + (Math.random() * 8 - 4); 
            const randY = baseY + (Math.random() * 10 - 5); 
            const randRot = (Math.random() * 30) - 15; 
            
            clone.style.left = '50%';
            clone.style.top = '50%';
            clone.style.transform = `translate(-50%, -50%) ${cardEl.style.transform}`;
            clone.style.transition = 'all 0.5s ease-out';
            
            const pinGraphic = document.createElement('div');
            pinGraphic.innerHTML = '📌';
            pinGraphic.style.position = 'absolute';
            pinGraphic.style.top = '-15px';
            pinGraphic.style.left = '50%';
            pinGraphic.style.transform = 'translateX(-50%)';
            pinGraphic.style.fontSize = '2.5rem';
            pinGraphic.style.opacity = '0';
            pinGraphic.style.transition = 'opacity 0.2s 0.5s'; 
            clone.appendChild(pinGraphic);

            // Trigger reflow
            void clone.offsetWidth;

            clone.style.left = `${randX}%`;
            clone.style.top = `${randY}%`;
            clone.style.transform = `translate(-50%, -50%) scale(0.6) rotate(${randRot}deg)`;
            pinGraphic.style.opacity = '1';
        }

        cardEl.style.display = 'none';

        if (currentCard.feedback) {
            const feedbackMsg = document.createElement('div');
            feedbackMsg.className = 'taped-toast';
            
            const cleanFeedback = currentCard.feedback.replace(/^(correct|incorrect|right|wrong|true|false)[\s.:-]*/i, '');
            const emoji = isCorrect ? '✅' : '❌';
            
            feedbackMsg.innerHTML = `
                <div style="font-size: 1.5rem; margin-bottom: 5px;">${emoji}</div>
                <div style="color: #334155;">${cleanFeedback.charAt(0).toUpperCase() + cleanFeedback.slice(1)}</div>
            `;
            container.appendChild(feedbackMsg);
            setTimeout(() => feedbackMsg.remove(), 2500);
        }

        currentIndex++;
        renderCards();
    };

    container.querySelector(`#btn-left-${containerId}`).addEventListener('click', () => handleSwipe('left'));
    container.querySelector(`#btn-right-${containerId}`).addEventListener('click', () => handleSwipe('right'));

    renderCards();
}
