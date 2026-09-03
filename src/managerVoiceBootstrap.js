import { initManagerVoiceWorkspace } from './managerVoiceWorkspace.js';

export function initManagerVoiceBootstrap(root = document.body) {
  if (!root || typeof MutationObserver === 'undefined') return () => {};

  let activeCoursesTab = null;
  let cleanupWorkspace = null;
  let queued = false;
  let destroyed = false;

  const sync = () => {
    if (destroyed) return;
    const coursesTab = root.querySelector?.('#tab-courses') || null;
    if (coursesTab === activeCoursesTab) return;

    cleanupWorkspace?.();
    cleanupWorkspace = null;
    activeCoursesTab = coursesTab;

    if (coursesTab) {
      const main = coursesTab.closest('main') || root.querySelector?.('main') || root;
      cleanupWorkspace = initManagerVoiceWorkspace(main);
    }
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
    cleanupWorkspace?.();
    cleanupWorkspace = null;
    activeCoursesTab = null;
  };
}
