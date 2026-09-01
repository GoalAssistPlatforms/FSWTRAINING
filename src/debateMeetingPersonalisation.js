const ENHANCED_ATTR = 'data-meeting-personalised';
const PERSONA_ENDPOINT = '/api/debate-persona';
const FALLBACK_PERSONA = { name: 'Josh', avatarUrl: null };

let personaPromise = null;

const cameraIcon = (off = false) => off
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11a2 2 0 0 1 2 2v7H5a2 2 0 0 1-2-2z"></path><path d="m16 10 5-3v9l-5-3"></path><path d="M4 4l16 16"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"></rect><path d="m16 10 5-3v10l-5-3z"></path></svg>';

function loadPersona() {
    if (!personaPromise) {
        personaPromise = fetch(PERSONA_ENDPOINT, {
            headers: { Accept: 'application/json' }
        })
            .then((response) => response.ok ? response.json() : FALLBACK_PERSONA)
            .then((persona) => ({
                name: persona?.name || FALLBACK_PERSONA.name,
                avatarUrl: persona?.avatarUrl || null
            }))
            .catch(() => FALLBACK_PERSONA);
    }
    return personaPromise;
}

function prepareSelfTile(selfTile) {
    selfTile.style.overflow = 'hidden';

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-label', 'Your camera preview');
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:none;z-index:1;background:#07090c;';

    const fallback = document.createElement('div');
    fallback.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;color:#8e949f;font-size:11px;z-index:1;background:#07090c;';
    fallback.innerHTML = `<span style="display:grid;place-items:center;width:22px;height:22px">${cameraIcon(true)}</span><span>Camera off</span>`;
    const fallbackSvg = fallback.querySelector('svg');
    if (fallbackSvg) fallbackSvg.style.cssText = 'width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;';

    const existingLabel = selfTile.firstElementChild;
    if (existingLabel) {
        existingLabel.style.position = 'absolute';
        existingLabel.style.left = '6px';
        existingLabel.style.bottom = '6px';
        existingLabel.style.zIndex = '3';
        existingLabel.style.background = 'rgba(0,0,0,.62)';
        existingLabel.style.padding = '2px 6px';
        existingLabel.style.borderRadius = '5px';
        existingLabel.style.fontSize = '10px';
        existingLabel.innerHTML = `<span style="display:inline-flex;width:12px;height:12px;margin-right:4px;vertical-align:-2px">${cameraIcon(false)}</span>You`;
        const labelSvg = existingLabel.querySelector('svg');
        if (labelSvg) labelSvg.style.cssText = 'width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;';
    }

    selfTile.prepend(fallback);
    selfTile.prepend(video);

    return { video, fallback };
}

function setCameraFallback(state, text = 'Camera off') {
    state.video.style.display = 'none';
    state.fallback.style.display = 'flex';
    const textNode = state.fallback.querySelector('span:last-child');
    if (textNode && textNode.textContent !== text) textNode.textContent = text;
}

function updateVideoControl(state) {
    if (!state.videoToggle) return;
    const spans = state.videoToggle.querySelectorAll('span');
    const label = spans[1];
    const nextLabel = state.stream ? 'Stop Video' : 'Start Video';
    if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
}

async function startCamera(state) {
    if (state.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
        setCameraFallback(state, 'Camera unavailable');
        updateVideoControl(state);
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 360 }
            }
        });

        state.stream = stream;
        state.video.srcObject = stream;
        state.fallback.style.display = 'none';
        state.video.style.display = 'block';
        await state.video.play().catch(() => {});
        updateVideoControl(state);
    } catch (error) {
        console.warn('Local meeting camera could not be started.', error);
        setCameraFallback(state, 'Camera permission needed');
        updateVideoControl(state);
    }
}

function stopCamera(state, fallbackText = 'Camera off') {
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    state.video.srcObject = null;
    setCameraFallback(state, fallbackText);
    updateVideoControl(state);
}

function updateAuthor(author, displayName) {
    if (!(author instanceof HTMLElement)) return;
    const name = author.querySelector('span:last-child');
    const badge = author.querySelector('.meeting-modern-message-avatar');
    const initial = displayName.slice(0, 1).toUpperCase();

    if (name && name.textContent !== displayName) name.textContent = displayName;
    if (badge && badge.textContent !== initial) badge.textContent = initial;
}

function updateAuthors(root, displayName) {
    if (!(root instanceof HTMLElement)) return;
    if (root.matches('.meeting-modern-message-author')) updateAuthor(root, displayName);
    root.querySelectorAll('.meeting-modern-message-author').forEach((author) => updateAuthor(author, displayName));
}

function applyPersonaVisuals(debate, persona) {
    const displayName = persona?.name || 'Josh';
    const personName = debate.querySelector('.meeting-modern-person-name');
    const avatar = debate.querySelector('[id^="ai-avatar-ring-"]');
    const chatLog = debate.querySelector('.meeting-modern-chat-log');

    if (personName && personName.textContent !== displayName) personName.textContent = displayName;
    if (chatLog) updateAuthors(chatLog, displayName);
    if (!avatar) return;

    avatar.style.backgroundImage = 'none';
    avatar.style.backgroundColor = '#252a35';
    avatar.style.backgroundPosition = 'center';
    avatar.style.backgroundSize = 'cover';
    avatar.style.display = 'grid';
    avatar.style.placeItems = 'center';
    avatar.style.color = '#eef1f5';
    avatar.style.fontSize = '2rem';
    avatar.style.fontWeight = '700';
    avatar.textContent = displayName.slice(0, 1).toUpperCase();

    if (!persona?.avatarUrl) return;

    const image = new Image();
    image.onload = () => {
        avatar.textContent = '';
        avatar.style.backgroundImage = `url("${persona.avatarUrl}")`;
    };
    image.onerror = () => {
        avatar.textContent = displayName.slice(0, 1).toUpperCase();
    };
    image.src = persona.avatarUrl;
}

function enhanceDebate(debate) {
    if (!(debate instanceof HTMLElement) || debate.getAttribute(ENHANCED_ATTR) === 'true') return;

    const personName = debate.querySelector('.meeting-modern-person-name');
    const selfTile = debate.querySelector('.meeting-modern-self');
    const controls = debate.querySelector('.meeting-modern-controls');
    if (!personName || !selfTile || !controls) return;

    debate.setAttribute(ENHANCED_ATTR, 'true');

    const preview = prepareSelfTile(selfTile);
    const videoToggle = Array.from(controls.querySelectorAll('.zoom-btn'))
        .find((button) => /Stop Video|Start Video/i.test(button.textContent || '')) || null;

    const state = {
        ...preview,
        videoToggle,
        stream: null,
        personaName: FALLBACK_PERSONA.name
    };

    applyPersonaVisuals(debate, FALLBACK_PERSONA);
    loadPersona().then((persona) => {
        state.personaName = persona.name || FALLBACK_PERSONA.name;
        applyPersonaVisuals(debate, persona);
    });

    const chatLog = debate.querySelector('.meeting-modern-chat-log');
    const chatObserver = chatLog ? new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLElement) updateAuthors(node, state.personaName);
            }
        }
    }) : null;
    chatObserver?.observe(chatLog, { childList: true, subtree: true });

    debate.addEventListener('click', (event) => {
        if (event.target.closest('.join-call-btn') || event.target.closest('.stance-btn')) {
            void startCamera(state);
            return;
        }

        if (videoToggle && event.target.closest('.zoom-btn') === videoToggle) {
            if (state.stream) stopCamera(state);
            else void startCamera(state);
            return;
        }

        if (event.target.closest('[id^="leave-call-"]') || event.target.closest('[id^="restart-btn-"]')) {
            stopCamera(state);
        }
    }, true);

    const removalObserver = new MutationObserver(() => {
        if (debate.isConnected) return;
        stopCamera(state);
        chatObserver?.disconnect();
        removalObserver.disconnect();
    });
    removalObserver.observe(document.body, { childList: true, subtree: true });
}

function scan(root = document) {
    if (root instanceof HTMLElement) {
        const debate = root.matches('.debate-container') ? root : root.closest('.debate-container');
        if (debate) enhanceDebate(debate);
    }
    root.querySelectorAll?.('.debate-container').forEach(enhanceDebate);
}

function initDebateMeetingPersonalisation() {
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

window.__fswDebateMeetingPersonalisationCleanup?.();
window.__fswDebateMeetingPersonalisationCleanup = initDebateMeetingPersonalisation();
