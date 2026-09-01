// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncGuidesInteractionCleanup } from './guidesInteractionCleanup.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#guides-interaction-cleanup-styles')?.remove();
});

describe('Guides interaction cleanup', () => {
  it('moves the original Build Guide control into the visible toolbar without losing its listener', () => {
    document.body.innerHTML = `
      <div id="legacy-sidebar" style="display:none">
        <div id="create-interactive-guide-btn">
          <div>🖱️</div>
          <div>Build Guide</div>
        </div>
      </div>
      <div class="guides-library-manager-actions">
        <button type="button" data-action="guide">Build Guide</button>
      </div>
    `;

    const original = document.getElementById('create-interactive-guide-btn');
    const handler = vi.fn();
    original.addEventListener('click', handler);

    syncGuidesInteractionCleanup(document);

    const visibleAction = document.querySelector('.guides-library-manager-actions #create-interactive-guide-btn');
    expect(visibleAction).toBe(original);
    expect(visibleAction?.dataset.action).toBe('guide');
    expect(visibleAction?.getAttribute('role')).toBe('button');

    visibleAction.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps Build Guide the same size as the other Library actions', () => {
    document.body.innerHTML = `
      <div id="create-interactive-guide-btn">Build Guide</div>
      <div class="guides-library-manager-actions">
        <button type="button" data-action="guide">Build Guide</button>
      </div>
    `;

    syncGuidesInteractionCleanup(document);

    const styles = document.getElementById('guides-interaction-cleanup-styles')?.textContent || '';
    expect(styles).not.toContain('.guides-native-build-guide-action {\n      flex: 0 0 auto;\n      min-height: 40px;');
  });

  it('allows the mobile builder to replace the Library when the Guides container is hidden', () => {
    syncGuidesInteractionCleanup(document);

    const styles = document.getElementById('guides-interaction-cleanup-styles')?.textContent || '';
    expect(styles).toContain('.guides-container.guides-workspace-ready[style*="display: none"]');
    expect(styles).toContain('display: none !important;');
  });

  it('removes canned chat question prompts', () => {
    document.body.innerHTML = `
      <div id="guides-chat-view">
        <div id="chat-suggestions">
          <button class="suggestion-chip">Question one</button>
          <button class="suggestion-chip">Question two</button>
          <button class="suggestion-chip">Question three</button>
        </div>
      </div>
    `;

    syncGuidesInteractionCleanup(document);

    expect(document.getElementById('chat-suggestions')).toBeNull();
    expect(document.querySelectorAll('.suggestion-chip')).toHaveLength(0);
  });
});
