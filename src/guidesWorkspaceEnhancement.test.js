// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { initGuidesWorkspaceEnhancement, isCourseLibraryCard } from './guidesWorkspaceEnhancement.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#guides-workspace-enhancement-styles')?.remove();
});

describe('Guides workspace enhancement', () => {
  it('moves browsing into Library and keeps chat history in the left sidebar', async () => {
    document.body.innerHTML = `
      <div id="root">
        <div class="guides-container">
          <div id="legacy-sidebar">
            <div><input id="guide-search-input" /></div>
            <div id="interactive-guides-list"><div class="guide-card">Software guide</div></div>
            <div id="guides-list"><div class="guide-card">Document</div></div>
            <div id="links-list"><div class="guide-card">Link</div></div>
          </div>
          <div id="main-panel">
            <div id="guides-chat-view" style="display:flex">
              <div id="guides-chat-controls">
                <button id="new-guides-chat-btn">New chat</button>
                <div id="guides-chat-history-panel">
                  <div class="guide-chat-history-item active" data-id="chat-1">
                    <button class="guide-chat-history-open" data-id="chat-1">
                      <span class="guide-chat-history-title">Holiday policy</span>
                      <span class="guide-chat-history-date">Today</span>
                    </button>
                    <button class="guide-chat-rename" data-id="chat-1"></button>
                    <button class="guide-chat-delete" data-id="chat-1"></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const cleanup = initGuidesWorkspaceEnhancement(document.getElementById('root'));
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(document.querySelector('.guides-workspace-sidebar')).not.toBeNull();
    expect(document.querySelector('.guides-workspace-chat-title')?.textContent).toBe('Holiday policy');
    expect(document.getElementById('legacy-sidebar').style.display).toBe('none');

    document.getElementById('guides-workspace-library').click();

    expect(document.getElementById('guides-chat-view').style.display).toBe('none');
    expect(document.getElementById('guides-user-library-view').style.display).toBe('flex');
    expect(document.querySelector('[data-library-type="guides"] #interactive-guides-list')).not.toBeNull();
    expect(document.querySelector('[data-library-type="documents"] #guides-list')).not.toBeNull();
    expect(document.querySelector('[data-library-type="links"] #links-list')).not.toBeNull();

    cleanup();
  });

  it('identifies only curation cards explicitly labelled as Course', () => {
    const courseCard = document.createElement('div');
    courseCard.innerHTML = '<span>COURSE</span><span>Added today</span>';

    const guideCard = document.createElement('div');
    guideCard.innerHTML = '<span>INTERACTIVE GUIDE</span><span>Course setup walkthrough</span>';

    expect(isCourseLibraryCard(courseCard)).toBe(true);
    expect(isCourseLibraryCard(guideCard)).toBe(false);
  });

  it('shows manager documents in the large icon curation grid', () => {
    document.body.innerHTML = `
      <div id="root">
        <div class="guides-container">
          <div id="legacy-sidebar">
            <input id="guide-search-input" />
            <button id="manage-content-btn">Manage</button>
            <div id="interactive-guides-list"></div>
            <div id="guides-list"></div>
            <div id="links-list"></div>
          </div>
          <div id="main-panel">
            <div id="guides-chat-view"></div>
            <div id="guides-manager-view" style="display:none">
              <div><div><h2>Manager</h2><p>Description</p></div></div>
              <div id="curation-items-list">
                <div class="curation-card" data-curation-type="document">
                  <div>
                    <div><div>Icon</div><div>Document title</div></div>
                    <div class="guide-document-thumbnail curation-document-thumbnail"></div>
                    <div>Status</div>
                  </div>
                  <div>Review</div>
                  <div>Actions</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const managerView = document.getElementById('guides-manager-view');
    document.getElementById('manage-content-btn').addEventListener('click', () => {
      managerView.style.display = 'flex';
    });

    const cleanup = initGuidesWorkspaceEnhancement(document.getElementById('root'));
    document.getElementById('guides-workspace-library').click();

    expect(managerView.style.display).toBe('flex');
    expect(getComputedStyle(document.getElementById('curation-items-list')).display).toBe('grid');
    expect(getComputedStyle(document.querySelector('.curation-document-thumbnail')).height).toBe('176px');

    cleanup();
  });
});
