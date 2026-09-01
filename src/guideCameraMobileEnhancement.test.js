// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initGuideCameraMobileEnhancement,
  isPortraitTouchViewport,
  showLandscapePrompt
} from './guideCameraMobileEnhancement.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#guide-camera-mobile-enhancement-styles')?.remove();
  vi.restoreAllMocks();
});

describe('mobile camera guide enhancement', () => {
  it('identifies portrait touch devices but not landscape devices', () => {
    const portraitWindow = {
      innerWidth: 390,
      innerHeight: 844,
      matchMedia: () => ({ matches: true })
    };
    const landscapeWindow = {
      innerWidth: 844,
      innerHeight: 390,
      matchMedia: () => ({ matches: true })
    };

    expect(isPortraitTouchViewport(portraitWindow, { maxTouchPoints: 5 })).toBe(true);
    expect(isPortraitTouchViewport(landscapeWindow, { maxTouchPoints: 5 })).toBe(false);
  });

  it('shows a landscape reminder and allows the user to continue', () => {
    const onContinue = vi.fn();
    const windowLike = {
      innerWidth: 390,
      innerHeight: 844,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    showLandscapePrompt({ onContinue, windowLike });
    expect(document.body.textContent).toContain('Turn your phone sideways');

    document.querySelector('.guide-camera-continue').click();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.guide-camera-orientation-prompt')).toBeNull();
  });

  it('makes the mobile recorder fullscreen while the camera preview exists', async () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="sys-builder-root">
          <div id="rec-live-ui"></div>
        </div>
      </div>`;

    const root = document.getElementById('root');
    const builder = document.getElementById('sys-builder-root');
    const cleanup = initGuideCameraMobileEnhancement(root);

    const preview = document.createElement('video');
    preview.id = 'sys-camera-preview';
    document.getElementById('rec-live-ui').appendChild(preview);
    await Promise.resolve();

    expect(builder.classList.contains('sys-camera-mobile-active')).toBe(true);

    preview.remove();
    await Promise.resolve();
    expect(builder.classList.contains('sys-camera-mobile-active')).toBe(false);

    cleanup();
  });
});
