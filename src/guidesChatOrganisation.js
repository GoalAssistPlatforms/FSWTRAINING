import { getCurrentUser } from './api/auth.js';

const STYLE_ID = 'guides-chat-organisation-styles';
const STORAGE_PREFIX = 'fsw_guides_chat_organisation_v1_';

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const normaliseState = raw => ({
  projects: Array.isArray(raw?.projects) ? raw.projects.filter(p => p?.id && p?.name) : [],
  chats: raw?.chats && typeof raw.chats === 'object' ? raw.chats : {}
});

export const organiseChats = (items, state) => {
  const safeState = normaliseState(state);
  const pinned = [];
  const unfiled = [];
  const byProject = new Map(safeState.projects.map(project => [project.id, []]));

  items.forEach(item => {
    const meta = safeState.chats[item.id] || {};
    if (meta.pinned) {
      pinned.push(item);
      return;
    }
    if (meta.projectId && byProject.has(meta.projectId)) {
      byProject.get(meta.projectId).push(item);
      return;
    }
    unfiled.push(item);
  });

  return { pinned, unfiled, byProject, projects: safeState.projects };
};

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .guides-workspace-ready #guides-manager-view h2 + p,
    .guides-user-library-view .guides-library-header p {
      display: none !important;
    }

    .guides-chat-organised-list {
      min-height: 0;
      flex: 1;
      overflow-y: auto;
      padding-right: 0.15rem;
      scrollbar-width: thin;
    }

    .guides-chat-org-section {
      margin-bottom: 0.6rem;
    }

    .guides-chat-org-heading,
    .guides-chat-project-heading {
      min-height: 30px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
      padding: 0.35rem 0.65rem;
      color: #7f8896;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.055em;
      text-transform: uppercase;
      box-sizing: border-box;
    }

    .guides-chat-org-heading button,
    .guides-chat-project-heading button {
      border: 0;
      background: transparent;
      color: #808996;
      cursor: pointer;
      border-radius: 6px;
      padding: 0.2rem 0.35rem;
      line-height: 1;
    }

    .guides-chat-org-heading button:hover,
    .guides-chat-project-heading button:hover {
      background: rgba(255,255,255,0.07);
      color: white;
    }

    .guides-chat-project-title {
      min-width: 0;
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      border: 0;
      background: transparent;
      color: #9ca4af !important;
      padding: 0 !important;
      text-align: left;
      font: inherit;
      font-size: inherit;
      font-weight: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      cursor: pointer;
      overflow: hidden;
    }

    .guides-chat-project-title span:last-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .guides-chat-project-actions {
      display: flex;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .guides-chat-project-heading:hover .guides-chat-project-actions,
    .guides-chat-project-heading:focus-within .guides-chat-project-actions {
      opacity: 1;
    }

    .guides-chat-org-row {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      border-radius: 9px;
      margin: 0.08rem 0;
      background: transparent;
    }

    .guides-chat-org-row:hover,
    .guides-chat-org-row.active {
      background: rgba(255,255,255,0.055);
    }

    .guides-chat-org-open {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
      padding: 0.58rem 0.65rem;
      border: 0;
      background: transparent;
      color: #e5e7eb;
      text-align: left;
      cursor: pointer;
    }

    .guides-chat-org-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.81rem;
      font-weight: 500;
    }

    .guides-chat-org-date {
      color: #727b89;
      font-size: 0.66rem;
    }

    .guides-chat-org-actions {
      display: flex;
      align-items: center;
      opacity: 0;
      transition: opacity 0.15s;
      padding-right: 0.2rem;
    }

    .guides-chat-org-row:hover .guides-chat-org-actions,
    .guides-chat-org-row:focus-within .guides-chat-org-actions {
      opacity: 1;
    }

    .guides-chat-org-actions button {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #8d96a3;
      cursor: pointer;
      font-size: 0.78rem;
      padding: 0;
    }

    .guides-chat-org-actions button:hover,
    .guides-chat-org-actions button.active {
      background: rgba(255,255,255,0.08);
      color: white;
    }

    .guides-chat-org-actions .chat-pin.active {
      color: #fbbf24;
    }

    .guides-chat-org-empty {
      padding: 0.45rem 0.65rem 0.7rem;
      color: #626b78;
      font-size: 0.73rem;
    }

    .guides-chat-project-menu {
      position: fixed;
      z-index: 10000;
      width: 205px;
      max-height: 280px;
      overflow-y: auto;
      padding: 0.4rem;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      background: #111827;
      box-shadow: 0 16px 40px rgba(0,0,0,0.45);
    }

    .guides-chat-project-menu button {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.55rem;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #e5e7eb;
      padding: 0.55rem 0.6rem;
      text-align: left;
      font: inherit;
      font-size: 0.78rem;
      cursor: pointer;
    }

    .guides-chat-project-menu button:hover {
      background: rgba(255,255,255,0.07);
    }

    .guides-chat-project-menu .project-menu-divider {
      height: 1px;
      margin: 0.3rem 0;
      background: rgba(255,255,255,0.08);
    }
  `;
  document.head.appendChild(style);
};

const projectId = () => `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const initGuidesChatOrganisation = root => {
  ensureStyles();
  let destroyed = false;
  let sourceObserver = null;
  let outsideHandler = null;
  let menu = null;
  let organisationRoot = null;
  let sourceList = null;
  let state = normaliseState(null);
  let storageKey = null;

  const closeMenu = () => {
    menu?.remove();
    menu = null;
    if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  };

  const save = () => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (error) { console.warn('Unable to save chat organisation:', error); }
  };

  const load = () => {
    if (!storageKey) return normaliseState(null);
    try { return normaliseState(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch (error) { return normaliseState(null); }
  };

  const sourceItems = () => Array.from(sourceList?.querySelectorAll('.guides-workspace-chat-item') || []).map(row => ({
    id: row.dataset.id || '',
    title: row.querySelector('.guides-workspace-chat-title')?.textContent?.trim() || 'New chat',
    date: row.querySelector('.guides-workspace-chat-date')?.textContent?.trim() || '',
    active: row.classList.contains('active')
  })).filter(item => item.id);

  const renderRow = item => {
    const meta = state.chats[item.id] || {};
    return `
      <div class="guides-chat-org-row${item.active ? ' active' : ''}" data-chat-id="${escapeHtml(item.id)}">
        <button type="button" class="guides-chat-org-open" data-chat-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title)}">
          <span class="guides-chat-org-title">${escapeHtml(item.title)}</span>
          ${item.date ? `<span class="guides-chat-org-date">${escapeHtml(item.date)}</span>` : ''}
        </button>
        <div class="guides-chat-org-actions">
          <button type="button" class="chat-pin${meta.pinned ? ' active' : ''}" data-chat-id="${escapeHtml(item.id)}" title="${meta.pinned ? 'Unpin' : 'Pin to top'}" aria-label="${meta.pinned ? 'Unpin chat' : 'Pin chat'}">📌</button>
          <button type="button" class="chat-move" data-chat-id="${escapeHtml(item.id)}" title="Move to project" aria-label="Move chat to project">▣</button>
          <button type="button" class="chat-more" data-chat-id="${escapeHtml(item.id)}" title="Rename chat" aria-label="Rename chat">✎</button>
          <button type="button" class="chat-delete" data-chat-id="${escapeHtml(item.id)}" title="Delete chat" aria-label="Delete chat">×</button>
        </div>
      </div>`;
  };

  const render = () => {
    if (!organisationRoot) return;
    const grouped = organiseChats(sourceItems(), state);
    const sections = [];

    if (grouped.pinned.length) {
      sections.push(`<section class="guides-chat-org-section"><div class="guides-chat-org-heading"><span>Pinned</span></div>${grouped.pinned.map(renderRow).join('')}</section>`);
    }

    const projectsHtml = grouped.projects.map(project => {
      const chats = grouped.byProject.get(project.id) || [];
      const collapsed = Boolean(project.collapsed);
      return `
        <section class="guides-chat-org-section" data-project-id="${escapeHtml(project.id)}">
          <div class="guides-chat-project-heading">
            <button type="button" class="guides-chat-project-title" data-project-id="${escapeHtml(project.id)}" aria-expanded="${collapsed ? 'false' : 'true'}">
              <span>${collapsed ? '›' : '⌄'}</span><span>${escapeHtml(project.name)}</span>
            </button>
            <div class="guides-chat-project-actions">
              <button type="button" class="project-rename" data-project-id="${escapeHtml(project.id)}" title="Rename project">✎</button>
              <button type="button" class="project-delete" data-project-id="${escapeHtml(project.id)}" title="Delete project">×</button>
            </div>
          </div>
          ${collapsed ? '' : (chats.length ? chats.map(renderRow).join('') : '<div class="guides-chat-org-empty">No chats in this project.</div>')}
        </section>`;
    }).join('');

    sections.push(`
      <section class="guides-chat-org-section">
        <div class="guides-chat-org-heading">
          <span>Projects</span>
          <button type="button" id="guides-chat-new-project" title="New project" aria-label="Create project">+</button>
        </div>
        ${projectsHtml || '<div class="guides-chat-org-empty">Create a project to organise related chats.</div>'}
      </section>`);

    sections.push(`<section class="guides-chat-org-section"><div class="guides-chat-org-heading"><span>Chats</span></div>${grouped.unfiled.length ? grouped.unfiled.map(renderRow).join('') : '<div class="guides-chat-org-empty">No unfiled chats.</div>'}</section>`);
    organisationRoot.innerHTML = sections.join('');
  };

  const createProject = () => {
    const name = window.prompt('Project name');
    if (!name?.trim()) return null;
    const project = { id: projectId(), name: name.trim(), collapsed: false };
    state.projects.push(project);
    save();
    render();
    return project;
  };

  const showProjectMenu = (button, chatId) => {
    closeMenu();
    menu = document.createElement('div');
    menu.className = 'guides-chat-project-menu';
    menu.innerHTML = `
      <button type="button" data-project-id=""><span>▢</span><span>No project</span></button>
      ${state.projects.map(project => `<button type="button" data-project-id="${escapeHtml(project.id)}"><span>▣</span><span>${escapeHtml(project.name)}</span></button>`).join('')}
      <div class="project-menu-divider"></div>
      <button type="button" data-create-project="true"><span>+</span><span>New project</span></button>`;
    document.body.appendChild(menu);
    const rect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 213));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - Math.min(280, menu.offsetHeight) - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.addEventListener('click', event => {
      const choice = event.target.closest('button');
      if (!choice) return;
      let chosenId = choice.dataset.projectId ?? null;
      if (choice.dataset.createProject === 'true') {
        const project = createProject();
        if (!project) return closeMenu();
        chosenId = project.id;
      }
      state.chats[chatId] = { ...(state.chats[chatId] || {}), projectId: chosenId || null };
      save();
      render();
      closeMenu();
    });

    outsideHandler = event => {
      if (!menu?.contains(event.target) && event.target !== button) closeMenu();
    };
    setTimeout(() => document.addEventListener('pointerdown', outsideHandler, true), 0);
  };

  const setup = async () => {
    const user = await getCurrentUser();
    if (destroyed || !user?.id) return;

    const sidebar = root?.querySelector?.('.guides-workspace-sidebar');
    sourceList = sidebar?.querySelector?.('#guides-workspace-chat-list');
    if (!sidebar || !sourceList || sidebar.dataset.chatOrganisationReady === 'true') return;

    sidebar.dataset.chatOrganisationReady = 'true';
    storageKey = `${STORAGE_PREFIX}${user.id}`;
    state = load();

    sidebar.querySelector('.guides-workspace-history-label')?.style.setProperty('display', 'none');
    sourceList.style.display = 'none';
    organisationRoot = document.createElement('div');
    organisationRoot.className = 'guides-chat-organised-list';
    sourceList.insertAdjacentElement('afterend', organisationRoot);

    render();
    sourceObserver = new MutationObserver(render);
    sourceObserver.observe(sourceList, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    organisationRoot.addEventListener('click', event => {
      const newProject = event.target.closest('#guides-chat-new-project');
      if (newProject) return void createProject();

      const projectTitle = event.target.closest('.guides-chat-project-title');
      if (projectTitle) {
        const project = state.projects.find(p => p.id === projectTitle.dataset.projectId);
        if (project) {
          project.collapsed = !project.collapsed;
          save();
          render();
        }
        return;
      }

      const projectRename = event.target.closest('.project-rename');
      if (projectRename) {
        const project = state.projects.find(p => p.id === projectRename.dataset.projectId);
        if (!project) return;
        const name = window.prompt('Rename project', project.name);
        if (name?.trim()) {
          project.name = name.trim();
          save();
          render();
        }
        return;
      }

      const projectDelete = event.target.closest('.project-delete');
      if (projectDelete) {
        const project = state.projects.find(p => p.id === projectDelete.dataset.projectId);
        if (!project || !window.confirm(`Delete project "${project.name}"? Chats will move back to Chats.`)) return;
        state.projects = state.projects.filter(p => p.id !== project.id);
        Object.values(state.chats).forEach(meta => { if (meta.projectId === project.id) meta.projectId = null; });
        save();
        render();
        return;
      }

      const rowAction = event.target.closest('[data-chat-id]');
      const chatId = rowAction?.dataset.chatId;
      if (!chatId) return;

      if (event.target.closest('.chat-pin')) {
        state.chats[chatId] = { ...(state.chats[chatId] || {}), pinned: !state.chats[chatId]?.pinned };
        save();
        render();
        return;
      }
      if (event.target.closest('.chat-move')) return void showProjectMenu(event.target.closest('.chat-move'), chatId);
      if (event.target.closest('.chat-more')) return void sourceList.querySelector(`.guides-workspace-chat-rename[data-id="${CSS.escape(chatId)}"]`)?.click();
      if (event.target.closest('.chat-delete')) return void sourceList.querySelector(`.guides-workspace-chat-delete[data-id="${CSS.escape(chatId)}"]`)?.click();
      if (event.target.closest('.guides-chat-org-open')) return void sourceList.querySelector(`.guides-workspace-chat-open[data-id="${CSS.escape(chatId)}"]`)?.click();
    });
  };

  requestAnimationFrame(setup);

  return () => {
    destroyed = true;
    sourceObserver?.disconnect();
    closeMenu();
    organisationRoot?.remove();
    if (sourceList) sourceList.style.display = '';
  };
};
