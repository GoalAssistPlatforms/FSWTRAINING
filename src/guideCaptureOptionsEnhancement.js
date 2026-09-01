const STYLE_ID = 'guide-capture-options-enhancement-styles';

const RECORDER_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm'
];

export const chooseSupportedRecorderMimeType = (RecorderCtor, requestedMimeType = '') => {
  if (!RecorderCtor || typeof RecorderCtor.isTypeSupported !== 'function') return '';

  const requested = String(requestedMimeType || '').trim();
  if (requested && RecorderCtor.isTypeSupported(requested)) return requested;

  return RECORDER_MIME_CANDIDATES.find(type => RecorderCtor.isTypeSupported(type)) || '';
};

export const extensionForRecorderMimeType = mimeType => {
  const normalised = String(mimeType || '').toLowerCase();
  if (normalised.includes('mp4')) return 'mp4';
  if (normalised.includes('quicktime')) return 'mov';
  return 'webm';
};

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .guide-capture-choice-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.8rem;
      width: 100%;
    }

    .guide-capture-choice {
      min-width: 0;
      min-height: 124px;
      display: flex !important;
      flex-direction: column;
      align-items: flex-start !important;
      justify-content: center !important;
      gap: 0.35rem !important;
      padding: 1rem !important;
      border: 1px solid var(--glass-border) !important;
      border-radius: var(--radius-md) !important;
      background: rgba(255,255,255,0.025) !important;
      color: white !important;
      text-align: left !important;
      box-sizing: border-box;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
    }

    .guide-capture-choice:hover {
      border-color: rgba(255,255,255,0.22) !important;
      background: rgba(255,255,255,0.055) !important;
      transform: translateY(-1px);
    }

    .guide-capture-choice:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    .guide-capture-choice-icon {
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 9px;
      background: rgba(var(--primary-rgb), 0.14);
      font-size: 1.1rem;
      margin-bottom: 0.2rem;
    }

    .guide-capture-choice-title {
      font-size: 0.92rem;
      font-weight: 700;
      line-height: 1.25;
    }

    .guide-capture-choice-copy {
      color: var(--text-muted);
      font-size: 0.73rem;
      line-height: 1.35;
    }

    #sys-start-rec-btn.guide-capture-choice {
      background: rgba(239, 68, 68, 0.06) !important;
      border-color: rgba(239, 68, 68, 0.22) !important;
    }

    #sys-start-rec-btn.guide-capture-choice:hover {
      background: rgba(239, 68, 68, 0.1) !important;
      border-color: rgba(239, 68, 68, 0.4) !important;
    }

    #sys-start-camera-btn.guide-capture-choice {
      background: rgba(16, 185, 129, 0.05) !important;
      border-color: rgba(16, 185, 129, 0.2) !important;
    }

    #sys-start-camera-btn.guide-capture-choice:hover {
      background: rgba(16, 185, 129, 0.1) !important;
      border-color: rgba(16, 185, 129, 0.38) !important;
    }

    #sys-camera-preview {
      width: min(420px, 100%);
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: 10px;
      border: 1px solid var(--glass-border);
      background: #05070b;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }

    @media (max-width: 900px) {
      .guide-capture-choice-grid {
        grid-template-columns: 1fr;
      }

      .guide-capture-choice {
        min-height: 92px;
      }
    }
  `;

  document.head.appendChild(style);
};

const setChoiceContent = (control, icon, title, copy) => {
  control.classList.add('guide-capture-choice');
  control.innerHTML = `
    <span class="guide-capture-choice-icon" aria-hidden="true">${icon}</span>
    <span class="guide-capture-choice-title">${title}</span>
    <span class="guide-capture-choice-copy">${copy}</span>
  `;
};

const createCameraPreview = (builder, stream) => {
  const liveUi = builder.querySelector('#rec-live-ui');
  if (!liveUi) return () => {};

  liveUi.querySelector('#sys-camera-preview')?.remove();
  const preview = document.createElement('video');
  preview.id = 'sys-camera-preview';
  preview.autoplay = true;
  preview.muted = true;
  preview.playsInline = true;
  preview.srcObject = stream;
  liveUi.prepend(preview);
  preview.play().catch(() => {});

  const cleanup = () => {
    preview.srcObject = null;
    preview.remove();
  };

  stream.getVideoTracks().forEach(track => {
    track.addEventListener('ended', cleanup, { once: true });
  });

  const stopButton = builder.querySelector('#sys-stop-rec-btn');
  stopButton?.addEventListener('click', cleanup, { once: true });
  return cleanup;
};

const installOneShotCameraDisplay = builder => {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) {
    throw new Error('Camera access is not available in this browser.');
  }

  const hadOwnDisplayMethod = Object.prototype.hasOwnProperty.call(mediaDevices, 'getDisplayMedia');
  const originalDescriptor = hadOwnDisplayMethod
    ? Object.getOwnPropertyDescriptor(mediaDevices, 'getDisplayMedia')
    : null;
  let restored = false;

  const restore = () => {
    if (restored) return;
    restored = true;
    try {
      if (hadOwnDisplayMethod && originalDescriptor) {
        Object.defineProperty(mediaDevices, 'getDisplayMedia', originalDescriptor);
      } else {
        delete mediaDevices.getDisplayMedia;
      }
    } catch (error) {
      console.warn('Could not restore screen capture method:', error);
    }
  };

  const cameraDisplayMethod = async () => {
    restore();
    const stream = await mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    createCameraPreview(builder, stream);
    return stream;
  };

  try {
    Object.defineProperty(mediaDevices, 'getDisplayMedia', {
      configurable: true,
      writable: true,
      value: cameraDisplayMethod
    });
  } catch (error) {
    throw new Error('This browser would not allow the camera recorder to start.');
  }

  const timeout = window.setTimeout(restore, 60000);
  return () => {
    window.clearTimeout(timeout);
    restore();
  };
};

export const installCameraRecorderFormatCompatibility = () => {
  const NativeMediaRecorder = window.MediaRecorder;
  const NativeBlob = window.Blob;
  const NativeFile = window.File;

  if (!NativeMediaRecorder || !NativeBlob || !NativeFile) return () => {};

  const mediaRecorderDescriptor = Object.getOwnPropertyDescriptor(window, 'MediaRecorder');
  const blobDescriptor = Object.getOwnPropertyDescriptor(window, 'Blob');
  let activeRecorderMimeType = '';
  let restored = false;
  let timeout = null;

  const restore = () => {
    if (restored) return;
    restored = true;
    if (timeout !== null) window.clearTimeout(timeout);

    try {
      if (mediaRecorderDescriptor) {
        Object.defineProperty(window, 'MediaRecorder', mediaRecorderDescriptor);
      } else {
        window.MediaRecorder = NativeMediaRecorder;
      }
    } catch (error) {
      window.MediaRecorder = NativeMediaRecorder;
    }

    try {
      if (blobDescriptor) {
        Object.defineProperty(window, 'Blob', blobDescriptor);
      } else {
        window.Blob = NativeBlob;
      }
    } catch (error) {
      window.Blob = NativeBlob;
    }
  };

  function CompatibleMediaRecorder(stream, options = {}) {
    const requestedMimeType = options?.mimeType || '';
    const selectedMimeType = chooseSupportedRecorderMimeType(NativeMediaRecorder, requestedMimeType);
    const recorderOptions = selectedMimeType
      ? { ...options, mimeType: selectedMimeType }
      : undefined;
    const recorder = recorderOptions
      ? new NativeMediaRecorder(stream, recorderOptions)
      : new NativeMediaRecorder(stream);

    activeRecorderMimeType = recorder.mimeType || selectedMimeType || '';
    return recorder;
  }

  Object.setPrototypeOf(CompatibleMediaRecorder, NativeMediaRecorder);
  CompatibleMediaRecorder.prototype = NativeMediaRecorder.prototype;
  CompatibleMediaRecorder.isTypeSupported = type => NativeMediaRecorder.isTypeSupported(type);

  function CompatibleBlob(parts = [], options = {}) {
    const requestedType = String(options?.type || '').toLowerCase();
    const videoPart = Array.from(parts || []).find(part =>
      part instanceof NativeBlob && String(part.type || '').toLowerCase().startsWith('video/')
    );
    const actualMimeType = activeRecorderMimeType || videoPart?.type || '';
    const isRecordedVideoAssembly = requestedType.startsWith('video/webm') && Boolean(actualMimeType);

    if (isRecordedVideoAssembly) {
      const extension = extensionForRecorderMimeType(actualMimeType);
      const file = new NativeFile(
        parts,
        `camera_recording_${Date.now()}.${extension}`,
        {
          type: actualMimeType,
          lastModified: Date.now()
        }
      );
      restore();
      return file;
    }

    return new NativeBlob(parts, options);
  }

  CompatibleBlob.prototype = NativeBlob.prototype;
  Object.setPrototypeOf(CompatibleBlob, NativeBlob);

  try {
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      writable: true,
      value: CompatibleMediaRecorder
    });
    Object.defineProperty(window, 'Blob', {
      configurable: true,
      writable: true,
      value: CompatibleBlob
    });
  } catch (error) {
    restore();
    return () => {};
  }

  timeout = window.setTimeout(restore, 10 * 60 * 1000);
  return restore;
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
  if (subtitle) subtitle.textContent = 'Create a guide from a recording or video.';

  const setupWrapper = builder.querySelector('#sys-walkthrough-setup-wrapper');
  const setupLabel = setupWrapper?.querySelector(':scope > label');
  if (setupLabel) setupLabel.textContent = 'Choose a source';

  startRecordingButton.remove();
  uploadLabel.remove();
  uploadInput.remove();
  uploadWrapper.remove();
  setup.replaceChildren();

  startRecordingButton.removeAttribute('style');
  setChoiceContent(startRecordingButton, '🖥️', 'Screen Recording', 'Record your screen');

  const cameraButton = document.createElement('button');
  cameraButton.type = 'button';
  cameraButton.id = 'sys-start-camera-btn';
  setChoiceContent(cameraButton, '📷', 'Camera Recording', 'Record a real world task');

  uploadLabel.removeAttribute('style');
  uploadLabel.removeAttribute('onmouseover');
  uploadLabel.removeAttribute('onmouseout');
  setChoiceContent(uploadLabel, '⬆️', 'Upload Existing Video', 'Use a video you already have');

  uploadInput.removeAttribute('capture');
  uploadInput.setAttribute('accept', 'video/mp4');
  uploadInput.style.display = 'none';

  const grid = document.createElement('div');
  grid.className = 'guide-capture-choice-grid';
  grid.append(startRecordingButton, cameraButton, uploadLabel);
  setup.append(grid, uploadInput);

  uploadLabel.addEventListener('click', () => {
    uploadInput.removeAttribute('capture');
    uploadInput.setAttribute('accept', 'video/mp4');
    uploadInput.value = '';
  });

  let restorePendingCameraDisplay = null;
  let restorePendingRecorderCompatibility = null;
  let launchingCamera = false;

  const clearPendingCameraOverrides = () => {
    restorePendingCameraDisplay?.();
    restorePendingCameraDisplay = null;
    restorePendingRecorderCompatibility?.();
    restorePendingRecorderCompatibility = null;
  };

  startRecordingButton.addEventListener('click', () => {
    if (!launchingCamera) clearPendingCameraOverrides();
  }, true);

  cameraButton.addEventListener('click', () => {
    clearPendingCameraOverrides();

    try {
      restorePendingCameraDisplay = installOneShotCameraDisplay(builder);
      restorePendingRecorderCompatibility = installCameraRecorderFormatCompatibility();
      launchingCamera = true;
      startRecordingButton.click();
    } catch (error) {
      clearPendingCameraOverrides();
      window.alert(error.message || 'Camera recording could not be started.');
    } finally {
      launchingCamera = false;
    }
  });

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
