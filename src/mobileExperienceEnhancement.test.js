// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initMobileExperienceEnhancement, syncMobileExperience } from './mobileExperienceEnhancement.js';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelector('#fsw-mobile-experience-styles')?.remove();
  vi.restoreAllMocks();
});

describe('mobile experience enhancement', () => {
  it('marks the shared header and dashboard tabs for responsive layout', () => {
    document.body.innerHTML = `
      <div id="app">
        <header>
          <div><div class="logo-badge"><img></div><div><h2>FSW</h2><span>Aspire Training</span></div></div>
          <div><div><select id="admin-view-toggle"><option>Manager</option></select></div><button id="settings-btn"></button><button id="logout-btn"></button></div>
        </header>
        <main>
          <div><button id="tab-user-courses">My Courses</button><button id="tab-user-guides">Guides</button></div>
        </main>
      </div>`;

    syncMobileExperience();

    expect(document.querySelector('#app > header').classList.contains('fsw-main-header')).toBe(true);
    expect(document.querySelector('#tab-user-courses').parentElement.classList.contains('fsw-primary-tabs')).toBe(true);
    expect(document.querySelector('#admin-view-toggle').parentElement.classList.contains('fsw-admin-view-toggle')).toBe(true);
    expect(document.getElementById('fsw-mobile-experience-styles')).not.toBeNull();
  });

  it('adds a mobile Guides menu that opens and closes the existing sidebar', () => {
    document.body.innerHTML = `
      <main id="root">
        <div class="guides-container guides-workspace-ready">
          <aside class="guides-workspace-sidebar"><button class="guides-workspace-library">Library</button></aside>
          <div><div id="guides-chat-view"></div></div>
        </div>
      </main>`;

    syncMobileExperience();
    const container = document.querySelector('.guides-container');
    const toggle = container.querySelector('.fsw-mobile-guides-toggle');
    const backdrop = container.querySelector('.fsw-mobile-guides-backdrop');

    expect(toggle).not.toBeNull();
    toggle.click();
    expect(container.classList.contains('guides-mobile-drawer-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    backdrop.click();
    expect(container.classList.contains('guides-mobile-drawer-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('continues enhancing content added after initialisation', async () => {
    document.body.innerHTML = '<main id="root"></main>';
    const root = document.getElementById('root');
    const cleanup = initMobileExperienceEnhancement(root);

    root.innerHTML = '<div><button id="tab-courses">Courses</button><button id="tab-guides">Guides</button></div>';
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    expect(document.getElementById('tab-courses').parentElement.classList.contains('fsw-primary-tabs')).toBe(true);
    cleanup();
  });
});
