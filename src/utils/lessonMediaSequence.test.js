import { describe, expect, it, vi } from 'vitest';
import {
    advanceSlideWhenAudioEnds,
    getFollowingSlideNumber
} from './lessonMediaSequence.js';

describe('lesson media sequencing', () => {
    it('targets the slide immediately after the audio track that ended', () => {
        expect(getFollowingSlideNumber(0, 10)).toBe(2);
        expect(getFollowingSlideNumber(4, 10)).toBe(6);
        expect(getFollowingSlideNumber(9, 10)).toBeNull();
    });

    it('renders the next slide before starting its narration', async () => {
        const events = [];
        let finishRender;
        const renderComplete = new Promise(resolve => {
            finishRender = resolve;
        });
        const showSlide = vi.fn(async slideNumber => {
            events.push(`show ${slideNumber}`);
            await renderComplete;
            events.push(`rendered ${slideNumber}`);
        });
        const nextAudio = {
            play: vi.fn(async () => {
                events.push('play audio');
            })
        };
        const activateTrack = vi.fn(index => events.push(`activate ${index}`));

        const advancing = advanceSlideWhenAudioEnds({
            audioIndex: 0,
            totalSlides: 3,
            audioElements: [{}, nextAudio],
            showSlide,
            activateTrack
        });

        await Promise.resolve();
        expect(nextAudio.play).not.toHaveBeenCalled();
        finishRender();
        const result = await advancing;

        expect(result).toEqual({
            advanced: true,
            slideNumber: 2,
            nextAudioStarted: true
        });
        expect(events).toEqual(['show 2', 'rendered 2', 'activate 1', 'play audio']);
    });

    it('still advances the slide when browser playback is blocked', async () => {
        const playbackError = new Error('Autoplay blocked');
        const onPlaybackError = vi.fn();
        const showSlide = vi.fn().mockResolvedValue(undefined);

        const result = await advanceSlideWhenAudioEnds({
            audioIndex: 1,
            totalSlides: 4,
            audioElements: [{}, {}, { play: vi.fn().mockRejectedValue(playbackError) }],
            showSlide,
            onPlaybackError
        });

        expect(showSlide).toHaveBeenCalledWith(3);
        expect(onPlaybackError).toHaveBeenCalledWith(playbackError, 2);
        expect(result.advanced).toBe(true);
        expect(result.nextAudioStarted).toBe(false);
    });
});
