import { renameChatConversation } from './api/chatHistory.js';
import { fswAlert } from './utils/dialog';

const STYLE_ID = 'guides-chat-menus-styles';

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const icon = name => {
  if (name === 'pin') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 17 5 5"></path><path d="m9 14 6-6"></path><path d="m5 10 9-9 5 5-9 9"></path><path d="m2 21 5-5"></path></svg>';
  if (name === 'folder') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"></path></svg>';
  if (name === 'edit') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>';
  if (name === 'delete') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6 18 21H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>';
  return '';
};

export const chatMenuLabels = pinned => [
  pinned ? 'Unpin chat' : 'Pin chat',
  'Move to project',
  'Rename chat',
  'Delete chat'
];

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .guides-chat-menus-ready .guides-chat-org-actions,
    .guides-chat-menus-ready .guides-chat-project-actions {
      opacity: 1 !important;
    }

    .guides-chat-menus-ready .guides-chat-org-actions > button:not(.guides-chat-menu-trigger),
    .guides-chat-menus-ready .guides-chat-project-actions > button:not(.guides-chat-menu-trigger) {
      display: none !important;
    }

    .guides-chat-menu-trigger {
      width: 30px !important;
      height: 30px !important;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 8px !important;
      background: transparent !important;
      color: #a5adba !important;
      font: inherit !important;
      font-size: 1.15rem !important;
      font-weight: 700 !important;
      letter-spacing: 0.08em;
      cursor: pointer;
      line-height: 1;
    }

    .guides-chat-menu-trigger:hover,
    .guides-chat-menu-trigger[aria-expanded="true"] {
      background: rgba(255,255,255,0.08) !important;
      color: #f8fafc !important;
    }

    .guides-chat-action-menu {
      position: fixed;
      z-index: 13000;
      width: 220px;
      padding: 0.42rem;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 13px;
      background: #111827;
      box-shadow: 0 18px 50px rgba(0,0,0,0.5);
      box-sizing: border-box;
    }

    .guides-chat-action-menu button {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 0.65rem 0.68rem;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: #e5e7eb;
      font: inherit;
      font-size: 0.82rem;
      text-align: left;
      cursor: pointer;
    }

    .guides-chat-action-menu button:hover {
      background: rgba(255,255,255,0.07);
    }

    .guides-chat-action-menu button.danger {
      color: #f87171;
    }

    .guides-chat-action-menu svg {
      width: 18px;
      height: 18px;
      flex: 0 0 18px;
    }

    .guides-chat-action-menu-divider {
      height: 1px;
      margin: 0.35rem 0;
      background: rgba(255,255,255,0.08);
    }

    .guides-chat-rename-backdrop,
    .guides-project-delete-backdrop {
      position: fixed;
      inset: 0;
      z-index: 14000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
      background: rgba(2, 6, 14, 0.68);
      backdrop-filter: blur(5px);
    }

    .guides-chat-rename-dialog,
    .guides-project-delete-dialog {
      width: min(460px, calc(100vw - 2rem));
      padding: 1.35rem;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      background: #111827;
      box-shadow: 0 24px 70px rgba(0,0,0,0.55);
      box-sizing: border-box;
    }

    .guides-chat-rename-dialog h3,
    .guides-project-delete-dialog h3 {
      margin: 0;
      color: #f8fafc;
      font-size: 1.08rem;
      font-weight: 700;
    }

    .guides-chat-rename-dialog p,
    .guides-project-delete-dialog p {
      margin: 0.38rem 0 1rem;
      color: #8b95a5;
      font-size: 0.8rem;
      line-height: 1.45;
    }

    .guides-chat-rename-dialog input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.82rem 0.88rem;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 10px;
      background: #0a101c;
      color: white;
      font: inherit;
      font-size: 0.9rem;
      outline: none;
    }

    .guides-chat-rename-dialog input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
    }

    .guides-chat-rename-actions,
    .guides-project-delete-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.55rem;
      margin-top: 1rem;
    }

    .guides-chat-rename-actions button,
    .guides-project-delete-actions button {
      min-width: 82px;
      padding: 0.62rem 0.95rem;
      border-radius: 9px;
      border: 1px solid rgba(255,255,255,0.12);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 650;
      cursor: pointer;
    }

    .guides-chat-rename-cancel,
    .guides-project-delete-cancel {
      background: transparent;
      color: #cbd5e1;
    }

    .guides-chat-rename-cancel:hover,
    .guides-project-delete-cancel:hover {
      background: rgba(255,255,255,0.06);
    }

    .guides-chat-rename-save {
      background: var(--primary);
      border-color: var(--primary) !important;
      color: white;
    }

    .guides-project-delete-heading {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
    }

    .guides-project-delete-icon {
      width: 38px;
      height: 38px;
      flex: 0 0 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
    }

    .guides-project-delete-icon svg {
      width: 20px;
      height: 20px;
    }

    .guides-project-delete-copy {
      min-width: 0;
      flex: 1;
    }

    .guides-project-delete-copy p {
      margin-bottom: 0;
    }

    .guides-project-delete-name {
      color: #f8fafc;
      font-weight: 650;
    }

    .guides-project-delete-note {
      margin-top: 1rem;
      padding: 0.8rem 0.9rem;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      background: rgba(255,255,255,0.035);
      color: #aab3c0;
      font-size: 0.78rem;
      line-height: 1.5;
    }

    .guides-project-delete-confirm {
      background: #dc2626;
      border-color: #dc2626 !important;
      color: white;
    }

    .guides-project-delete-confirm:hover {
      background: #ef4444;
      border-color: #ef4444 !important;
    }
  `;
  document.head.appendChild(style);
};

const showRenameDialog = currentTitle => new Promise(resolve => {
  const backdrop = document.createElement('div');
  backdrop.className = 'guides-chat-rename-backdrop';
  backdrop.innerHTML = `
    <form class="guides-chat-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="guides-chat-rename-title">
      <h3 id="guides-chat-rename-title">Rename chat</h3>
      <p>Choose a short name that makes this conversation easy to find later.</p>
      <input type="text" maxlength="72" autocomplete="off" value="${escapeHtml(currentTitle)}" aria-label="Chat name">
      <div class="guides-chat-rename-actions">
        <button type="button" class="guides-chat-rename-cancel">Cancel</button>
        <button type="submit" class="guides-chat-rename-save">Save</button>
      </div>
    </form>`;

  document.body.appendChild(backdrop);
  const form = backdrop.querySelector('form');
  const input = backdrop.querySelector('input');
  let settled = false;

  const finish = result => {
    if (settled) return;
    settled = true;
    document.removeEventListener('keydown', onKeyDown, true);
    backdrop.remove();
    resolve(result);
  };

  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(null);
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  backdrop.querySelector('.guides-chat-rename-cancel').addEventListener('click', () => finish(null));
  backdrop.addEventListener('pointerdown', event => {
    if (event.target === backdrop) finish(null);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = input.value.replace(/\s+/g, ' ').trim();
    if (!title) {
      input.focus();
      return;
    }
    finish(title);
  });

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
});

const showProjectDeleteDialog = projectName => new Promise(resolve => {
  const backdrop = document.createElement('div');
  backdrop.className = 'guides-project-delete-backdrop';
  backdrop.innerHTML = `
    <div class="guides-project-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="guides-project-delete-title">
      <div class="guides-project-delete-heading">
        <div class="guides-project-delete-icon">${icon('delete')}</div>
        <div class="guides-project-delete-copy">
          <h3 id="guides-project-delete-title">Delete project?</h3>
          <p>Are you sure you want to delete <span class="guides-project-delete-name">${escapeHtml(projectName)}</span>?</p>
        </div>
      </div>
      <div class="guides-project-delete-note">Chats in this project will move back to Chats. No conversations will be deleted.</div>
      <div class="guides-project-delete-actions">
        <button type="button" class="guides-project-delete-cancel">Cancel</button>
        <button type="button" class="guides-project-delete-confirm">Delete project</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  let settled = false;

  const finish = result => {
    if (settled) return;
    settled = true;
    document.removeEventListener('keydown', onKeyDown, true);
    backdrop.remove();
    resolve(result);
  };

  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  backdrop.querySelector('.guides-project-delete-cancel').addEventListener('click', () => finish(false));
  backdrop.querySelector('.guides-project-delete-confirm').addEventListener('click', () => finish(true));
  backdrop.addEventListener('pointerdown', event => {
    if (event.target === backdrop) finish(false);
  });

  requestAnimationFrame(() => backdrop.querySelector('.guides-project-delete-cancel')?.focus());
});

export const initGuidesChatMenus = root => {
  ensureStyles();

  let destroyed = false;
  let observer = null;
  let menu = null;
  let menuTrigger = null;
  let outsideHandler = null;
  let keyHandler = null;

  const closeMenu = () => {
    if (menuTrigger) menuTrigger.setAttribute('aria-expanded', 'false');
    menu?.remove();
    menu = null;
    menuTrigger = null;
    if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler, true);
    if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
    outsideHandler = null;
    keyHandler = null;
  };

  const positionMenu = trigger => {
    const rect = trigger.getBoundingClientRect();
    const width = 220;
    const menuHeight = menu?.offsetHeight || 220;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const preferredTop = rect.bottom + 6;
    const top = preferredTop + menuHeight <= window.innerHeight - 8
      ? preferredTop
      : Math.max(8, rect.top - menuHeight - 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  };

  const wireOutsideClose = trigger => {
    outsideHandler = event => {
      if (!menu?.contains(event.target) && event.target !== trigger) closeMenu();
    };
    keyHandler = event => {
      if (event.key === 'Escape') closeMenu();
    };
    setTimeout(() => {
      document.addEventListener('pointerdown', outsideHandler, true);
      document.addEventListener('keydown', keyHandler, true);
    }, 0);
  };

  const showChatMenu = (trigger, row) => {
    closeMenu();
    const chatId = row.dataset.chatId;
    const pinButton = row.querySelector('.chat-pin');
    const pinned = pinButton?.classList.contains('active');

    menu = document.createElement('div');
    menu.className = 'guides-chat-action-menu';
    menu.innerHTML = `
      <button type="button" data-chat-action="pin">${icon('pin')}<span>${pinned ? 'Unpin chat' : 'Pin chat'}</span></button>
      <button type="button" data-chat-action="move">${icon('folder')}<span>Move to project</span></button>
      <button type="button" data-chat-action="rename">${icon('edit')}<span>Rename chat</span></button>
      <div class="guides-chat-action-menu-divider"></div>
      <button type="button" class="danger" data-chat-action="delete">${icon('delete')}<span>Delete chat</span></button>`;

    document.body.appendChild(menu);
    menuTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    positionMenu(trigger);
    wireOutsideClose(trigger);

    menu.addEventListener('click', async event => {
      const actionButton = event.target.closest('[data-chat-action]');
      if (!actionButton) return;
      const action = actionButton.dataset.chatAction;

      if (action === 'pin') {
        closeMenu();
        pinButton?.click();
        return;
      }

      if (action === 'move') {
        const moveButton = row.querySelector('.chat-move');
        const anchorRect = trigger.getBoundingClientRect();
        closeMenu();
        if (moveButton) {
          moveButton.style.position = 'fixed';
          moveButton.style.left = `${anchorRect.left}px`;
          moveButton.style.top = `${anchorRect.top}px`;
          moveButton.click();
          requestAnimationFrame(() => {
            moveButton.style.position = '';
            moveButton.style.left = '';
            moveButton.style.top = '';
          });
        }
        return;
      }

      if (action === 'rename') {
        const currentTitle = row.querySelector('.guides-chat-org-title')?.textContent?.trim() || 'New chat';
        closeMenu();
        const nextTitle = await showRenameDialog(currentTitle);
        if (!nextTitle || nextTitle === currentTitle) return;
        try {
          await renameChatConversation(chatId, nextTitle);
          const sourceRow = root.querySelector(`.guides-workspace-chat-item[data-id="${CSS.escape(chatId)}"]`);
          const sourceTitle = sourceRow?.querySelector('.guides-workspace-chat-title');
          if (sourceTitle) sourceTitle.textContent = nextTitle;
          const sourceRename = sourceRow?.querySelector('.guides-workspace-chat-rename');
          if (sourceRename) sourceRename.dataset.title = nextTitle;
          const visibleTitle = row.querySelector('.guides-chat-org-title');
          if (visibleTitle) visibleTitle.textContent = nextTitle;
        } catch (error) {
          console.error('Unable to rename chat:', error);
          await fswAlert('This chat could not be renamed.');
        }
        return;
      }

      if (action === 'delete') {
        closeMenu();
        row.querySelector('.chat-delete')?.click();
      }
    });
  };

  const showProjectMenu = (trigger, heading) => {
    closeMenu();
    const projectId = heading.closest('[data-project-id]')?.dataset.projectId;
    const projectName = heading.querySelector('.guides-chat-project-name')?.textContent?.trim() || 'this project';
    const renameButton = heading.querySelector('.project-rename');
    const deleteButton = heading.querySelector('.project-delete');

    menu = document.createElement('div');
    menu.className = 'guides-chat-action-menu';
    menu.innerHTML = `
      <button type="button" data-project-action="rename">${icon('edit')}<span>Rename project</span></button>
      <div class="guides-chat-action-menu-divider"></div>
      <button type="button" class="danger" data-project-action="delete">${icon('delete')}<span>Delete project</span></button>`;

    document.body.appendChild(menu);
    menuTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    positionMenu(trigger);
    wireOutsideClose(trigger);

    menu.addEventListener('click', async event => {
      const actionButton = event.target.closest('[data-project-action]');
      if (!actionButton || !projectId) return;
      const action = actionButton.dataset.projectAction;
      closeMenu();

      if (action === 'rename') {
        renameButton?.click();
        return;
      }

      if (action === 'delete') {
        const confirmed = await showProjectDeleteDialog(projectName);
        if (!confirmed || !deleteButton) return;

        const originalConfirm = window.confirm;
        window.confirm = () => true;
        try {
          deleteButton.click();
        } finally {
          window.confirm = originalConfirm;
        }
      }
    });
  };

  const enhance = () => {
    if (destroyed) return;
    const sidebar = root?.querySelector?.('.guides-workspace-sidebar');
    const organisedList = sidebar?.querySelector?.('.guides-chat-organised-list');
    if (!sidebar || !organisedList) return;

    sidebar.classList.add('guides-chat-menus-ready');

    organisedList.querySelectorAll('.guides-chat-org-row').forEach(row => {
      const actions = row.querySelector('.guides-chat-org-actions');
      if (!actions || actions.querySelector('.guides-chat-menu-trigger')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'guides-chat-menu-trigger';
      button.setAttribute('aria-label', 'Chat options');
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      button.title = 'Chat options';
      button.textContent = '⋯';
      actions.appendChild(button);
    });

    organisedList.querySelectorAll('.guides-chat-project-heading').forEach(heading => {
      const actions = heading.querySelector('.guides-chat-project-actions');
      if (!actions || actions.querySelector('.guides-chat-menu-trigger')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'guides-chat-menu-trigger';
      button.setAttribute('aria-label', 'Project options');
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      button.title = 'Project options';
      button.textContent = '⋯';
      actions.appendChild(button);
    });
  };

  const onClick = event => {
    const trigger = event.target.closest('.guides-chat-menu-trigger');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();

    const row = trigger.closest('.guides-chat-org-row');
    if (row) {
      showChatMenu(trigger, row);
      return;
    }

    const heading = trigger.closest('.guides-chat-project-heading');
    if (heading) showProjectMenu(trigger, heading);
  };

  root.addEventListener('click', onClick);
  enhance();
  observer = new MutationObserver(enhance);
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    destroyed = true;
    observer?.disconnect();
    closeMenu();
    root.removeEventListener('click', onClick);
    document.querySelector('.guides-chat-rename-backdrop')?.remove();
    document.querySelector('.guides-project-delete-backdrop')?.remove();
    root.querySelector('.guides-workspace-sidebar')?.classList.remove('guides-chat-menus-ready');
  };
};
