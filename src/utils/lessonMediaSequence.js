export function getFollowingSlideNumber(audioIndex, totalSlides) {
    if (!Number.isInteger(audioIndex) || audioIndex < 0) return null;
    if (!Number.isInteger(totalSlides) || totalSlides < 1) return null;

    const followingSlide = audioIndex + 2;
    return followingSlide <= totalSlides ? followingSlide : null;
}

export async function advanceSlideWhenAudioEnds({
    audioIndex,
    totalSlides,
    audioElements,
    showSlide,
    activateTrack = () => {},
    onPlaybackError = () => {}
}) {
    const followingSlide = getFollowingSlideNumber(audioIndex, totalSlides);
    if (!followingSlide) {
        return { advanced: false, slideNumber: null, nextAudioStarted: false };
    }

    await showSlide(followingSlide);

    const nextAudioIndex = audioIndex + 1;
    const nextAudio = audioElements?.[nextAudioIndex];
    let nextAudioStarted = false;

    if (nextAudio) {
        activateTrack(nextAudioIndex);
        try {
            await nextAudio.play();
            nextAudioStarted = true;
        } catch (error) {
            onPlaybackError(error, nextAudioIndex);
        }
    }

    return {
        advanced: true,
        slideNumber: followingSlide,
        nextAudioStarted
    };
}
