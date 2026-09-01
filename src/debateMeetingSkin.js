const ENHANCED_ATTR = 'data-modern-meeting';

const icon = (name) => {
    const icons = {
        meet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"></rect><path d="m16 10 5-3v10l-5-3z"></path></svg>',
        chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 3z"></path></svg>',
        people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M3.5 19c.5-3.5 2.4-5.3 5.5-5.3s5 1.8 5.5 5.3"></path><path d="M14 14.8c3.5-.4 5.6 1 6.5 4.2"></path></svg>',
        calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M7 3v4M17 3v4M3 10h18"></path></svg>',
        cameraOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11a2 2 0 0 1 2 2v7H5a2 2 0 0 1-2-2z"></path><path d="m16 10 5-3v9l-5-3"></path><path d="M4 4l16 16"></path></svg>',
        mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg>',
        video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"></rect><path d="m16 10 5-3v10l-5-3z"></path></svg>',
        leave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14c2-2 10-2 12 0"></path><path d="M7 14 5 17M17 14l2 3"></path></svg>'
    };
    return icons[name] || '';
};

function addRail(workspace) {
    const rail = document.createElement('div');
    rail.className = 'meeting-modern-rail';
    rail.setAttribute('aria-hidden', 'true');
    rail.innerHTML = `
        <div class="meeting-modern-rail-item active">${icon('meet')}<span>Meet</span></div>
        <div class="meeting-modern-rail-item">${icon('chat')}<span>Chat</span></div>
        <div class="meeting-modern-rail-item">${icon('people')}<span>People</span></div>
        <div class="meeting-modern-rail-item">${icon('calendar')}<span>Calendar</span></div>
    `;
    workspace.prepend(rail);
}

function createMessage(log, role, text, stakeholderName) {
    if (!text) return;
    const empty = log.querySelector('.meeting-modern-chat-empty');
    empty?.remove();

    const row = document.createElement('div');
    row.className = `meeting-modern-message ${role}`;

    if (role === 'assistant') {
        const author = document.createElement('div');
        author.className = 'meeting-modern-message-author';
        const avatar = document.createElement('span');
        avatar.className = 'meeting-modern-message-avatar';
        avatar.textContent = stakeholderName.slice(0, 1).toUpperCase();
        const name = document.createElement('span');
        name.textContent = stakeholderName;
        author.append(avatar, name);
        row.appendChild(author);
    }

    const bubble = document.createElement('div');
    bubble.className = 'meeting-modern-message-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
}

function addPanel(workspace, inputBar, topic, stakeholderName) {
    const panel = document.createElement('aside');
    panel.className = 'meeting-modern-panel';
    panel.innerHTML = `
        <div class="meeting-modern-panel-head"><span>Meeting Details</span><span aria-hidden="true">×</span></div>
        <div class="meeting-modern-details">
            <div class="meeting-modern-detail-label">Live meeting</div>
            <div class="meeting-modern-detail-topic"></div>
        </div>
        <div class="meeting-modern-tabs">
            <button type="button" class="meeting-modern-tab active" data-meeting-tab="chat">Chat</button>
            <button type="button" class="meeting-modern-tab" data-meeting-tab="notes">Notes</button>
        </div>
        <div class="meeting-modern-chat-view">
            <div class="meeting-modern-chat-log"><div class="meeting-modern-chat-empty">Your conversation will appear here as the meeting progresses.</div></div>
        </div>
        <div class="meeting-modern-notes"><strong>Scenario</strong><span></span></div>
    `;

    panel.querySelector('.meeting-modern-detail-topic').textContent = topic;
    panel.querySelector('.meeting-modern-notes span').textContent = topic;

    inputBar.classList.add('meeting-modern-input');
    panel.querySelector('.meeting-modern-chat-view').appendChild(inputBar);

    const chatView = panel.querySelector('.meeting-modern-chat-view');
    const notesView = panel.querySelector('.meeting-modern-notes');
    panel.querySelectorAll('[data-meeting-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            const showChat = button.dataset.meetingTab === 'chat';
            panel.querySelectorAll('[data-meeting-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
            chatView.style.display = showChat ? 'flex' : 'none';
            notesView.style.display = showChat ? 'none' : 'block';
        });
    });

    workspace.appendChild(panel);
    return panel.querySelector('.meeting-modern-chat-log');
}

function enhanceDebate(debate) {
    if (!(debate instanceof HTMLElement) || debate.getAttribute(ENHANCED_ATTR) === 'true') return;

    const workspace = debate.querySelector('[id^="cinematic-"]');
    const inputBar = debate.querySelector('[id^="input-"]');
    const controls = debate.querySelector('[id^="control-bar-"]');
    const avatar = debate.querySelector('[id^="ai-avatar-ring-"]');
    const subtitle = debate.querySelector('[id^="subtitle-text-"]');
    const hint = debate.querySelector('[id^="hint-text-"]');
    const micIcon = debate.querySelector('[id^="mic-icon-"]');
    const stance = debate.querySelector('[id^="stance-phase-"]');
    const complete = debate.querySelector('[id^="complete-"]');

    if (!workspace || !inputBar || !controls || !avatar || !subtitle) return;

    debate.setAttribute(ENHANCED_ATTR, 'true');

    const topbar = debate.firstElementChild;
    let topicText = '';
    if (topbar) {
        topbar.classList.add('meeting-modern-topbar');
        const originalTopbarChildren = Array.from(topbar.children);
        originalTopbarChildren[0]?.classList.add('meeting-modern-security');
        originalTopbarChildren[1]?.classList.add('meeting-modern-topic');
        originalTopbarChildren[2]?.classList.add('meeting-modern-progress');
        topicText = originalTopbarChildren[1]?.textContent || '';

        const brand = document.createElement('div');
        brand.className = 'meeting-modern-brand';
        brand.textContent = 'VC';
        topbar.prepend(brand);
    }
    const topic = topicText.replace(/^Meeting:\s*/i, '').trim() || 'Scenario discussion';
    const speakerLabel = micIcon?.parentElement;
    const stakeholderName = (speakerLabel?.textContent || 'Colleague').replace('🎙️', '').trim() || 'Colleague';

    workspace.classList.add('meeting-modern-workspace');
    const stage = Array.from(workspace.children).find((child) => child !== inputBar);
    if (!stage) return;
    stage.classList.add('meeting-modern-stage');

    addRail(workspace);

    const oldSubtitleShell = subtitle.parentElement;
    const person = avatar.parentElement;
    if (person) {
        person.classList.add('meeting-modern-person');
        const cameraBadge = document.createElement('span');
        cameraBadge.className = 'meeting-modern-camera-badge';
        cameraBadge.innerHTML = icon('cameraOff');
        const name = document.createElement('div');
        name.className = 'meeting-modern-person-name';
        name.textContent = stakeholderName;
        const status = document.createElement('div');
        status.className = 'meeting-modern-person-status';
        status.textContent = 'Camera is off';
        person.append(cameraBadge, name, status, subtitle);
        subtitle.classList.add('meeting-modern-caption');
    }

    if (speakerLabel) speakerLabel.classList.add('meeting-modern-speaker-label');
    if (oldSubtitleShell && oldSubtitleShell !== person) oldSubtitleShell.classList.add('meeting-modern-caption-shell');
    if (hint) hint.classList.add('meeting-modern-hint');
    if (stance) stance.classList.add('meeting-modern-stance');
    if (complete) complete.classList.add('meeting-modern-complete');

    const selfTile = Array.from(stage.children).find((child) => child !== person && child !== speakerLabel && child !== hint && !child.contains(subtitle));
    if (selfTile) selfTile.classList.add('meeting-modern-self');

    controls.classList.add('meeting-modern-controls');
    stage.appendChild(controls);

    const chatLog = addPanel(workspace, inputBar, topic, stakeholderName);
    let lastAssistantText = '';

    const subtitleObserver = new MutationObserver(() => {
        const text = subtitle.textContent.trim();
        if (!text || text === '...' || text === 'Thinking…' || text === lastAssistantText) return;
        lastAssistantText = text;
        createMessage(chatLog, 'assistant', text, stakeholderName);
    });
    subtitleObserver.observe(subtitle, { childList: true, subtree: true, characterData: true });

    debate.addEventListener('click', (event) => {
        const stanceButton = event.target.closest('.stance-btn');
        if (stanceButton) {
            chatLog.innerHTML = '';
            lastAssistantText = '';
            createMessage(chatLog, 'user', `My position is: ${stanceButton.textContent.trim()}.`, stakeholderName);
            return;
        }

        if (event.target.closest('[id^="restart-btn-"]')) {
            chatLog.innerHTML = '<div class="meeting-modern-chat-empty">Your conversation will appear here as the meeting progresses.</div>';
            lastAssistantText = '';
            return;
        }

        const sendButton = event.target.closest('.debate-send');
        if (sendButton) {
            const input = inputBar.querySelector('textarea');
            const text = input?.value.trim();
            if (text) createMessage(chatLog, 'user', text, stakeholderName);
        }
    }, true);

    debate.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey || !event.target.matches('.debate-input')) return;
        const text = event.target.value.trim();
        if (text) createMessage(chatLog, 'user', text, stakeholderName);
    }, true);
}

function scan(root = document) {
    if (root instanceof HTMLElement && root.matches('.debate-container')) enhanceDebate(root);
    root.querySelectorAll?.('.debate-container').forEach(enhanceDebate);
}

function initDebateMeetingSkin() {
    scan(document);
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLElement) scan(node);
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
}

window.__fswDebateMeetingSkinCleanup?.();
window.__fswDebateMeetingSkinCleanup = initDebateMeetingSkin();
