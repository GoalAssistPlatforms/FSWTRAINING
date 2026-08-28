const LIBRARY_POLISH_STYLE_ID = 'guides-library-polish-styles';

export const calculateGuidesWorkspaceHeight = (viewportHeight, top, bottomGap = 16) => {
  const available = Number(viewportHeight) - Number(top) - Number(bottomGap);
  return Math.max(420, Math.floor(available));
};

const ensurePolishStyles = () => {
  if (document.getElementById(LIBRARY_POLISH_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = LIBRARY_POLISH_STYLE_ID;
  style.textContent = `
    .guides-container.guides-workspace-ready {
      min-height: 420px !important;
      overflow: hidden !important;
    }

    .guides-workspace-sidebar {
      min-height: 0 !important;
      overflow: hidden !important;
    }

    .guides-workspace-chat-list {
      min-height: 0 !important;
      overflow-y: auto !important;
    }

    .guides-workspace-sidebar-footer {
      flex: 0 0 auto !important;
      margin-top: 0.65rem !important;
      padding-top: 0.65rem !important;
      background: rgba(8, 13, 24, 0.96);
    }

    .guides-workspace-library {
      padding: 0.72rem 0.75rem !important;
    }

    .guides-workspace-ready > div:last-child {
      min-height: 0 !important;
      overflow: hidden !important;
    }

    .guides-workspace-ready #guides-chat-view,
    .guides-workspace-ready #guides-manager-view,
    .guides-workspace-ready #guides-user-library-view {
      min-height: 0 !important;
    }

    .guides-workspace-ready #guides-manager-view {
      max-width: 1040px !important;
      gap: 1rem !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding-right: 0.2rem !important;
      scrollbar-width: thin;
    }

    .guides-workspace-ready #guides-manager-view > div:first-child {
      padding-bottom: 1rem !important;
      border-bottom: 1px solid rgba(255,255,255,0.06) !important;
    }

    .guides-workspace-ready #guides-manager-view h2 {
      font-size: 1.65rem !important;
      letter-spacing: -0.02em;
    }

    .guides-workspace-ready #guides-manager-view h2 + p {
      max-width: 610px;
      line-height: 1.45;
      color: #858e9b !important;
    }

    .guides-library-manager-actions {
      gap: 0.4rem !important;
    }

    .guides-library-action {
      border-radius: 8px !important;
      padding: 0.55rem 0.7rem !important;
      background: rgba(255,255,255,0.035) !important;
      border-color: rgba(255,255,255,0.1) !important;
      font-size: 0.76rem !important;
      white-space: nowrap;
    }

    .guides-library-action:hover {
      background: rgba(255,255,255,0.075) !important;
      border-color: rgba(255,255,255,0.16) !important;
    }

    .guides-workspace-ready #guides-manager-view #curation-search,
    .guides-workspace-ready #guides-manager-view select {
      height: 38px !important;
      border-radius: 9px !important;
      background: rgba(255,255,255,0.035) !important;
      border-color: rgba(255,255,255,0.09) !important;
      font-size: 0.8rem !important;
    }

    .guides-workspace-ready #guides-manager-view #curation-search:focus,
    .guides-workspace-ready #guides-manager-view select:focus {
      border-color: rgba(var(--primary-rgb), 0.65) !important;
    }

    .guides-workspace-ready #guides-manager-view #curation-search {
      padding-top: 0.55rem !important;
      padding-bottom: 0.55rem !important;
    }

    .guides-workspace-ready #guides-manager-view #curation-items-list {
      gap: 0 !important;
      border: 1px solid rgba(255,255,255,0.075);
      border-radius: 14px;
      overflow: hidden;
      background: rgba(255,255,255,0.012);
    }

    .guides-workspace-ready #guides-manager-view .curation-card {
      display: flex !important;
      flex-direction: column !important;
      gap: 0.45rem !important;
      padding: 1rem 1.1rem !important;
      border: 0 !important;
      border-bottom: 1px solid rgba(255,255,255,0.065) !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card:last-child {
      border-bottom: 0 !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card:hover {
      background: rgba(255,255,255,0.025) !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card > div:first-child {
      align-items: center !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card > div:first-child > div:first-child {
      align-items: center !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card > div:first-child > div:first-child > div:first-child {
      width: 34px !important;
      height: 34px !important;
      flex: 0 0 34px !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card > div:nth-child(2) {
      margin-left: 46px !important;
      padding: 0 !important;
      background: transparent !important;
      border-radius: 0 !important;
      min-height: 0 !important;
      font-size: 0.76rem !important;
      justify-content: flex-start !important;
      color: #7f8896 !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card > div:nth-child(2) > span {
      display: none !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card > div:nth-child(3) {
      margin-left: 46px !important;
      padding-top: 0.3rem !important;
      border-top: 0 !important;
      justify-content: flex-start !important;
      gap: 0.45rem !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card > div:nth-child(3) > div {
      gap: 0.4rem !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card .edit-curation-btn,
    .guides-workspace-ready #guides-manager-view .curation-card .snooze-curation-btn,
    .guides-workspace-ready #guides-manager-view .curation-card .delete-curation-btn {
      padding: 0.32rem 0.62rem !important;
      border-radius: 7px !important;
      font-size: 0.73rem !important;
      min-height: 30px;
    }

    .guides-workspace-ready #guides-manager-view .curation-card .delete-curation-btn {
      margin-left: auto;
      background: transparent !important;
      border-color: transparent !important;
      color: #9aa3af !important;
    }

    .guides-workspace-ready #guides-manager-view .curation-card .delete-curation-btn:hover {
      color: #f87171 !important;
      background: rgba(239,68,68,0.07) !important;
    }

    .guides-workspace-ready #guides-user-library-view {
      max-width: 1040px !important;
      gap: 1rem !important;
    }

    .guides-user-library-view .guides-library-toolbar {
      padding: 0.65rem !important;
      border-radius: 12px !important;
      background: rgba(255,255,255,0.018) !important;
    }

    .guides-user-library-view .guides-library-sections {
      gap: 0 !important;
      border: 1px solid rgba(255,255,255,0.075);
      border-radius: 14px;
      background: rgba(255,255,255,0.012);
    }

    .guides-user-library-view .guides-library-section {
      gap: 0 !important;
    }

    .guides-user-library-view .guides-library-section-title {
      margin: 0 !important;
      padding: 0.8rem 1rem 0.5rem !important;
      border-top: 1px solid rgba(255,255,255,0.055);
    }

    .guides-user-library-view .guides-library-section:first-child .guides-library-section-title {
      border-top: 0;
    }

    .guides-user-library-view .guide-card {
      border: 0 !important;
      border-top: 1px solid rgba(255,255,255,0.055) !important;
      border-radius: 0 !important;
      background: transparent !important;
      padding: 0.9rem 1rem !important;
      min-height: 64px !important;
      box-shadow: none !important;
    }

    .guides-user-library-view .guide-card:hover {
      background: rgba(255,255,255,0.025) !important;
    }

    @media (max-width: 980px) {
      .guides-library-header,
      .guides-workspace-ready #guides-manager-view > div:first-child {
        align-items: flex-start !important;
        flex-direction: column !important;
      }

      .guides-library-manager-actions {
        width: 100%;
        flex-wrap: wrap;
      }
    }
  `;
  document.head.appendChild(style);
};

const fitWorkspaceToViewport = container => {
  if (!container?.isConnected) return;
  const top = container.getBoundingClientRect().top;
  const height = calculateGuidesWorkspaceHeight(window.innerHeight, top);
  container.style.setProperty('height', `${height}px`, 'important');
  container.style.setProperty('max-height', `${height}px`, 'important');
};

export const initGuidesLibraryPolish = root => {
  ensurePolishStyles();

  let destroyed = false;
  let activeContainer = null;
  let queued = false;

  const sync = () => {
    if (destroyed) return;
    const container = root?.querySelector?.('.guides-container.guides-workspace-ready');
    if (!container) return;
    activeContainer = container;
    fitWorkspaceToViewport(container);
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
  window.addEventListener('resize', scheduleSync);

  sync();

  return () => {
    destroyed = true;
    observer.disconnect();
    window.removeEventListener('resize', scheduleSync);
    if (activeContainer) {
      activeContainer.style.removeProperty('height');
      activeContainer.style.removeProperty('max-height');
    }
  };
};
