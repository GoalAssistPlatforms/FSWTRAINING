const STYLE_ID = 'guides-library-navigation-fix-styles';

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .guides-workspace-library-top {
      flex: 0 0 auto !important;
      margin: 0 0 0.2rem !important;
    }

    .guides-workspace-library-top.active {
      background: rgba(255,255,255,0.065) !important;
      border-color: rgba(255,255,255,0.07) !important;
    }

    .guides-workspace-sidebar-footer:empty {
      display: none !important;
    }

    .guides-container.guides-workspace-ready > div:last-child {
      height: 100% !important;
      max-height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
      box-sizing: border-box;
    }

    .guides-workspace-ready #guides-manager-view {
      height: 100% !important;
      max-height: 100% !important;
      min-height: 0 !important;
      display: flex;
      flex-direction: column !important;
      overflow: hidden !important;
      box-sizing: border-box;
    }

    .guides-workspace-ready #guides-manager-view > * {
      flex: 0 0 auto;
    }

    .guides-workspace-ready #guides-manager-view #curation-items-list {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    .guides-workspace-ready #guides-user-library-view {
      height: 100% !important;
      max-height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
      box-sizing: border-box;
    }

    .guides-workspace-ready #guides-user-library-view .guides-library-sections {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
  `;
  document.head.appendChild(style);
};

export const initGuidesLibraryNavigationFix = root => {
  ensureStyles();

  let destroyed = false;
  let queued = false;

  const syncBuildGuideControl = () => {
    const visibleBuildGuide = root?.querySelector?.('.guides-library-action[data-action="guide"]');
    const originalBuildGuide = root?.querySelector?.('[data-legacy-guides-sidebar="true"] #create-interactive-guide-btn');

    if (!visibleBuildGuide || !originalBuildGuide || visibleBuildGuide === originalBuildGuide) return;

    originalBuildGuide.className = 'guides-library-action';
    originalBuildGuide.dataset.action = 'guide';
    originalBuildGuide.removeAttribute('style');
    originalBuildGuide.setAttribute('role', 'button');
    originalBuildGuide.setAttribute('tabindex', '0');
    originalBuildGuide.innerHTML = '▣ Build Guide';

    originalBuildGuide.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      originalBuildGuide.click();
    });

    visibleBuildGuide.replaceWith(originalBuildGuide);
  };

  const sync = () => {
    if (destroyed) return;

    const sidebar = root?.querySelector?.('.guides-workspace-sidebar');
    const library = sidebar?.querySelector?.('#guides-workspace-library');
    const newChat = sidebar?.querySelector?.('#guides-workspace-new-chat');
    if (!sidebar || !library || !newChat) return;

    library.classList.add('guides-workspace-library-top');
    if (library.nextElementSibling !== newChat) sidebar.insertBefore(library, newChat);

    const footer = sidebar.querySelector('.guides-workspace-sidebar-footer');
    if (footer && footer.children.length === 0) footer.remove();

    syncBuildGuideControl();
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
