import { describe, expect, it } from 'vitest';
import { calculateGuidesWorkspaceHeight } from './guidesLibraryPolish.js';

describe('guides library viewport fit', () => {
  it('fits the workspace into the visible browser frame', () => {
    expect(calculateGuidesWorkspaceHeight(940, 240)).toBe(684);
  });

  it('keeps a usable minimum height on short viewports', () => {
    expect(calculateGuidesWorkspaceHeight(500, 180)).toBe(420);
  });
});
