import { describe, expect, it } from 'vitest';
import { narrationNormalisationArgs } from './audioProcessing.js';

describe('narration loudness normalisation', () => {
    it('targets consistent spoken-word loudness and peak limits', () => {
        const args = narrationNormalisationArgs();
        const filterIndex = args.indexOf('-af');

        expect(filterIndex).toBeGreaterThan(-1);
        expect(args[filterIndex + 1]).toBe('loudnorm=I=-16:TP=-1.5:LRA=11');
        expect(args).toContain('libmp3lame');
        expect(args).toContain('128k');
        expect(args.at(-1)).toBe('pipe:1');
    });
});
