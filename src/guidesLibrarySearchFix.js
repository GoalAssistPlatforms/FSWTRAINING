const normaliseSearchText = value => String(value || '').trim().toLocaleLowerCase();

export const applyGuidesLibraryFilters = view => {
  if (!view) return;

  const searchInput = view.querySelector('#guide-search-input');
  const typeFilter = view.querySelector('#guides-library-type-filter');
  const query = normaliseSearchText(searchInput?.value);
  const selectedType = typeFilter?.value || 'all';

  view.querySelectorAll('.guides-library-section[data-library-type]').forEach(section => {
    const typeMatches = selectedType === 'all' || section.dataset.libraryType === selectedType;
    let matchingCards = 0;

    section.querySelectorAll('.guide-card').forEach(card => {
      const textMatches = !query || normaliseSearchText(card.textContent).includes(query);
      const shouldShow = typeMatches && textMatches;

      if (shouldShow) matchingCards += 1;

      // The document grid intentionally uses display:flex !important. Setting the
      // search result with the same priority prevents that presentation rule from
      // overriding search visibility.
      card.style.setProperty('display', shouldShow ? 'flex' : 'none', 'important');
      card.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    });

    const shouldShowSection = typeMatches && (!query || matchingCards > 0);
    section.style.setProperty('display', shouldShowSection ? 'flex' : 'none');
  });
};

export const initGuidesLibrarySearchFix = (root = document) => {
  const getView = () => root.querySelector('.guides-user-library-view');

  const apply = () => {
    const view = getView();
    if (view) applyGuidesLibraryFilters(view);
  };

  const handleInput = event => {
    if (event.target?.id === 'guide-search-input') apply();
  };

  const handleChange = event => {
    if (event.target?.id === 'guides-library-type-filter') apply();
  };

  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleChange);

  const observer = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(mutations => {
        const libraryChanged = mutations.some(mutation =>
          [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
            node.nodeType === 1 && (
              node.matches?.('.guide-card, .guides-user-library-view') ||
              node.querySelector?.('.guide-card, .guides-user-library-view')
            )
          )
        );

        if (libraryChanged) apply();
      })
    : null;

  if (observer) {
    observer.observe(root.body || root.documentElement || root, {
      childList: true,
      subtree: true
    });
  }

  return () => {
    root.removeEventListener('input', handleInput);
    root.removeEventListener('change', handleChange);
    observer?.disconnect();
  };
};
