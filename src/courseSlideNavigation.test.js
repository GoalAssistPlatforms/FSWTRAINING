import { describe, expect, it } from 'vitest';
import { canNavigateToSlide, getInitialFurthestSlide } from './courseSlideNavigation.js';

describe('course slide navigation', () => {
    it('starts a frontier lesson with only the first slide unlocked', () => {
        expect(getInitialFurthestSlide({ slideCount: 6 })).toBe(0);
    });

    it('restores the furthest slide already reached', () => {
        expect(getInitialFurthestSlide({ storedIndex: 3, slideCount: 6 })).toBe(3);
    });

    it('unlocks every slide when reviewing a completed earlier lesson', () => {
        expect(getInitialFurthestSlide({ storedIndex: 0, slideCount: 6, hasLaterUnlockedLesson: true })).toBe(5);
    });

    it('allows forward navigation only up to the furthest unlocked slide', () => {
        expect(canNavigateToSlide(2, 3, 6)).toBe(true);
        expect(canNavigateToSlide(3, 3, 6)).toBe(true);
        expect(canNavigateToSlide(4, 3, 6)).toBe(false);
    });

    it('never permits navigation outside the slide range', () => {
        expect(canNavigateToSlide(-1, 3, 6)).toBe(false);
        expect(canNavigateToSlide(6, 6, 6)).toBe(false);
    });
});
