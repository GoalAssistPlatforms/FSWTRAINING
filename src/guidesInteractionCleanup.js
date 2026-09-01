const STYLE_ID = 'guides-interaction-cleanup-styles';

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .guides-native-build-guide-action {
      flex: 0 0 auto;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    }

    .guides-native-build-guide-action .guides-native-build-guide-icon {
      font-size: 0.9rem;
      line-height: 1;
    }

    .guides-native-build-guide-action .guides-native-build-guide-label {
      color: inherit;
      font-size: inherit;
      font-weight: inherit;
      line-height: 1;
    }

    @media (max-width: 760px) {
      .guides-container.guides-workspace-ready[style*="display: none"] {
        display: none !important;
      }

      .guides-library-manager-actions .guides-library-action {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 0.4rem !important;
        height: 44px !important;
        min-height: 44px !important;
        padding: 0 0.85rem !important;
        margin: 0 !important;
        box-sizing: border-box !important;
        line-height: 1 !important;
        vertical-align: middle !important;
      }

      .guides-library-manager-actions #create-interactive-guide-btn {
        height: 44px !important;
        min-height: 44px !important;
      }
    }
  `;
  document.head.appendChild(style);
};

const removeChatSuggestions = root => {
  root.querySelectorAll?.('#chat-suggestions').forEach(element => element.remove());
};

const promoteNativeBuildGuideAction = root => {
  const toolbarAction = root.querySelector?.('.guides-library-manager-actions [data-action="guide"]');
  const nativeAction = document.getElementById('create-interactive-guide-btn');

  if (!toolbarAction || !nativeAction || toolbarAction === nativeAction) return;

  nativeAction.className = 'guides-library-action guides-native-build-guide-action';
  nativeAction.dataset.action = 'guide';
  nativeAction.setAttribute('role', 'button');
  nativeAction.setAttribute('tabindex', '0');
  nativeAction.setAttribute('aria-label', 'Build Guide');
  nativeAction.style.cssText = '';
  nativeAction.innerHTML = `
    <span class="guides-native-build-guide-icon" aria-hidden="true">🖱️</span>
    <span class="guides-native-build-guide-label">Build Guide</span>
  `;

  if (nativeAction.dataset.nativeToolbarKeyboardReady !== 'true') {
    nativeAction.dataset.nativeToolbarKeyboardReady = 'true';
    nativeAction.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      nativeAction.click();
    });
  }

  toolbarAction.replaceWith(nativeAction);
};

export const syncGuidesInteractionCleanup = (root = document) => {
  ensureStyles();
  removeChatSuggestions(root);
  promoteNativeBuildGuideAction(root);
};

export const initGuidesInteractionCleanup = (root = document.body) => {
  let destroyed = false;
  let queued = false;

  const sync = () => {
    if (!destroyed) syncGuidesInteractionCleanup(document);
  };

  const scheduleSync = () => {
    if (queued || destroyed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  };

  sync();

  const observer = new MutationObserver(scheduleSync);
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    destroyed = true;
    observer.disconnect();
  };
};
