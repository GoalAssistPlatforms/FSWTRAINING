const LEARNING_PACK_GREEN = '#10b981';
const STYLE_ID = 'packaged-ui-enhancement-styles';
const CHAT_CONTROLS_ID = 'guides-chat-controls';
const NEW_CHAT_BUTTON_ID = 'new-guides-chat-btn';

const ensureStyles = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        #create-pack-card > div:first-child {
            background: ${LEARNING_PACK_GREEN} !important;
            box-shadow: 0 0 20px rgba(16, 185, 129, 0.4) !important;
        }

        #${CHAT_CONTROLS_ID} {
            width: 100%;
            max-width: 800px;
            display: flex;
            justify-content: flex-end;
            align-items: center;
            box-sizing: border-box;
            margin-bottom: 0.25rem;
        }

        #${NEW_CHAT_BUTTON_ID} {
            display: inline-flex;
            align-items: center;
            gap: 0.45rem;
            padding: 0.55rem 0.85rem;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 999px;
            background: rgba(30, 31, 32, 0.65);
            color: #e5e7eb;
            font: inherit;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s, border-color 0.2s, color 0.2s, opacity 0.2s;
        }

        #${NEW_CHAT_BUTTON_ID}:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.24);
            color: white;
        }

        #${NEW_CHAT_BUTTON_ID}:focus-visible {
            outline: 2px solid var(--primary);
            outline-offset: 2px;
        }

        #${NEW_CHAT_BUTTON_ID}:disabled {
            cursor: not-allowed;
            opacity: 0.45;
        }
    `;

    document.head.appendChild(style);
};

export const resetGuidesChat = () => {
    const chatHistory = document.getElementById('chat-history');
    const greeting = document.getElementById('chat-greeting');
    const suggestions = document.getElementById('chat-suggestions');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-chat-btn');

    if (!chatHistory || !greeting) return false;

    if (document.getElementById('chat-loading')) return false;

    Array.from(chatHistory.children).forEach(child => {
        if (child !== greeting) child.remove();
    });

    greeting.style.display = 'flex';
    if (suggestions) suggestions.style.display = 'flex';

    if (chatInput) {
        chatInput.value = '';
        chatInput.disabled = false;
    }

    if (sendButton) sendButton.disabled = false;

    chatHistory.scrollTop = 0;

    requestAnimationFrame(() => chatInput?.focus());
    return true;
};

const updateNewChatAvailability = () => {
    const button = document.getElementById(NEW_CHAT_BUTTON_ID);
    if (!button) return;

    const isAnswering = Boolean(document.getElementById('chat-loading'));
    button.disabled = isAnswering;
    button.title = isAnswering
        ? 'Wait for the current answer to finish'
        : 'Clear this conversation and start again';
};

const ensureNewChatButton = () => {
    const chatView = document.getElementById('guides-chat-view');
    const chatHistory = document.getElementById('chat-history');
    if (!chatView || !chatHistory) return;

    let controls = document.getElementById(CHAT_CONTROLS_ID);
    if (!controls) {
        controls = document.createElement('div');
        controls.id = CHAT_CONTROLS_ID;

        const button = document.createElement('button');
        button.id = NEW_CHAT_BUTTON_ID;
        button.type = 'button';
        button.setAttribute('aria-label', 'Start a new chat');
        button.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 5v14"></path>
                <path d="M5 12h14"></path>
            </svg>
            <span>New chat</span>
        `;
        button.addEventListener('click', resetGuidesChat);

        controls.appendChild(button);
        chatView.insertBefore(controls, chatHistory);
    }

    updateNewChatAvailability();
};

const syncEnhancements = () => {
    ensureStyles();
    ensureNewChatButton();
};

const initialiseEnhancements = () => {
    syncEnhancements();

    let queued = false;
    const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            syncEnhancements();
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseEnhancements, { once: true });
} else {
    initialiseEnhancements();
}
