// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initGuidesLibraryNavigationFix } from './guidesLibraryNavigationFix.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#guides-library-navigation-fix-styles')?.remove();
});

describe('Guides Library navigation fix', () => {
  it('reuses the original Build Guide control so its builder listener remains attached', () => {
    document.body.innerHTML = `
      <main id="root">
        <div class="guides-workspace-sidebar">
          <button id="guides-workspace-library">Library</button>
          <button id="guides-workspace-new-chat">New chat</button>
          <div class="guides-workspace-sidebar-footer"></div>
        </div>
        <div data-legacy-guides-sidebar="true" style="display:none">
          <div id="create-interactive-guide-btn">Legacy Build Guide</div>
        </div>
        <div id="guides-user-library-view">
          <button class="guides-library-action" data-action="guide">Build Guide</button>
          <div class="guides-library-sections"></div>
        </div>
      </main>`;

    const original = document.getElementById('create-interactive-guide-btn');
    const openBuilder = vi.fn();
    original.addEventListener('click', openBuilder);

    const cleanup = initGuidesLibraryNavigationFix(document.getElementById('root'));

    const visibleBuildGuide = document.querySelector('.guides-library-action[data-action="guide"]');
    expect(visibleBuildGuide).toBe(original);
    expect(visibleBuildGuide.id).toBe('create-interactive-guide-btn');

    visibleBuildGuide.click();
    expect(openBuilder).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
