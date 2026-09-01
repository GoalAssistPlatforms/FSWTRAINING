const STYLE_ID = 'fsw-mobile-experience-styles';

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .fsw-mobile-guides-toggle,
    .fsw-mobile-guides-backdrop {
      display: none;
    }

    @media (max-width: 760px) {
      html,
      body {
        width: 100%;
        max-width: 100%;
        overflow-x: hidden;
      }

      #app {
        width: 100%;
        max-width: none !important;
        padding: 0.7rem !important;
        box-sizing: border-box;
      }

      .fsw-main-header {
        min-height: 0 !important;
        margin-bottom: 0.85rem !important;
        padding: 0.65rem 0.7rem !important;
        border-radius: 16px !important;
        gap: 0.65rem !important;
      }

      .fsw-main-header .fsw-header-brand {
        min-width: 0;
        gap: 0.55rem !important;
      }

      .fsw-main-header .logo-badge {
        flex-shrink: 0;
        padding: 5px 8px !important;
        border-radius: 10px !important;
      }

      .fsw-main-header .logo-badge img {
        height: 32px !important;
        width: auto !important;
      }

      .fsw-main-header .fsw-header-brand-copy h2 {
        font-size: 1.05rem !important;
      }

      .fsw-main-header .fsw-header-brand-copy span {
        display: none !important;
      }

      .fsw-main-header .fsw-header-actions {
        min-width: 0;
        gap: 0.35rem !important;
      }

      .fsw-main-header #notification-bell-placeholder {
        transform: scale(0.92);
        transform-origin: center;
      }

      .fsw-main-header #settings-btn {
        margin-left: 0 !important;
      }

      .fsw-main-header #settings-btn img,
      .fsw-main-header #settings-btn > div {
        width: 34px !important;
        height: 34px !important;
        font-size: 0.9rem !important;
      }

      .fsw-main-header #logout-btn {
        margin-left: 0 !important;
        padding: 0.55rem 0.65rem !important;
        border-radius: 10px !important;
        font-size: 0.75rem !important;
      }

      .fsw-main-header .fsw-admin-view-toggle {
        margin-right: 0 !important;
        padding: 0.2rem 0.35rem !important;
        gap: 0.2rem !important;
      }

      .fsw-main-header .fsw-admin-view-toggle > span {
        display: none !important;
      }

      .fsw-main-header #admin-view-toggle {
        max-width: 104px;
        min-height: 34px;
        padding: 0.35rem 2rem 0.35rem 0.5rem !important;
        font-size: 0.78rem !important;
      }

      .fsw-primary-tabs {
        width: 100%;
        display: flex !important;
        gap: 0.5rem !important;
        margin-bottom: 1rem !important;
        padding: 0 0 0.7rem !important;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: none;
        scroll-snap-type: x proximity;
      }

      .fsw-primary-tabs::-webkit-scrollbar {
        display: none;
      }

      .fsw-primary-tabs > button {
        flex: 0 0 auto;
        min-height: 42px;
        padding: 0.65rem 0.9rem !important;
        font-size: 0.83rem !important;
        scroll-snap-align: start;
      }

      #user-course-list,
      #user-packs-list,
      #course-list,
      #pack-list {
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 1rem !important;
      }

      #user-courses-container,
      #user-packs-container {
        margin-bottom: 1.5rem !important;
      }

      #user-packs-container {
        margin-top: 1.5rem !important;
        padding-top: 1.25rem !important;
      }

      #team-metrics,
      #feedback-metrics {
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 0.8rem !important;
      }

      #user-search,
      #feedback-search {
        min-height: 44px;
        font-size: 16px !important;
      }

      #user-search:where(input),
      #feedback-search:where(input) {
        width: 100% !important;
      }

      #user-search:where(input) + *,
      #feedback-search:where(input) + * {
        min-width: 0;
      }

      #floating-feedback-btn {
        right: 10px !important;
        bottom: 10px !important;
        padding: 0.65rem 0.8rem !important;
        font-size: 0.78rem !important;
      }

      .guides-container.guides-workspace-ready {
        display: block !important;
        grid-template-columns: minmax(0, 1fr) !important;
        width: 100% !important;
        min-width: 0 !important;
        height: calc(100dvh - 155px) !important;
        min-height: 520px;
        position: relative;
        overflow: hidden;
      }

      .guides-container.guides-workspace-ready > div:last-child {
        width: 100% !important;
        min-width: 0 !important;
        height: 100% !important;
        padding: 3.45rem 0.65rem 1rem !important;
        box-sizing: border-box !important;
        overflow-y: auto !important;
      }

      .guides-workspace-sidebar {
        position: fixed !important;
        top: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        z-index: 10060 !important;
        width: min(86vw, 320px) !important;
        height: 100dvh !important;
        padding: max(1rem, env(safe-area-inset-top)) 0.8rem max(1rem, env(safe-area-inset-bottom)) !important;
        border-right: 1px solid rgba(255,255,255,0.12) !important;
        background: rgba(8, 13, 24, 0.985) !important;
        box-shadow: 18px 0 45px rgba(0,0,0,0.45);
        transform: translateX(-105%);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.24s ease, opacity 0.2s ease;
      }

      .guides-container.guides-mobile-drawer-open .guides-workspace-sidebar {
        transform: translateX(0);
        opacity: 1;
        pointer-events: auto;
      }

      .fsw-mobile-guides-toggle {
        position: absolute;
        top: 0.55rem;
        left: 0.65rem;
        z-index: 80;
        min-height: 42px;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.55rem 0.75rem;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        background: rgba(17,24,39,0.96);
        color: white;
        font: inherit;
        font-size: 0.82rem;
        font-weight: 650;
        box-shadow: 0 8px 20px rgba(0,0,0,0.28);
      }

      .fsw-mobile-guides-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10050;
        background: rgba(0,0,0,0.58);
      }

      .guides-container.guides-mobile-drawer-open .fsw-mobile-guides-backdrop {
        display: block;
      }

      .guides-user-library-view {
        max-width: none !important;
        gap: 0.85rem !important;
      }

      .guides-library-header {
        flex-direction: column !important;
        gap: 0.7rem !important;
        padding-bottom: 0.7rem !important;
      }

      .guides-library-header h2 {
        font-size: 1.45rem !important;
      }

      .guides-library-header p {
        font-size: 0.8rem !important;
        line-height: 1.4;
      }

      .guides-library-manager-actions {
        width: 100% !important;
        margin-left: 0 !important;
        justify-content: flex-start !important;
        overflow-x: auto;
        flex-wrap: nowrap !important;
        padding-bottom: 0.15rem;
        scrollbar-width: none;
      }

      .guides-library-manager-actions::-webkit-scrollbar {
        display: none;
      }

      .guides-library-action {
        flex: 0 0 auto;
        min-height: 40px;
      }

      .guides-library-toolbar {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0.55rem !important;
        padding: 0.65rem !important;
        border-radius: 14px !important;
      }

      .guides-library-search-wrap,
      .guides-library-type-filter {
        width: 100% !important;
        min-width: 0 !important;
      }

      .guides-library-search-wrap #guide-search-input,
      .guides-library-type-filter,
      #chat-input {
        font-size: 16px !important;
      }

      .guides-user-library-view .guides-library-section[data-library-type="documents"] {
        padding: 0 0.2rem 1rem !important;
      }

      .guides-user-library-view .guides-library-section[data-library-type="documents"] #guides-list {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 1rem 0.7rem !important;
      }

      .guide-document-thumbnail {
        height: 150px !important;
      }

      #guides-chat-view {
        min-height: 0 !important;
      }

      #chat-history {
        width: 100% !important;
        max-width: none !important;
        padding: 0.35rem 0 1rem !important;
        gap: 0.9rem !important;
      }

      #chat-history > [data-persisted-chat-message="true"] {
        max-width: 92% !important;
        padding: 0.8rem 0.9rem !important;
        font-size: 0.95rem !important;
      }

      #chat-greeting {
        margin-top: 1.25rem !important;
        margin-bottom: 1.25rem !important;
        padding-left: 0 !important;
      }

      #chat-greeting h1 {
        font-size: 2rem !important;
      }

      #chat-greeting p {
        font-size: 0.95rem !important;
        line-height: 1.45 !important;
      }

      #chat-greeting img {
        width: 58px !important;
        height: 58px !important;
      }

      #guides-chat-view > div:last-child {
        width: 100% !important;
        max-width: none !important;
      }

      .interactive-chat-embed {
        width: 100% !important;
        min-width: 0 !important;
        overflow: hidden;
      }

      .cp-grid,
      .cp-grid.collapsed {
        grid-template-columns: minmax(0, 1fr) !important;
        width: 100vw !important;
        height: 100dvh !important;
        min-height: 100dvh !important;
      }

      .cp-main {
        grid-column: 1 !important;
        width: 100vw !important;
        height: 100dvh !important;
        min-width: 0 !important;
      }

      .cp-sidebar {
        position: fixed !important;
        inset: 0 auto 0 0 !important;
        z-index: 250 !important;
        width: min(88vw, 340px) !important;
        max-width: 340px !important;
        height: 100dvh !important;
        padding: max(1.25rem, env(safe-area-inset-top)) 1.1rem max(1.25rem, env(safe-area-inset-bottom)) !important;
        box-sizing: border-box !important;
        transform: translateX(0);
        opacity: 1 !important;
        pointer-events: auto !important;
        box-shadow: 20px 0 50px rgba(0,0,0,0.55) !important;
      }

      .cp-grid.collapsed .cp-sidebar {
        transform: translateX(-105%) !important;
        opacity: 0 !important;
        pointer-events: none !important;
        padding: max(1.25rem, env(safe-area-inset-top)) 1.1rem max(1.25rem, env(safe-area-inset-bottom)) !important;
      }

      #sidebar-toggle {
        position: fixed !important;
        top: max(0.75rem, env(safe-area-inset-top)) !important;
        left: 0.75rem !important;
        width: 44px !important;
        height: 44px !important;
        z-index: 260 !important;
        background: rgba(0,0,0,0.72) !important;
      }

      .cp-grid:not(.collapsed) #sidebar-toggle {
        left: min(calc(88vw + 0.55rem), 350px) !important;
      }

      .cp-visuals-area {
        min-height: 0;
      }

      .reading-mode .cp-visuals-area {
        flex: 38 !important;
      }

      .reading-mode .cp-content-area {
        flex: 62 !important;
      }

      .cp-content-area {
        display: block !important;
        grid-template-columns: minmax(0, 1fr) !important;
        min-width: 0 !important;
        overflow-y: auto !important;
        overscroll-behavior: contain;
      }

      .cp-text-panel {
        width: 100% !important;
        min-width: 0 !important;
        padding: 1.2rem 1rem 2.5rem !important;
        box-sizing: border-box !important;
        border-right: 0 !important;
        mask-image: none !important;
        -webkit-mask-image: none !important;
        overflow: visible !important;
      }

      .cp-text-panel h1 {
        font-size: 1.7rem !important;
      }

      .cp-text-panel h2 {
        font-size: 1.4rem !important;
      }

      .cp-text-panel h3 {
        font-size: 1.2rem !important;
      }

      .cp-text-panel p,
      .cp-text-panel li {
        line-height: 1.55 !important;
      }

      .lesson-manager-controls,
      .interactive-sidebar {
        max-width: calc(100vw - 1.5rem) !important;
      }

      .activity-wrapper,
      .ai-component-container,
      .chart-container {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }

      .activity-wrapper.fullscreen {
        width: 100vw !important;
        height: 100dvh !important;
        padding: max(0.75rem, env(safe-area-inset-top)) 0.65rem max(0.75rem, env(safe-area-inset-bottom)) !important;
        box-sizing: border-box !important;
      }

      .glass input,
      .glass textarea,
      .glass select,
      input,
      textarea,
      select {
        max-width: 100%;
        box-sizing: border-box;
      }

      input,
      textarea,
      select {
        font-size: 16px;
      }
    }

    @media (max-width: 420px) {
      .fsw-main-header #logout-btn {
        font-size: 0 !important;
        width: 36px !important;
        height: 36px !important;
        padding: 0 !important;
      }

      .fsw-main-header #logout-btn::before {
        content: '↪';
        font-size: 1rem;
      }

      .guides-user-library-view .guides-library-section[data-library-type="documents"] #guides-list {
        grid-template-columns: minmax(0, 1fr) !important;
      }

      .guide-document-thumbnail {
        height: 205px !important;
      }
    }
  `;

  document.head.appendChild(style);
};

const markMainShell = () => {
  const header = document.querySelector('#app > header');
  if (!header) return;

  header.classList.add('fsw-main-header');
  header.children[0]?.classList.add('fsw-header-brand');
  header.children[0]?.children[1]?.classList.add('fsw-header-brand-copy');
  header.children[1]?.classList.add('fsw-header-actions');
  document.querySelector('#admin-view-toggle')?.parentElement?.classList.add('fsw-admin-view-toggle');
};

const markPrimaryTabs = () => {
  const candidateIds = [
    '#tab-user-courses',
    '#tab-courses',
    '#tab-guides',
    '#tab-team',
    '#tab-feedback'
  ];

  candidateIds.forEach(selector => {
    document.querySelector(selector)?.parentElement?.classList.add('fsw-primary-tabs');
  });
};

const closeGuidesDrawer = container => {
  container?.classList.remove('guides-mobile-drawer-open');
  const button = container?.querySelector('.fsw-mobile-guides-toggle');
  button?.setAttribute('aria-expanded', 'false');
};

const enhanceGuidesWorkspace = () => {
  document.querySelectorAll('.guides-container.guides-workspace-ready').forEach(container => {
    if (container.dataset.mobileExperienceReady === 'true') return;
    const sidebar = container.querySelector('.guides-workspace-sidebar');
    if (!sidebar) return;

    container.dataset.mobileExperienceReady = 'true';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'fsw-mobile-guides-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span aria-hidden="true">☰</span><span>Guides menu</span>';

    const backdrop = document.createElement('div');
    backdrop.className = 'fsw-mobile-guides-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    toggle.addEventListener('click', () => {
      const open = !container.classList.contains('guides-mobile-drawer-open');
      container.classList.toggle('guides-mobile-drawer-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    backdrop.addEventListener('click', () => closeGuidesDrawer(container));
    sidebar.addEventListener('click', event => {
      if (event.target.closest('button')) {
        window.setTimeout(() => closeGuidesDrawer(container), 0);
      }
    });

    container.prepend(backdrop);
    container.prepend(toggle);
  });
};

export const syncMobileExperience = () => {
  ensureStyles();
  markMainShell();
  markPrimaryTabs();
  enhanceGuidesWorkspace();
};

export const initMobileExperienceEnhancement = root => {
  ensureStyles();
  let destroyed = false;
  let queued = false;

  const sync = () => {
    if (!destroyed) syncMobileExperience();
  };

  const schedule = () => {
    if (queued || destroyed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  };

  const observerTarget = root || document.body;
  const observer = new MutationObserver(schedule);
  observer.observe(observerTarget, { childList: true, subtree: true });
  sync();

  return () => {
    destroyed = true;
    observer.disconnect();
    document.querySelectorAll('.guides-container.guides-mobile-drawer-open').forEach(closeGuidesDrawer);
  };
};
