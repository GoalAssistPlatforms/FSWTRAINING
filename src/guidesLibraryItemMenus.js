const STYLE_ID = 'guides-library-item-menus-styles';

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .guide-library-menu-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .guide-library-menu-trigger {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      background: rgba(10,15,26,0.76);
      color: #c5ccd6;
      cursor: pointer;
      font: inherit;
      font-size: 1rem;
      line-height: 1;
      letter-spacing: 1px;
      backdrop-filter: blur(8px);
    }

    .guide-library-menu-trigger:hover,
    .guide-library-menu-trigger[aria-expanded="true"] {
      background: rgba(255,255,255,0.09);
      color: white;
      border-color: rgba(255,255,255,0.16);
    }

    .guide-library-item-menu {
      position: absolute;
      z-index: 120;
      top: calc(100% + 5px);
      right: 0;
      min-width: 128px;
      display: none;
      flex-direction: column;
      padding: 0.3rem;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 9px;
      background: rgba(17,24,39,0.98);
      box-shadow: 0 12px 28px rgba(0,0,0,0.4);
      backdrop-filter: blur(14px);
    }

    .guide-library-item-menu.open {
      display: flex;
    }

    .guide-library-item-menu button {
      width: 100%;
      padding: 0.55rem 0.65rem;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #e5e7eb;
      font: inherit;
      font-size: 0.78rem;
      text-align: left;
      cursor: pointer;
    }

    .guide-library-item-menu button:hover {
      background: rgba(255,255,255,0.07);
    }

    .guide-library-item-menu .delete-guide-btn {
      color: #fca5a5 !important;
      background: transparent !important;
      border: 0 !important;
      padding: 0.55rem 0.65rem !important;
      border-radius: 6px !important;
      font-size: 0.78rem !important;
    }

    .guide-library-item-menu .delete-guide-btn:hover {
      background: rgba(239,68,68,0.08) !important;
      color: #fecaca !important;
    }
  `;
  document.head.appendChild(style);
};

const closeAllMenus = root => {
  root.querySelectorAll('.guide-library-item-menu.open').forEach(menu => menu.classList.remove('open'));
  root.querySelectorAll('.guide-library-menu-trigger[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
};

const waitForEditButton = (root, id, timeoutMs = 5000) => new Promise(resolve => {
  const existing = root.querySelector(`.edit-curation-btn[data-id="${CSS.escape(String(id))}"]`);
  if (existing) {
    resolve(existing);
    return;
  }

  const manager = root.querySelector('#guides-manager-view');
  if (!manager) {
    resolve(null);
    return;
  }

  const observer = new MutationObserver(() => {
    const button = root.querySelector(`.edit-curation-btn[data-id="${CSS.escape(String(id))}"]`);
    if (!button) return;
    observer.disconnect();
    clearTimeout(timeout);
    resolve(button);
  });

  observer.observe(manager, { childList: true, subtree: true });
  const timeout = setTimeout(() => {
    observer.disconnect();
    resolve(null);
  }, timeoutMs);
});

const returnToLibraryWhenEditCloses = root => {
  const modal = root.querySelector('#edit-curation-modal');
  const back = root.querySelector('#close-manager-view-btn');
  if (!modal || !back) return;

  let seenOpen = modal.style.display !== 'none';
  const observer = new MutationObserver(() => {
    const open = modal.style.display !== 'none' && getComputedStyle(modal).display !== 'none';
    if (open) {
      seenOpen = true;
      return;
    }
    if (!seenOpen) return;
    observer.disconnect();
    requestAnimationFrame(() => back.click());
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
};

const openEdit = async (root, id) => {
  const manageButton = root.querySelector('#manage-content-btn');
  if (!manageButton) return;

  const buttonPromise = waitForEditButton(root, id);
  manageButton.click();
  const editButton = await buttonPromise;
  if (!editButton) {
    root.querySelector('#close-manager-view-btn')?.click();
    return;
  }

  editButton.click();
  returnToLibraryWhenEditCloses(root);
};

const enhanceDeleteButton = (root, deleteButton) => {
  if (!deleteButton || deleteButton.dataset.libraryMenuEnhanced === 'true') return;
  const parent = deleteButton.parentElement;
  if (!parent) return;

  deleteButton.dataset.libraryMenuEnhanced = 'true';
  const id = deleteButton.dataset.id;

  const wrap = document.createElement('div');
  wrap.className = 'guide-library-menu-wrap';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'guide-library-menu-trigger';
  trigger.setAttribute('aria-label', 'More options');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.textContent = '•••';

  const menu = document.createElement('div');
  menu.className = 'guide-library-item-menu';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = 'Edit';
  edit.addEventListener('click', event => {
    event.stopPropagation();
    closeAllMenus(root);
    openEdit(root, id);
  });

  deleteButton.removeAttribute('style');
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => closeAllMenus(root));

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    const shouldOpen = !menu.classList.contains('open');
    closeAllMenus(root);
    if (shouldOpen) {
      menu.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  menu.addEventListener('click', event => event.stopPropagation());
  parent.replaceChild(wrap, deleteButton);
  menu.append(edit, deleteButton);
  wrap.append(trigger, menu);
};

export const initGuidesLibraryItemMenus = root => {
  if (!root) return () => {};
  ensureStyles();

  let destroyed = false;
  let queued = false;

  const sync = () => {
    if (destroyed) return;

    root.querySelectorAll('#guides-user-library-view .delete-guide-btn').forEach(button => enhanceDeleteButton(root, button));
    root.querySelector('#guides-user-library-view [data-action="reviews"]')?.remove();
  };

  const schedule = () => {
    if (queued || destroyed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  };

  const clickAway = event => {
    if (!event.target.closest('.guide-library-menu-wrap')) closeAllMenus(root);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  document.addEventListener('click', clickAway);
  sync();

  return () => {
    destroyed = true;
    observer.disconnect();
    document.removeEventListener('click', clickAway);
  };
};
