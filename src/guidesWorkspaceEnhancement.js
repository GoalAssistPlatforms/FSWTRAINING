const WORKSPACE_STYLE_ID = 'guides-workspace-enhancement-styles';

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const ensureWorkspaceStyles = () => {
  if (document.getElementById(WORKSPACE_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = WORKSPACE_STYLE_ID;
  style.textContent = `
    .guides-container.guides-workspace-ready {
      grid-template-columns: 270px minmax(0, 1fr) !important;
      min-width: 0;
    }

    .guides-workspace-sidebar {
      min-width: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      padding: 1rem 0.8rem;
      box-sizing: border-box;
      border-right: 1px solid rgba(255,255,255,0.07);
      background: rgba(8, 13, 24, 0.62);
      overflow: hidden;
    }

    .guides-workspace-new-chat,
    .guides-workspace-library {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: #f3f4f6;
      padding: 0.7rem 0.75rem;
      font: inherit;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      transition: background 0.18s, border-color 0.18s;
    }

    .guides-workspace-new-chat:hover,
    .guides-workspace-library:hover,
    .guides-workspace-library.active {
      background: rgba(255,255,255,0.065);
      border-color: rgba(255,255,255,0.07);
    }

    .guides-workspace-new-chat {
      margin-bottom: 0.85rem;
    }

    .guides-workspace-history-label {
      padding: 0.45rem 0.75rem 0.4rem;
      color: #7f8896;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .guides-workspace-chat-list {
      min-height: 0;
      flex: 1;
      overflow-y: auto;
      padding-right: 0.15rem;
      scrollbar-width: thin;
    }

    .guides-workspace-chat-item {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      border-radius: 9px;
      margin: 0.1rem 0;
      background: transparent;
    }

    .guides-workspace-chat-item:hover,
    .guides-workspace-chat-item.active {
      background: rgba(255,255,255,0.055);
    }

    .guides-workspace-chat-open {
      min-width: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
      padding: 0.62rem 0.68rem;
      border: 0;
      background: transparent;
      color: #e5e7eb;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .guides-workspace-chat-title {
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.82rem;
      font-weight: 500;
    }

    .guides-workspace-chat-date {
      color: #727b89;
      font-size: 0.67rem;
    }

    .guides-workspace-chat-actions {
      display: flex;
      opacity: 0;
      transition: opacity 0.15s;
      padding-right: 0.3rem;
    }

    .guides-workspace-chat-item:hover .guides-workspace-chat-actions,
    .guides-workspace-chat-item:focus-within .guides-workspace-chat-actions {
      opacity: 1;
    }

    .guides-workspace-chat-actions button {
      width: 25px;
      height: 25px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #8d96a3;
      cursor: pointer;
      font-size: 0.85rem;
    }

    .guides-workspace-chat-actions button:hover {
      background: rgba(255,255,255,0.08);
      color: white;
    }

    .guides-workspace-chat-empty {
      padding: 0.85rem 0.75rem;
      color: #727b89;
      font-size: 0.78rem;
      line-height: 1.45;
    }

    .guides-workspace-sidebar-footer {
      flex-shrink: 0;
      padding-top: 0.75rem;
      margin-top: 0.75rem;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    .guides-workspace-ready #guides-chat-controls {
      display: none !important;
    }

    .guides-workspace-ready > div:last-child {
      min-width: 0;
    }

    .guides-user-library-view {
      width: 100%;
      max-width: 960px;
      height: 100%;
      display: none;
      flex-direction: column;
      gap: 1.25rem;
      box-sizing: border-box;
    }

    .guides-library-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .guides-library-header h2 {
      margin: 0;
      color: white;
      font-size: 1.8rem;
    }

    .guides-library-header p {
      margin: 0.3rem 0 0;
      color: var(--text-muted);
      font-size: 0.88rem;
    }

    .guides-library-toolbar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: var(--radius-lg);
      background: rgba(0,0,0,0.25);
    }

    .guides-library-search-wrap {
      position: relative;
      flex: 1;
      min-width: 180px;
    }

    .guides-library-search-wrap #guide-search-input {
      width: 100% !important;
      padding: 0.7rem 1rem 0.7rem 2.35rem !important;
      border-radius: 10px !important;
      box-sizing: border-box !important;
    }

    .guides-library-type-filter {
      padding: 0.7rem 0.9rem;
      border-radius: 10px;
      border: 1px solid var(--glass-border);
      background: rgba(0,0,0,0.25);
      color: white;
      outline: none;
      cursor: pointer;
    }

    .guides-library-sections {
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding-bottom: 2rem;
    }

    .guides-library-section {
      display: flex;
      flex-direction: column;
      gap: 0.7rem;
    }

    .guides-library-section-title {
      margin: 0;
      color: #aab1bc;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .guides-library-section > div[id$='list'] {
      display: flex !important;
      flex-direction: column;
      gap: 0.7rem !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .guides-library-section .guide-card {
      width: 100%;
      box-sizing: border-box;
      min-height: 72px;
    }

    .guides-user-library-view .guides-library-section[data-library-type="documents"] {
      padding: 0 1rem 1.2rem;
    }

    .guides-user-library-view .guides-library-section[data-library-type="documents"] .guides-library-section-title {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    .guides-user-library-view .guides-library-section[data-library-type="documents"] #guides-list {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
      align-items: start;
      gap: 1.25rem 1rem !important;
    }

    .guides-user-library-view .guides-library-section[data-library-type="documents"] .guide-card {
      position: relative;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
      gap: 0.7rem;
      min-width: 0;
      min-height: 0 !important;
      padding: 0.65rem !important;
      border: 1px solid transparent !important;
      border-radius: 12px !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .guides-user-library-view .guides-library-section[data-library-type="documents"] .guide-card:hover,
    .guides-user-library-view .guides-library-section[data-library-type="documents"] .guide-card:focus-visible {
      background: rgba(255,255,255,0.045) !important;
      border-color: rgba(255,255,255,0.08) !important;
      outline: none;
    }

    .guide-document-thumbnail {
      position: relative;
      width: 100%;
      height: 186px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid rgba(148,163,184,0.28);
      border-radius: 8px;
      background: #eef2f7;
      box-shadow: 0 9px 22px rgba(0,0,0,0.2);
    }

    .guide-document-thumbnail-canvas {
      position: relative;
      z-index: 1;
      display: block;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      opacity: 0;
      background: white;
      transition: opacity 0.18s ease;
    }

    .guide-document-thumbnail-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      background: linear-gradient(145deg, #f8fafc, #e2e8f0);
      transition: opacity 0.18s ease;
    }

    .guide-document-thumbnail[data-thumbnail-state="loading"] .guide-document-thumbnail-placeholder {
      animation: guide-document-thumbnail-pulse 1.2s ease-in-out infinite alternate;
    }

    .guide-document-thumbnail[data-thumbnail-state="ready"] .guide-document-thumbnail-canvas {
      opacity: 1;
    }

    .guide-document-thumbnail[data-thumbnail-state="ready"] .guide-document-thumbnail-placeholder {
      opacity: 0;
    }

    .guide-document-thumbnail-badge {
      position: absolute;
      z-index: 2;
      right: 0.45rem;
      bottom: 0.45rem;
      padding: 0.18rem 0.38rem;
      border-radius: 5px;
      background: rgba(185,28,28,0.92);
      color: white;
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      box-shadow: 0 2px 7px rgba(0,0,0,0.22);
    }

    .guide-document-card-details {
      width: 100%;
      min-width: 0;
      text-align: center;
    }

    .guide-document-card-details h4 {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .guide-document-card-details > div:last-child:not(:first-child) {
      justify-content: center;
    }

    .guides-user-library-view .guides-library-section[data-library-type="documents"] .guide-card > div:last-child:not(.guide-document-card-details) {
      position: absolute;
      z-index: 3;
      top: 1rem;
      right: 1rem;
    }

    @keyframes guide-document-thumbnail-pulse {
      from { opacity: 0.72; }
      to { opacity: 1; }
    }

    .guides-library-manager-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-left: auto;
    }

    .guides-library-action {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.55rem 0.75rem;
      border-radius: 9px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.045);
      color: white;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }

    .guides-library-action:hover {
      background: rgba(255,255,255,0.085);
    }

    .guides-workspace-ready #guides-manager-view {
      max-width: 960px !important;
    }

    @media (max-width: 800px) {
      .guides-container.guides-workspace-ready {
        grid-template-columns: 210px minmax(0, 1fr) !important;
      }

      .guides-workspace-sidebar {
        padding-left: 0.55rem;
        padding-right: 0.55rem;
      }

      .guides-user-library-view .guides-library-section[data-library-type="documents"] #guides-list {
        grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
      }

      .guide-document-thumbnail {
        height: 160px;
      }
    }
  `;

  document.head.appendChild(style);
};

export const isCourseLibraryCard = card => {
  if (!card) return false;
  return Array.from(card.querySelectorAll('span')).some(span => span.textContent.trim().toUpperCase() === 'COURSE');
};

const proxyClick = selector => {
  const target = document.querySelector(selector);
  if (target && !target.disabled) target.click();
};

const createSidebar = () => {
  const sidebar = document.createElement('aside');
  sidebar.className = 'guides-workspace-sidebar';
  sidebar.innerHTML = `
    <button type="button" class="guides-workspace-new-chat" id="guides-workspace-new-chat">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
      <span>New chat</span>
    </button>
    <div class="guides-workspace-history-label">Chats</div>
    <div class="guides-workspace-chat-list" id="guides-workspace-chat-list">
      <div class="guides-workspace-chat-empty">Loading chat history...</div>
    </div>
    <div class="guides-workspace-sidebar-footer">
      <button type="button" class="guides-workspace-library" id="guides-workspace-library">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
        <span>Library</span>
      </button>
    </div>
  `;
  return sidebar;
};

const renderSidebarHistory = (list, historyPanel) => {
  if (!list) return;
  if (!historyPanel) {
    list.innerHTML = '<div class="guides-workspace-chat-empty">Chat history is loading...</div>';
    return;
  }

  const items = Array.from(historyPanel.querySelectorAll('.guide-chat-history-item'));
  if (items.length === 0) {
    const emptyText = historyPanel.textContent.trim() || 'No saved chats yet.';
    list.innerHTML = `<div class="guides-workspace-chat-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  list.innerHTML = items.map(item => {
    const id = item.dataset.id || item.querySelector('[data-id]')?.dataset.id || '';
    const title = item.querySelector('.guide-chat-history-title')?.textContent?.trim() || 'New chat';
    const date = item.querySelector('.guide-chat-history-date')?.textContent?.trim() || '';
    const active = item.classList.contains('active') ? ' active' : '';
    return `
      <div class="guides-workspace-chat-item${active}" data-id="${escapeHtml(id)}">
        <button type="button" class="guides-workspace-chat-open" data-id="${escapeHtml(id)}" title="${escapeHtml(title)}">
          <span class="guides-workspace-chat-title">${escapeHtml(title)}</span>
          ${date ? `<span class="guides-workspace-chat-date">${escapeHtml(date)}</span>` : ''}
        </button>
        <div class="guides-workspace-chat-actions">
          <button type="button" class="guides-workspace-chat-rename" data-id="${escapeHtml(id)}" aria-label="Rename chat" title="Rename">✎</button>
          <button type="button" class="guides-workspace-chat-delete" data-id="${escapeHtml(id)}" aria-label="Delete chat" title="Delete">×</button>
        </div>
      </div>`;
  }).join('');
};

const buildUserLibrary = (mainPanel, legacySidebar) => {
  let view = mainPanel.querySelector('#guides-user-library-view');
  if (view) return view;

  view = document.createElement('div');
  view.id = 'guides-user-library-view';
  view.className = 'guides-user-library-view';
  view.innerHTML = `
    <div class="guides-library-header">
      <div>
        <h2>Library</h2>
        <p>Browse the official guides, documents and web resources available to you.</p>
      </div>
    </div>
    <div class="guides-library-toolbar">
      <div class="guides-library-search-wrap" id="guides-library-search-wrap"></div>
      <select id="guides-library-type-filter" class="guides-library-type-filter" aria-label="Filter library by type">
        <option value="all">All</option>
        <option value="guides">Guides</option>
        <option value="documents">Documents</option>
        <option value="links">Links</option>
      </select>
    </div>
    <div class="guides-library-sections">
      <section class="guides-library-section" data-library-type="guides">
        <h3 class="guides-library-section-title">Software Guides</h3>
      </section>
      <section class="guides-library-section" data-library-type="documents">
        <h3 class="guides-library-section-title">Documents</h3>
      </section>
      <section class="guides-library-section" data-library-type="links">
        <h3 class="guides-library-section-title">Links & Web Resources</h3>
      </section>
    </div>
  `;

  mainPanel.appendChild(view);

  const searchInput = legacySidebar.querySelector('#guide-search-input');
  if (searchInput) {
    const wrap = view.querySelector('#guides-library-search-wrap');
    wrap.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    wrap.appendChild(searchInput);
    searchInput.placeholder = 'Search library...';
  }

  const moves = [
    ['#interactive-guides-list', 'guides'],
    ['#guides-list', 'documents'],
    ['#links-list', 'links']
  ];
  moves.forEach(([selector, type]) => {
    const list = document.querySelector(selector);
    const section = view.querySelector(`[data-library-type="${type}"]`);
    if (list && section) {
      list.style.display = 'flex';
      section.appendChild(list);
    }
  });

  const typeFilter = view.querySelector('#guides-library-type-filter');
  typeFilter?.addEventListener('change', () => {
    view.querySelectorAll('[data-library-type]').forEach(section => {
      section.style.display = typeFilter.value === 'all' || section.dataset.libraryType === typeFilter.value ? 'flex' : 'none';
    });
  });

  return view;
};

const prepareManagerLibrary = (root, managerView, legacySidebar) => {
  if (!managerView || managerView.dataset.libraryPrepared === 'true') return;
  managerView.dataset.libraryPrepared = 'true';

  const heading = managerView.querySelector('h2');
  if (heading) {
    heading.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> Library';
  }

  const description = heading?.parentElement?.querySelector('p');
  if (description) description.textContent = 'Browse, add and maintain the official guides, documents and web resources available across FSW.';

  const backButton = managerView.querySelector('#close-manager-view-btn');
  if (backButton) backButton.style.display = 'none';

  const typeFilter = managerView.querySelector('#curation-type-filter');
  if (typeFilter) {
    typeFilter.querySelector('option[value="course"]')?.remove();
    const allOption = typeFilter.querySelector('option[value="all"]');
    if (allOption) allOption.textContent = 'All Library Items';
  }

  const header = heading?.parentElement?.parentElement;
  if (header && !header.querySelector('#guides-library-manager-actions')) {
    const actions = document.createElement('div');
    actions.id = 'guides-library-manager-actions';
    actions.className = 'guides-library-manager-actions';
    actions.innerHTML = `
      <button type="button" class="guides-library-action" data-action="upload">📄 Upload PDF</button>
      <button type="button" class="guides-library-action" data-action="guide">🖱️ Build Guide</button>
      <button type="button" class="guides-library-action" data-action="link">🔗 Add Link</button>
    `;
    header.appendChild(actions);
    actions.querySelector('[data-action="upload"]')?.addEventListener('click', () => proxyClick('#upload-zone'));
    actions.querySelector('[data-action="guide"]')?.addEventListener('click', () => proxyClick('#create-interactive-guide-btn'));
    actions.querySelector('[data-action="link"]')?.addEventListener('click', () => proxyClick('#add-link-btn'));
  }

  const progress = legacySidebar.querySelector('#upload-progress');
  const toolbar = managerView.querySelector('#curation-search')?.closest('.glass');
  if (progress && toolbar?.parentElement && !managerView.contains(progress)) {
    progress.style.width = '100%';
    progress.style.margin = '0';
    toolbar.insertAdjacentElement('afterend', progress);
  }
};

const hideCourseCards = managerView => {
  if (!managerView) return;
  managerView.querySelectorAll('#curation-items-list .curation-card').forEach(card => {
    if (isCourseLibraryCard(card)) card.style.display = 'none';
  });
};

export const initGuidesWorkspaceEnhancement = root => {
  ensureWorkspaceStyles();

  const container = root?.querySelector?.('.guides-container');
  if (!container || container.dataset.workspaceEnhanced === 'true') return () => {};
  if (container.children.length < 2) return () => {};

  container.dataset.workspaceEnhanced = 'true';
  container.classList.add('guides-workspace-ready');

  const legacySidebar = container.children[0];
  const mainPanel = container.children[1];
  const chatView = container.querySelector('#guides-chat-view');
  const managerView = container.querySelector('#guides-manager-view');
  const manageButton = legacySidebar.querySelector('#manage-content-btn');
  const isManager = Boolean(manageButton);

  legacySidebar.dataset.legacyGuidesSidebar = 'true';
  legacySidebar.style.display = 'none';

  const sidebar = createSidebar();
  container.insertBefore(sidebar, mainPanel);

  const chatList = sidebar.querySelector('#guides-workspace-chat-list');
  const newChatButton = sidebar.querySelector('#guides-workspace-new-chat');
  const libraryButton = sidebar.querySelector('#guides-workspace-library');
  let userLibraryView = null;
  let destroyed = false;

  const showChat = () => {
    if (chatView) chatView.style.display = 'flex';
    if (managerView) managerView.style.display = 'none';
    if (userLibraryView) userLibraryView.style.display = 'none';
    libraryButton?.classList.remove('active');
  };

  const showLibrary = () => {
    libraryButton?.classList.add('active');
    if (isManager) {
      manageButton?.click();
      prepareManagerLibrary(root, managerView, legacySidebar);
      hideCourseCards(managerView);
      return;
    }

    if (chatView) chatView.style.display = 'none';
    userLibraryView = buildUserLibrary(mainPanel, legacySidebar);
    userLibraryView.style.display = 'flex';
  };

  newChatButton?.addEventListener('click', () => {
    showChat();
    proxyClick('#new-guides-chat-btn');
  });
  libraryButton?.addEventListener('click', showLibrary);

  const historyPanel = root.querySelector('#guides-chat-history-panel');
  const syncHistory = () => {
    if (!destroyed) renderSidebarHistory(chatList, historyPanel);
  };
  const historyObserver = historyPanel ? new MutationObserver(syncHistory) : null;
  if (historyPanel) historyObserver.observe(historyPanel, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const handleSidebarClick = event => {
    const openButton = event.target.closest('.guides-workspace-chat-open');
    if (openButton) {
      showChat();
      root.querySelector(`.guide-chat-history-open[data-id="${CSS.escape(openButton.dataset.id)}"]`)?.click();
      return;
    }

    const renameButton = event.target.closest('.guides-workspace-chat-rename');
    if (renameButton) {
      root.querySelector(`.guide-chat-rename[data-id="${CSS.escape(renameButton.dataset.id)}"]`)?.click();
      return;
    }

    const deleteButton = event.target.closest('.guides-workspace-chat-delete');
    if (deleteButton) {
      root.querySelector(`.guide-chat-delete[data-id="${CSS.escape(deleteButton.dataset.id)}"]`)?.click();
    }
  };
  chatList?.addEventListener('click', handleSidebarClick);

  let managerObserver = null;
  if (isManager && managerView) {
    prepareManagerLibrary(root, managerView, legacySidebar);
    const curationList = managerView.querySelector('#curation-items-list');
    if (curationList) {
      managerObserver = new MutationObserver(() => hideCourseCards(managerView));
      managerObserver.observe(curationList, { childList: true, subtree: true });
    }
  }

  requestAnimationFrame(syncHistory);

  return () => {
    destroyed = true;
    historyObserver?.disconnect();
    managerObserver?.disconnect();
    chatList?.removeEventListener('click', handleSidebarClick);
  };
};
