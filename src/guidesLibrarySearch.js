// How the library search box matches what people type against a library card.

/**
 * Splits a search box value into the words that all have to be found.
 * An empty or whitespace-only query gives no terms, which matches everything.
 */
export const libraryQueryTerms = query => String(query || '')
  .trim()
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean);

/**
 * True when every word appears somewhere in the card's text, in any order, so
 * "pleo guide" finds "PLEO APP USER GUIDE" and a stray extra space is harmless.
 */
export const matchesLibraryQuery = (text, terms) => {
  if (!terms.length) return true;
  const haystack = String(text || '').toLowerCase();
  return terms.every(term => haystack.includes(term));
};
