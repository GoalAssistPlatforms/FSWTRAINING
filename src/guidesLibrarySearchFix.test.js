import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { applyGuidesLibraryFilters } from './guidesLibrarySearchFix.js';

const buildLibrary = () => {
  const dom = new JSDOM(`
    <div class="guides-user-library-view">
      <input id="guide-search-input" value="">
      <select id="guides-library-type-filter">
        <option value="all">All Library Items</option>
        <option value="guides">Guides</option>
        <option value="documents">Documents</option>
        <option value="links">Links</option>
      </select>
      <section class="guides-library-section" data-library-type="guides">
        <div class="guide-card">DPD Claims Step by Step Guide</div>
      </section>
      <section class="guides-library-section" data-library-type="documents">
        <div class="guide-card" style="display:flex !important">Flexible Working Appeal Outcome Letter</div>
        <div class="guide-card" style="display:flex !important">Invitation to Flex Working Consultation</div>
      </section>
      <section class="guides-library-section" data-library-type="links">
        <div class="guide-card">Holiday policy portal</div>
      </section>
    </div>
  `);

  return dom.window.document.querySelector('.guides-user-library-view');
};

describe('guides library search', () => {
  it('can hide document cards even when the document grid forces display flex with important priority', () => {
    const view = buildLibrary();
    view.querySelector('#guide-search-input').value = 'appeal';

    applyGuidesLibraryFilters(view);

    const documentCards = view.querySelectorAll('[data-library-type="documents"] .guide-card');
    expect(documentCards[0].style.display).toBe('flex');
    expect(documentCards[1].style.display).toBe('none');
    expect(documentCards[1].style.getPropertyPriority('display')).toBe('important');
    expect(view.querySelector('[data-library-type="guides"]').style.display).toBe('none');
  });

  it('combines text search with the selected library type', () => {
    const view = buildLibrary();
    view.querySelector('#guide-search-input').value = 'working';
    view.querySelector('#guides-library-type-filter').value = 'documents';

    applyGuidesLibraryFilters(view);

    expect(view.querySelector('[data-library-type="guides"]').style.display).toBe('none');
    expect(view.querySelector('[data-library-type="links"]').style.display).toBe('none');
    expect(view.querySelector('[data-library-type="documents"]').style.display).toBe('flex');
  });

  it('restores all library items when the search is cleared', () => {
    const view = buildLibrary();
    const input = view.querySelector('#guide-search-input');
    input.value = 'appeal';
    applyGuidesLibraryFilters(view);

    input.value = '';
    applyGuidesLibraryFilters(view);

    view.querySelectorAll('.guide-card').forEach(card => {
      expect(card.style.display).toBe('flex');
      expect(card.getAttribute('aria-hidden')).toBe('false');
    });
  });
});
