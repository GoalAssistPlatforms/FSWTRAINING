import { initGuideChatHistory } from './guideChatHistory.js';
import { initGuidesWorkspaceEnhancement } from './guidesWorkspaceEnhancement.js';
import { initGuidesLibraryPolish } from './guidesLibraryPolish.js';
import { initGuidesChatOrganisation } from './guidesChatOrganisation.js';
import { initGuidesChatMenus } from './guidesChatMenus.js';
import { initGuidesLibraryNavigationFix } from './guidesLibraryNavigationFix.js';
import { initGuideCaptureOptionsEnhancement } from './guideCaptureOptionsEnhancement.js';
import { initGuideCameraMobileEnhancement } from './guideCameraMobileEnhancement.js';
import { initGuideChatVideoRecovery } from './guideChatVideoRecovery.js';
import { initGuidesLibraryItemMenus } from './guidesLibraryItemMenus.js';

const LEARNING_PACK_GREEN = '#10b981';
const STYLE_ID = 'fsw-ui-enhancement-styles';

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #create-pack-card > div:first-child {
      background: ${LEARNING_PACK_GREEN} !important;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.4) !important;
    }

    #guides-chat-controls {
      width: 100%;
      max-width: 800px;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 0.5rem;
      box-sizing: border-box;
      margin-bottom: 0.25rem;
      position: relative;
      z-index: 40;
    }

    #guides-chat-controls > button {
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

    #guides-chat-controls > button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.24);
      color: white;
    }

    #guides-chat-controls > button:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    #guides-chat-controls > button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    #guides-chat-history-panel {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      width: min(360px, calc(100vw - 3rem));
      max-height: min(520px, 65vh);
      overflow-y: auto;
      padding: 0.75rem;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      background: rgba(17, 24, 39, 0.98);
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(18px);
      box-sizing: border-box;
    }

    #guides-chat-history-panel[hidden] {
      display: none;
    }

    .guide-chat-history-heading {
      padding: 0.35rem 0.45rem 0.7rem;
      color: white;
      font-size: 0.9rem;
      font-weight: 700;
    }

    .guide-chat-history-list {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .guide-chat-history-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.4rem;
      align-items: center;
      border-radius: 10px;
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.025);
    }

    .guide-chat-history-item:hover,
    .guide-chat-history-item.active {
      background: rgba(255, 255, 255, 0.065);
      border-color: rgba(255, 255, 255, 0.08);
    }

    .guide-chat-history-open {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.18rem;
      padding: 0.65rem 0.7rem;
      background: transparent;
      border: none;
      color: white;
      text-align: left;
      cursor: pointer;
    }

    .guide-chat-history-title {
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.84rem;
      font-weight: 600;
    }

    .guide-chat-history-date {
      color: var(--text-muted);
      font-size: 0.7rem;
    }

    .guide-chat-history-actions {
      display: flex;
      gap: 0.2rem;
      padding-right: 0.4rem;
    }

    .guide-chat-history-actions button {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 7px;
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      font-size: 1rem;
    }

    .guide-chat-history-actions button:hover {
      background: rgba(255, 255, 255, 0.08);
      color: white;
    }

    .guide-chat-delete:hover {
      color: #f87171 !important;
    }

    .guide-chat-history-empty {
      padding: 1.25rem 0.75rem;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.82rem;
    }
  `;

  document.head.appendChild(style);
};

export const initUiEnhancements = root => {
  if (!root) return () => {};

  ensureStyles();

  let queued = false;
  let scheduledChatView = null;
  let activeChatView = null;
  let activeChatCleanup = null;
  let activeWorkspaceCleanup = null;
  let activeOrganisationCleanup = null;
  let activeMenusCleanup = null;
  let activeLibraryNavigationCleanup = null;
  let destroyed = false;

  const cleanupGuidesLibraryPolish = initGuidesLibraryPolish(root);
  const cleanupGuideCaptureOptions = initGuideCaptureOptionsEnhancement(root);
  const cleanupGuideCameraMobile = initGuideCameraMobileEnhancement(root);
  const cleanupGuideChatVideoRecovery = initGuideChatVideoRecovery(root);
  const cleanupGuidesLibraryItemMenus = initGuidesLibraryItemMenus(root);

  const cleanupActiveWorkspace = () => {
    activeLibraryNavigationCleanup?.();
    activeLibraryNavigationCleanup = null;
    activeMenusCleanup?.();
    activeMenusCleanup = null;
    activeOrganisationCleanup?.();
    activeOrganisationCleanup = null;
    activeWorkspaceCleanup?.();
    activeWorkspaceCleanup = null;
  };

  const cleanupActiveChat = () => {
    activeChatCleanup?.();
    activeChatCleanup = null;
    activeChatView = null;
    cleanupActiveWorkspace();
  };

  const scheduleChatInitialisation = chatView => {
    if (!chatView || chatView === activeChatView || chatView === scheduledChatView) return;
    scheduledChatView = chatView;

    requestAnimationFrame(async () => {
      if (destroyed) return;
      const target = scheduledChatView;
      scheduledChatView = null;
      if (!target?.isConnected) return;

      if (activeChatView && activeChatView !== target) cleanupActiveChat();
      activeChatView = target;
      activeChatCleanup = await initGuideChatHistory(target);
      cleanupActiveWorkspace();
      activeWorkspaceCleanup = initGuidesWorkspaceEnhancement(root);
      activeOrganisationCleanup = initGuidesChatOrganisation(root);
      activeMenusCleanup = initGuidesChatMenus(root);
      activeLibraryNavigationCleanup = initGuidesLibraryNavigationFix(root);
    });
  };

  const syncEnhancements = () => {
    ensureStyles();

    if (activeChatView && !activeChatView.isConnected) cleanupActiveChat();
    scheduleChatInitialisation(root.querySelector?.('#guides-chat-view'));
  };

  syncEnhancements();

  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!destroyed) syncEnhancements();
    });
  });

  observer.observe(root, {
    childList: true,
    subtree: true
  });

  return () => {
    destroyed = true;
    observer.disconnect();
    cleanupGuidesLibraryPolish();
    cleanupGuideCaptureOptions();
    cleanupGuideCameraMobile();
    cleanupGuideChatVideoRecovery();
    cleanupGuidesLibraryItemMenus();
    cleanupActiveChat();
  };
};
