const STYLE_ID = 'guide-capture-options-enhancement-styles';

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .guide-capture-intro {
      margin-bottom: 1rem;
      text-align: left;
    }

    .guide-capture-intro h3 {
      margin: 0 0 0.35rem;
      color: var(--text-main);
      font-size: 1.05rem;
    }

    .guide-capture-intro p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.8rem;
      line-height: 1.45;
    }

    .guide-capture-choice-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.8rem;
      width: 100%;
    }

    .guide-capture-choice {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 1rem;
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md);
      background: rgba(255,255,255,0.025);
      text-align: left;
      box-sizing: border-box;
    }

    .guide-capture-choice:hover {
      border-color: rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.045);
    }

    .guide-capture-choice-icon {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: rgba(var(--primary-rgb), 0.14);
      font-size: 1.25rem;
    }

    .guide-capture-choice h4 {
      margin: 0;
      color: white;
      font-size: 0.9rem;
    }

    .guide-capture-choice p {
      flex: 1;
      margin: 0;
      color: var(--text-muted);
      font-size: 0.75rem;
      line-height: 1.45;
    }

    .guide-capture-choice-action {
      width: 100%;
      margin-top: auto;
      justify-content: center;
      box-sizing: border-box;
    }

    .guide-capture-choice #sys-start-rec-btn,
    .guide-capture-choice label[for="sys-upload-video-input"],
    .guide-capture-choice #sys-start-camera-btn {
      width: 100%;
      min-height: 42px;
      justify-content: center;
      box-sizing: border-box;
    }

    .guide-capture-choice #sys-start-rec-btn {
      background: rgba(239, 68, 68, 0.92) !important;
      border-color: rgba(239, 68, 68, 0.92) !important;
    }

    .guide-capture-choice #sys-start-camera-btn {
      border: 1px solid rgba(16,185,129,0.45);
      background: rgba(16,185,129,0.12);
      color: white;
    }

    .guide-capture-choice-note {
      width: 100%;
      color: var(--text-muted);
      font-size: 0.68rem;
      text-align: center;
    }

    @media (max-width: 900px) {
      .guide-capture-choice-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
};

const buildChoice = ({ icon, title, description }) => {
  const card = document.createElement('div');
  card.className = 'guide-capture-choice';

  const iconEl = document.createElement('div');
  iconEl.className = 'guide-capture-choice-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon;

  const titleEl = document.createElement('h4');
  titleEl.textContent = title;

  const descriptionEl = document.createElement('p');
  descriptionEl.textContent = description;

  card.append(iconEl, titleEl, descriptionEl);
  return card;
};

export const enhanceGuideCaptureOptions = root => {
  const builder = root?.querySelector?.('#sys-builder-root');
  const setup = builder?.querySelector?.('#rec-setup-ui');
  if (!builder || !setup || setup.dataset.captureOptionsEnhanced === 'true') return false;

  const startRecordingButton = setup.querySelector('#sys-start-rec-btn');
  const uploadInput = setup.querySelector('#sys-upload-video-input');
  const uploadWrapper = uploadInput?.parentElement;
  const uploadLabel = uploadWrapper?.querySelector('label[for="sys-upload-video-input"]');
  if (!startRecordingButton || !uploadInput || !uploadWrapper || !uploadLabel) return false;

  setup.dataset.captureOptionsEnhanced = 'true';
  ensureStyles();

  const subtitle = builder.querySelector('#sys-builder-subtitle');
  if (subtitle) {
    subtitle.textContent = 'Create a step by step guide from a screen recording, camera recording or existing video.';
  }

  const setupWrapper = builder.querySelector('#sys-walkthrough-setup-wrapper');
  const setupLabel = setupWrapper?.querySelector(':scope > label');
  if (setupLabel) setupLabel.textContent = 'Choose how to create your guide';

  startRecordingButton.remove();
  uploadWrapper.remove();
  setup.replaceChildren();

  const intro = document.createElement('div');
  intro.className = 'guide-capture-intro';
  intro.innerHTML = `
    <h3>Choose a recording method</h3>
    <p>All three routes use the same guide generator and transcript editor after the video is captured.</p>
  `;

  const grid = document.createElement('div');
  grid.className = 'guide-capture-choice-grid';

  const screenCard = buildChoice({
    icon: '🖥️',
    title: 'Screen Recording',
    description: 'Record your screen and voice while demonstrating a software process.'
  });
  startRecordingButton.classList.add('guide-capture-choice-action');
  startRecordingButton.innerHTML = `
    <span style="display:inline-block;width:10px;height:10px;background:white;border-radius:50%;animation:pulse-dot 1.5s infinite;"></span>
    Start Screen Recording
  `;
  screenCard.appendChild(startRecordingButton);

  const cameraCard = buildChoice({
    icon: '📷',
    title: 'Camera Recording',
    description: 'Use your phone or tablet camera to record a real world task as it is performed.'
  });
  const cameraButton = document.createElement('button');
  cameraButton.type = 'button';
  cameraButton.id = 'sys-start-camera-btn';
  cameraButton.className = 'btn-ghost guide-capture-choice-action';
  cameraButton.textContent = 'Open Camera';
  const cameraNote = document.createElement('div');
  cameraNote.className = 'guide-capture-choice-note';
  cameraNote.textContent = 'Best used on a phone or tablet';
  cameraCard.append(cameraButton, cameraNote);

  const uploadCard = buildChoice({
    icon: '⬆️',
    title: 'Upload Existing Video',
    description: 'Use an MP4 video that has already been recorded and turn it into an editable guide.'
  });
  uploadLabel.classList.add('guide-capture-choice-action');
  uploadLabel.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    Choose Existing Video
  `;
  uploadCard.appendChild(uploadWrapper);

  const prepareExistingVideoPicker = () => {
    uploadInput.removeAttribute('capture');
    uploadInput.setAttribute('accept', 'video/mp4');
    uploadInput.value = '';
  };

  uploadLabel.addEventListener('click', prepareExistingVideoPicker);
  cameraButton.addEventListener('click', () => {
    uploadInput.setAttribute('accept', 'video/mp4');
    uploadInput.setAttribute('capture', 'environment');
    uploadInput.value = '';
    uploadInput.click();
  });

  grid.append(screenCard, cameraCard, uploadCard);
  setup.append(intro, grid);
  return true;
};

export const initGuideCaptureOptionsEnhancement = root => {
  if (!root) return () => {};

  ensureStyles();
  let destroyed = false;
  let queued = false;

  const sync = () => {
    if (!destroyed) enhanceGuideCaptureOptions(root);
  };

  const scheduleSync = () => {
    if (queued || destroyed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  };

  const observer = new MutationObserver(scheduleSync);
  observer.observe(root, { childList: true, subtree: true });
  sync();

  return () => {
    destroyed = true;
    observer.disconnect();
  };
};
