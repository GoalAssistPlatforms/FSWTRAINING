const STORAGE_PREFIX = 'fsw-slide-progress:';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function simpleHash(value) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
}

export function getInitialFurthestSlide({ storedIndex = 0, slideCount = 0, hasLaterUnlockedLesson = false }) {
    if (slideCount <= 0) return 0;
    if (hasLaterUnlockedLesson) return slideCount - 1;
    return clamp(Number.isFinite(Number(storedIndex)) ? Number(storedIndex) : 0, 0, slideCount - 1);
}

export function canNavigateToSlide(targetIndex, furthestUnlockedIndex, slideCount) {
    return Number.isInteger(targetIndex)
        && targetIndex >= 0
        && targetIndex < slideCount
        && targetIndex <= furthestUnlockedIndex;
}

function getStorageKey(audioElements) {
    const identity = Array.from(audioElements)
        .map(audio => audio.currentSrc || audio.src || '')
        .join('|');
    return `${STORAGE_PREFIX}${simpleHash(identity)}`;
}

function hasLaterUnlockedLesson() {
    const lessonButtons = Array.from(document.querySelectorAll('.lesson-btn'));
    const activeIndex = lessonButtons.findIndex(button => button.classList.contains('active'));
    if (activeIndex < 0) return false;

    return lessonButtons.slice(activeIndex + 1).some(button => !button.disabled && !button.classList.contains('locked'));
}

function createNavigationButton(id, label, svgPoints) {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.style.cssText = 'background: rgba(255,255,255,0.08); color: white; border: 1px solid rgba(255,255,255,0.14); width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity 0.2s ease, background 0.2s ease; flex-shrink: 0;';
    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="${svgPoints}"/></svg>`;
    return button;
}

function setButtonEnabled(button, enabled) {
    button.disabled = !enabled;
    button.style.opacity = enabled ? '1' : '0.3';
    button.style.cursor = enabled ? 'pointer' : 'not-allowed';
    button.style.pointerEvents = enabled ? 'auto' : 'none';
}

function enhanceLearnerControls(controls) {
    if (!controls || controls.dataset.slideNavigationEnhanced === 'true') return;

    const audioElements = Array.from(document.querySelectorAll('.track-audio'));
    const playButton = document.getElementById('user-play-pause-btn');
    const slideNumber = document.getElementById('user-slide-number');
    if (!playButton || !slideNumber || audioElements.length === 0) return;

    controls.dataset.slideNavigationEnhanced = 'true';

    const previousButton = createNavigationButton('user-prev-slide-btn', 'Previous slide', '15 18 9 12 15 6');
    const nextButton = createNavigationButton('user-next-slide-btn', 'Next slide', '9 18 15 12 9 6');

    controls.insertBefore(previousButton, playButton);
    slideNumber.insertAdjacentElement('afterend', nextButton);

    const storageKey = getStorageKey(audioElements);
    const storedIndex = Number.parseInt(localStorage.getItem(storageKey) || '0', 10);
    let furthestUnlockedIndex = getInitialFurthestSlide({
        storedIndex,
        slideCount: audioElements.length,
        hasLaterUnlockedLesson: hasLaterUnlockedLesson()
    });
    let currentIndex = 0;

    const persistFurthest = () => {
        try {
            localStorage.setItem(storageKey, String(furthestUnlockedIndex));
        } catch (error) {
            console.warn('Could not persist slide review progress:', error);
        }
    };

    const updateNavigationState = () => {
        setButtonEnabled(previousButton, currentIndex > 0);
        setButtonEnabled(nextButton, canNavigateToSlide(currentIndex + 1, furthestUnlockedIndex, audioElements.length));
    };

    const activateSlide = async targetIndex => {
        if (!canNavigateToSlide(targetIndex, furthestUnlockedIndex, audioElements.length)) return false;

        audioElements.forEach((audio, index) => {
            if (index !== targetIndex && !audio.paused) audio.pause();
        });

        const targetAudio = audioElements[targetIndex];
        currentIndex = targetIndex;
        targetAudio.currentTime = 0;
        updateNavigationState();

        try {
            await targetAudio.play();
        } catch (error) {
            console.log('Slide narration playback was blocked:', error);
        }
        return true;
    };

    previousButton.addEventListener('click', () => {
        activateSlide(currentIndex - 1);
    });

    nextButton.addEventListener('click', () => {
        activateSlide(currentIndex + 1);
    });

    audioElements.forEach((audio, index) => {
        audio.addEventListener('play', () => {
            currentIndex = index;
            updateNavigationState();
        });

        audio.addEventListener('ended', () => {
            if (index < audioElements.length - 1) {
                furthestUnlockedIndex = Math.max(furthestUnlockedIndex, index + 1);
                persistFurthest();
            }
            updateNavigationState();
        });
    });

    persistFurthest();
    updateNavigationState();
}

function scanForLearnerControls(root = document) {
    const controls = root.querySelector?.('#user-audio-controls');
    if (controls) enhanceLearnerControls(controls);
}

export function initCourseSlideNavigation() {
    scanForLearnerControls();

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.id === 'user-audio-controls') {
                    enhanceLearnerControls(node);
                    return;
                }
                const controls = node.querySelector?.('#user-audio-controls');
                if (controls) {
                    enhanceLearnerControls(controls);
                    return;
                }
            }
        }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    if (!window.__fswCourseSlideNavigationInitialised) {
        window.__fswCourseSlideNavigationInitialised = true;
        initCourseSlideNavigation();
    }
}
