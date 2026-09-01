const STYLE_ID = 'guide-camera-mobile-enhancement-styles';

export const isPortraitTouchViewport = (windowLike = window, navigatorLike = navigator) => {
  const width = Number(windowLike?.innerWidth || 0);
  const height = Number(windowLike?.innerHeight || 0);
  const coarsePointer = Boolean(windowLike?.matchMedia?.('(pointer: coarse)')?.matches);
  const touchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  return (coarsePointer || touchPoints > 0) && height > width;
};

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .guide-camera-orientation-prompt {
      position: fixed;
      inset: 0;
      z-index: 100200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(1.25rem, env(safe-area-inset-top)) max(1.25rem, env(safe-area-inset-right)) max(1.25rem, env(safe-area-inset-bottom)) max(1.25rem, env(safe-area-inset-left));
      box-sizing: border-box;
      background: rgba(4, 8, 16, 0.98);
      color: white;
      text-align: center;
    }

    .guide-camera-orientation-card {
      width: min(480px, 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.15rem;
      padding: 2rem 1.5rem;
      box-sizing: border-box;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 22px;
      background: rgba(255,255,255,0.045);
      box-shadow: 0 20px 55px rgba(0,0,0,0.35);
    }

    .guide-camera-orientation-icon {
      font-size: 5.5rem;
      line-height: 1;
      transform: rotate(90deg);
      margin-bottom: 0.15rem;
    }

    .guide-camera-orientation-card h2 {
      margin: 0;
      font-size: clamp(1.8rem, 7vw, 2.35rem);
      line-height: 1.08;
      letter-spacing: -0.02em;
    }

    .guide-camera-orientation-card p {
      max-width: 360px;
      margin: 0;
      color: #b3bbc7;
      font-size: 1.08rem;
      line-height: 1.5;
    }

    .guide-camera-orientation-actions {
      width: 100%;
      display: flex;
      justify-content: center;
      gap: 0.8rem;
      margin-top: 0.5rem;
    }

    .guide-camera-orientation-actions button {
      min-width: 120px;
      min-height: 54px;
      padding: 0.85rem 1.25rem;
      border-radius: 11px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.075);
      color: white;
      font: inherit;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
    }

    .guide-camera-orientation-actions .guide-camera-cancel {
      color: #b3bbc7;
    }

    @media (max-width: 480px) {
      .guide-camera-orientation-prompt {
        padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
      }

      .guide-camera-orientation-card {
        width: 100%;
        padding: 2rem 1.25rem;
        gap: 1rem;
      }

      .guide-camera-orientation-icon {
        font-size: 5rem;
      }

      .guide-camera-orientation-actions {
        flex-direction: column;
      }

      .guide-camera-orientation-actions button {
        width: 100%;
        min-height: 56px;
      }
    }

    @media (max-width: 900px) {
      #sys-builder-root.sys-camera-mobile-active #rec-live-ui {
        position: fixed !important;
        inset: 0 !important;
        z-index: 100150 !important;
        width: 100vw !important;
        height: 100vh !important;
        height: 100dvh !important;
        max-width: none !important;
        max-height: none !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: flex-end !important;
        gap: 0.65rem !important;
        padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left)) !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        background: #000 !important;
      }

      #sys-builder-root.sys-camera-mobile-active #rec-live-ui > *:not(#sys-camera-preview) {
        position: relative;
        z-index: 2;
      }

      #sys-builder-root.sys-camera-mobile-active #sys-camera-preview {
        position: absolute !important;
        inset: 0 !important;
        z-index: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        aspect-ratio: auto !important;
        object-fit: cover !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        background: #000 !important;
      }

      #sys-builder-root.sys-camera-mobile-active #sys-stop-rec-btn {
        min-width: 150px;
        min-height: 48px;
        margin-bottom: 0.25rem;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      }
    }
  `;
  document.head.appendChild(style);
};

const closeOrientationPrompt = prompt => {
  prompt?.remove();
};

export const showLandscapePrompt = ({ onContinue, onCancel, windowLike = window } = {}) => {
  document.querySelector('.guide-camera-orientation-prompt')?.remove();

  const prompt = document.createElement('div');
  prompt.className = 'guide-camera-orientation-prompt';
  prompt.innerHTML = `
    <div class="guide-camera-orientation-card">
      <div class="guide-camera-orientation-icon" aria-hidden="true">📱</div>
      <h2>Turn your phone sideways</h2>
      <p>Record in landscape so the finished guide is easier to watch.</p>
      <div class="guide-camera-orientation-actions">
        <button type="button" class="guide-camera-cancel">Cancel</button>
        <button type="button" class="guide-camera-continue">Record anyway</button>
      </div>
    </div>
  `;
  document.body.appendChild(prompt);

  let finished = false;
  const cleanup = () => {
    windowLike.removeEventListener?.('resize', handleOrientationChange);
    windowLike.removeEventListener?.('orientationchange', handleOrientationChange);
    closeOrientationPrompt(prompt);
  };

  const continueRecording = () => {
    if (finished) return;
    finished = true;
    cleanup();
    onContinue?.();
  };

  const cancelRecording = () => {
    if (finished) return;
    finished = true;
    cleanup();
    onCancel?.();
  };

  const handleOrientationChange = () => {
    if (Number(windowLike.innerWidth || 0) > Number(windowLike.innerHeight || 0)) {
      continueRecording();
    }
  };

  prompt.querySelector('.guide-camera-continue')?.addEventListener('click', continueRecording);
  prompt.querySelector('.guide-camera-cancel')?.addEventListener('click', cancelRecording);
  windowLike.addEventListener?.('resize', handleOrientationChange);
  windowLike.addEventListener?.('orientationchange', handleOrientationChange);

  return cleanup;
};

export const initGuideCameraMobileEnhancement = root => {
  if (!root) return () => {};
  ensureStyles();

  let destroyed = false;
  let bypassLandscapePrompt = false;
  let activeOrientationCleanup = null;

  const syncFullscreenState = () => {
    if (destroyed) return;
    root.querySelectorAll?.('#sys-builder-root').forEach(builder => {
      const hasCameraPreview = Boolean(builder.querySelector('#sys-camera-preview'));
      builder.classList.toggle('sys-camera-mobile-active', hasCameraPreview);
    });
  };

  const launchCameraAfterPrompt = button => {
    bypassLandscapePrompt = true;
    try {
      button.click();
    } finally {
      bypassLandscapePrompt = false;
    }
  };

  const handleCameraClick = event => {
    const button = event.target?.closest?.('#sys-start-camera-btn');
    if (!button || bypassLandscapePrompt || !isPortraitTouchViewport()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    activeOrientationCleanup?.();
    activeOrientationCleanup = showLandscapePrompt({
      onContinue: () => {
        activeOrientationCleanup = null;
        launchCameraAfterPrompt(button);
      },
      onCancel: () => {
        activeOrientationCleanup = null;
      }
    });
  };

  root.addEventListener('click', handleCameraClick, true);

  const observer = new MutationObserver(syncFullscreenState);
  observer.observe(root, { childList: true, subtree: true });
  syncFullscreenState();

  return () => {
    destroyed = true;
    root.removeEventListener('click', handleCameraClick, true);
    observer.disconnect();
    activeOrientationCleanup?.();
    activeOrientationCleanup = null;
    document.querySelector('.guide-camera-orientation-prompt')?.remove();
    root.querySelectorAll?.('#sys-builder-root.sys-camera-mobile-active').forEach(builder => {
      builder.classList.remove('sys-camera-mobile-active');
    });
  };
};
