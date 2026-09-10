import { describe, expect, it } from 'vitest';
import { libraryQueryTerms, matchesLibraryQuery } from './guidesLibrarySearch.js';

const card = 'PLEO APP USER GUIDE\nAdded 28/08/2026\nfinance expenses';

describe('library search matching', () => {
  it('matches words in any order rather than one exact phrase', () => {
    expect(matchesLibraryQuery(card, libraryQueryTerms('pleo guide'))).toBe(true);
    expect(matchesLibraryQuery(card, libraryQueryTerms('guide pleo'))).toBe(true);
  });

  it('ignores stray spaces and casing', () => {
    expect(matchesLibraryQuery(card, libraryQueryTerms('  Pleo  '))).toBe(true);
    expect(matchesLibraryQuery(card, libraryQueryTerms('PLEO app '))).toBe(true);
  });

  it('needs every word to be present', () => {
    expect(matchesLibraryQuery(card, libraryQueryTerms('pleo payroll'))).toBe(false);
  });

  it('searches the whole card, not just the title', () => {
    expect(matchesLibraryQuery(card, libraryQueryTerms('expenses'))).toBe(true);
  });

  it('shows everything when the box is empty', () => {
    expect(libraryQueryTerms('   ')).toEqual([]);
    expect(matchesLibraryQuery(card, libraryQueryTerms(''))).toBe(true);
  });

  it('copes with a card that has no text', () => {
    expect(matchesLibraryQuery(null, libraryQueryTerms('pleo'))).toBe(false);
    expect(matchesLibraryQuery(null, libraryQueryTerms(''))).toBe(true);
  });
});
