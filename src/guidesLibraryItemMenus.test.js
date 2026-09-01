// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initGuidesLibraryItemMenus } from './guidesLibraryItemMenus.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#guides-library-item-menus-styles')?.remove();
});

describe('guides library item menus', () => {
  it('moves the existing delete control into a three dot menu and removes Manage Reviews', async () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="guides-user-library-view">
          <button data-action="reviews">Manage Reviews</button>
          <div id="guides-list">
            <div class="guide-card">
              <div class="actions"><button class="delete-guide-btn" data-id="doc-1">X</button></div>
            </div>
          </div>
        </div>
      </div>`;

    const root = document.getElementById('root');
    const originalDelete = root.querySelector('.delete-guide-btn');
    const deleteSpy = vi.fn();
    originalDelete.addEventListener('click', deleteSpy);

    const cleanup = initGuidesLibraryItemMenus(root);

    expect(root.querySelector('[data-action="reviews"]')).toBeNull();
    expect(root.querySelector('.guide-library-menu-trigger')?.textContent).toBe('•••');
    expect(root.querySelector('.guide-library-item-menu .delete-guide-btn')).toBe(originalDelete);
    expect(originalDelete.textContent).toBe('Delete');
    expect(root.querySelector('.guide-library-item-menu button')?.textContent).toBe('Edit');

    originalDelete.click();
    expect(deleteSpy).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
