import { mockCourseManifest } from '../data/mockCourseManifest.js';
import '../styles/bespoke-player.css';

export const renderBespokePlayerDemo = (startingSlideIndex = 0) => {
    // If a custom container is provided (like in the Builder), use that.
    // Otherwise fallback to #app
    const app = document.querySelector('#player-mount') || document.querySelector('#app');

    // UI Structure
    app.innerHTML = `
        <div class="bespoke-player-container">
            <div class="bespoke-video-wrapper" id="bespoke-video-wrapper">
                <div id="slide-scale-layer" style="width: 1920px; height: 1080px; transform-origin: top left; position: absolute; top: 0; left: 0;">
                    <div id="slide-container" class="slide-container"></div>
                    
                    <!-- FSW Premium Watermark -->
                    <div class="player-logo-watermark logo-badge">
                        <img src="/fsw_logo_brand.png" alt="FSW" style="height: 36px; display: block;" />
                    </div>

                    <!-- Subtitles overlay -->
                    <div id="subtitle-overlay" class="subtitle-overlay glass"></div>
                </div>
                
                <!-- Controls overlay -->
                <div class="controls-overlay glass">
                    <button id="play-pause-btn" class="control-btn hover-glow">
                        <!-- Play Icon -->
                        <svg id="play-icon" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                        <!-- Pause Icon -->
                        <svg id="pause-icon" width="24" height="24" viewBox="0 0 24 24" fill="white" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    </button>
                    <div class="timeline-container" id="timeline-container">
                        <div class="timeline-tooltip" id="timeline-tooltip">Chapter Title</div>
                        <div class="timeline-bar" id="timeline-bar">
                            <div class="timeline-progress" id="timeline-progress"></div>
                        </div>
                    </div>
                    <div class="time-display" id="time-display">0:00 / 0:00</div>
                    <button id="close-btn" class="btn-secondary" style="margin-left: 1rem; font-size: 0.9rem; padding: 0.5rem 1rem;">
                        Exit Demo
                    </button>
                </div>
            </div>
        </div>
    `;

    initPlayerLogic(startingSlideIndex);
};

let isPlaying = false;
let currentSlideIndex = 0;
let slideStartTime = 0;
let animationFrameId = null;
let pausedTime = 0;

function initPlayerLogic(startingSlideIndex = 0) {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const closeBtn = document.getElementById('close-btn');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    const timelineContainer = document.getElementById('timeline-container');
    const wrapper = document.getElementById('bespoke-video-wrapper');
    const scaleLayer = document.getElementById('slide-scale-layer');

    // Slidev-inspired Absolute Scaling Engine
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const { width, height } = entry.contentRect;
            const scale = Math.min(width / 1920, height / 1080);
            scaleLayer.style.transform = `scale(${scale})`;
            
            // Center the layer perfectly within the wrapper
            const offsetX = (width - (1920 * scale)) / 2;
            const offsetY = (height - (1080 * scale)) / 2;
            scaleLayer.style.left = `${offsetX}px`;
            scaleLayer.style.top = `${offsetY}px`;
        }
    });
    resizeObserver.observe(wrapper);

    // Reset state on init
    isPlaying = false;
    currentSlideIndex = startingSlideIndex;
    slideStartTime = 0;
    pausedTime = 0;

    renderSlide(currentSlideIndex);
    updateEngine(performance.now(), true);

    playPauseBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        if (isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
            if (pausedTime > 0) {
                 slideStartTime = performance.now() - pausedTime;
                 if ('speechSynthesis' in window) window.speechSynthesis.resume();
            } else {
                 slideStartTime = performance.now();
            }
            animationFrameId = requestAnimationFrame(updateEngine);
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            cancelAnimationFrame(animationFrameId);
            pausedTime = performance.now() - slideStartTime;
            if ('speechSynthesis' in window) window.speechSynthesis.pause();
        }
    });

    closeBtn.addEventListener('click', () => {
        cancelAnimationFrame(animationFrameId);
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        window.location.href = '/';
    });

    const tooltip = document.getElementById('timeline-tooltip');

    timelineContainer.addEventListener('mousemove', (e) => {
        const rect = timelineContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, clickX / width));
        
        const totalDuration = mockCourseManifest.slides.reduce((acc, s) => acc + s.duration, 0);
        const targetTime = percentage * totalDuration;
        
        let timeAccumulator = 0;
        for (let i = 0; i < mockCourseManifest.slides.length; i++) {
            if (targetTime >= timeAccumulator && targetTime < timeAccumulator + mockCourseManifest.slides[i].duration) {
                tooltip.textContent = mockCourseManifest.slides[i].slideTitle || `Slide ${i+1}`;
                tooltip.style.left = `${percentage * 100}%`;
                tooltip.classList.add('visible');
                break;
            }
            timeAccumulator += mockCourseManifest.slides[i].duration;
        }
    });

    timelineContainer.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
    });

    let isDragging = false;
    let wasPlayingBeforeDrag = false;

    function handleScrub(e) {
        const rect = timelineContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, clickX / width));
        
        const totalDuration = mockCourseManifest.slides.reduce((acc, s) => acc + s.duration, 0);
        const targetTime = percentage * totalDuration;
        
        let timeAccumulator = 0;
        for (let i = 0; i < mockCourseManifest.slides.length; i++) {
            if (targetTime >= timeAccumulator && targetTime < timeAccumulator + mockCourseManifest.slides[i].duration) {
                if (currentSlideIndex !== i) {
                    currentSlideIndex = i;
                    renderSlide(currentSlideIndex);
                }
                pausedTime = targetTime - timeAccumulator;
                updateEngine(performance.now(), true); // Force draw frame
                break;
            }
            timeAccumulator += mockCourseManifest.slides[i].duration;
        }
    }

    timelineContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        wasPlayingBeforeDrag = isPlaying;
        if (isPlaying) {
            isPlaying = false;
            cancelAnimationFrame(animationFrameId);
            if ('speechSynthesis' in window) window.speechSynthesis.pause();
        }
        handleScrub(e);
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleScrub(e);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            if (wasPlayingBeforeDrag) {
                isPlaying = true;
                slideStartTime = performance.now() - pausedTime;
                if ('speechSynthesis' in window) window.speechSynthesis.resume();
                animationFrameId = requestAnimationFrame(updateEngine);
            }
        }
    });
}

function renderSlide(index) {
    const slide = mockCourseManifest.slides[index];
    const container = document.getElementById('slide-container');
    
    // Force reflow to restart CSS animations
    container.style.animation = 'none';
    container.offsetHeight; 
    container.style.animation = null;

    // Remove inline background overrides so CSS classes can do their job!
    container.style.background = '';
    
    const kbClass = slide.kenBurns ? `kb-${slide.kenBurns}` : '';
    let elementsHtml = `<div class="slide-background ${kbClass}" style="background-image: ${slide.background || 'none'};"></div>`;
    
    if (slide.scrim) {
        elementsHtml += `<div class="scrim-overlay"></div>`;
    }
    
    let contentHtml = '';
    slide.elements.forEach(el => {
        const animClass = el.animation ? `anim-${el.animation}` : '';
        const delayStyle = el.delay ? `animation-delay: ${el.delay}ms;` : '';
        const typoClass = el.typography || '';
        const inlineStyle = el.style ? el.style : '';

        if (el.type === 'text') {
            contentHtml += `<div class="${animClass} ${typoClass}" style="${inlineStyle}; ${delayStyle}">${el.content}</div>`;
        } else if (el.type === 'list') {
            let listHtml = `<ul class="${typoClass} list-container">`;
            el.items.forEach((item, index) => {
                const delay = (el.delay || 0) + (index * (el.stagger || 0));
                listHtml += `<li class="${animClass}" style="animation-delay: ${delay}ms;">${item}</li>`;
            });
            listHtml += `</ul>`;
            contentHtml += listHtml;
        } else if (el.type === 'callout') {
            const variantClass = el.variant ? `gamma-callout-${el.variant}` : 'gamma-callout-default';
            contentHtml += `<div class="gamma-callout ${variantClass} ${animClass}" style="${delayStyle}">
                <div class="callout-icon">${el.icon || 'ℹ️'}</div>
                <div class="callout-content p-dark">${el.content}</div>
            </div>`;
        } else if (el.type === 'info-card') {
            contentHtml += `<div class="gamma-info-card ${animClass}" style="${delayStyle}">
                <div class="info-card-title">${el.title}</div>
                <div class="info-card-content">${el.content}</div>
            </div>`;
        } else if (el.type === 'bento-grid') {
            contentHtml += `<div class="gamma-bento-grid ${animClass}" style="${delayStyle}">`;
            el.items.forEach((item, index) => {
                const itemDelay = (el.delay || 0) + (index * (el.stagger || 0));
                const spanClass = item.span ? `bento-${item.span}` : ''; // e.g. 'col-span-2'
                contentHtml += `<div class="gamma-bento-item ${spanClass}" style="animation-delay: ${itemDelay}ms;">
                    ${item.bgImage ? `<img src="${item.bgImage}" class="bento-bg-image"/>` : ''}
                    <div class="bento-title">${item.title || ''}</div>
                    <div class="bento-content">${item.content || ''}</div>
                </div>`;
            });
            contentHtml += `</div>`;
        } else if (el.type === 'feature-list') {
            contentHtml += `<div class="gamma-feature-list ${animClass}" style="${delayStyle}">`;
            el.items.forEach((item, index) => {
                const itemDelay = (el.delay || 0) + (index * (el.stagger || 0));
                contentHtml += `<div class="gamma-feature-card ${animClass}" style="animation-delay: ${itemDelay}ms;">
                    <div class="feature-title">${item.title}</div>
                    <div class="feature-content">${item.content}</div>
                </div>`;
            });
            contentHtml += `</div>`;
        } else if (el.type === 'quote') {
            contentHtml += `<div class="gamma-quote-container ${animClass}" style="${delayStyle}">
                <span class="gamma-quote">${el.content}</span>
                ${el.attribution ? `<div class="gamma-quote-attribution">${el.attribution}</div>` : ''}
            </div>`;
        } else if (el.type === 'stat') {
            contentHtml += `<div class="gamma-stat-container ${animClass}" style="${delayStyle}">
                <div class="gamma-stat-number">${el.number}</div>
                <div class="gamma-stat-label">${el.label}</div>
            </div>`;
        } else if (el.type === 'timeline') {
            contentHtml += `<div class="gamma-process-timeline ${animClass}" style="${delayStyle}">`;
            el.items.forEach((item, index) => {
                const itemDelay = (el.delay || 0) + (index * (el.stagger || 0));
                contentHtml += `<div class="timeline-step ${animClass}" style="animation-delay: ${itemDelay}ms;">
                    <div class="timeline-step-number">${index + 1}</div>
                    <div class="timeline-step-content">
                        <div class="feature-title">${item.title}</div>
                        <div class="feature-content">${item.content}</div>
                    </div>
                </div>`;
            });
            contentHtml += `</div>`;
        } else if (el.type === 'pyramid') {
            contentHtml += `<div class="gamma-pyramid ${animClass}" style="${delayStyle}">`;
            const total = el.items.length;
            el.items.forEach((item, index) => {
                const itemDelay = (el.delay || 0) + (index * (el.stagger || 0));
                const widthPct = Math.max(40, 100 - ((total - 1 - index) * (60 / Math.max(1, total - 1))));
                contentHtml += `<div class="gamma-pyramid-level ${animClass}" style="animation-delay: ${itemDelay}ms; width: ${widthPct}%;">
                    <div class="pyramid-title">${item.title}</div>
                    <div class="pyramid-content">${item.content}</div>
                </div>`;
            });
            contentHtml += `</div>`;
        } else if (el.type === 'table') {
            contentHtml += `<div class="gamma-table-container ${animClass}" style="${delayStyle}">
                <table class="gamma-data-table">
                    <thead>
                        <tr>
                            ${(el.headers || []).map(h => `<th>${h || ''}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${(el.items || []).map((item, index) => {
                            const itemDelay = (el.delay || 0) + (index * (el.stagger || 0));
                            return `<tr style="animation-delay: ${itemDelay}ms;" class="${animClass}">
                                <td>${item.col1 || ''}</td>
                                <td>${item.col2 || ''}</td>
                                <td>${item.col3 || ''}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
        } else if (el.type === 'chart') {
            contentHtml += `<div class="gamma-chart-container ${animClass}" style="${delayStyle}">
                ${(el.items || []).map((item, index) => {
                    const itemDelay = (el.delay || 0) + (index * (el.stagger || 0));
                    const val = parseInt(item.content, 10) || 0;
                    const heightPct = Math.min(100, Math.max(0, val));
                    return `<div class="gamma-chart-bar-group ${animClass}" style="animation-delay: ${itemDelay}ms;">
                        <div class="gamma-chart-value">${val}</div>
                        <div class="gamma-chart-bar-wrapper">
                            <div class="gamma-chart-bar" style="height: ${heightPct}%;"></div>
                        </div>
                        <div class="gamma-chart-label">${item.title}</div>
                    </div>`;
                }).join('')}
            </div>`;
        } else if (el.type === 'comparison') {
            contentHtml += `<div class="comparison-container ${animClass}" style="${delayStyle}; display: flex; gap: 2rem; width: 100%;">
                <div class="comparison-side" style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
                    ${el.left.title ? `<div class="h2">${el.left.title}</div>` : ''}
                    <div class="gamma-feature-card" style="border-left-color: #ef4444; height: 100%;">
                        <div class="feature-content">${el.left.content}</div>
                    </div>
                </div>
                <div class="comparison-side" style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
                    ${el.right.title ? `<div class="h2">${el.right.title}</div>` : ''}
                    <div class="gamma-feature-card" style="height: 100%;">
                        <div class="feature-content">${el.right.content}</div>
                    </div>
                </div>
            </div>`;
        } else if (el.type === 'image') {
            contentHtml += `<div class="media-focus-container ${animClass}" style="${delayStyle}; text-align: center;">
                <img src="${el.src}" style="max-width: 100%; max-height: 50vh; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
                ${el.caption ? `<div class="p" style="margin-top: 1rem; font-size: 1.2rem;">${el.caption}</div>` : ''}
            </div>`;
        }
    });
    
    elementsHtml += `<div class="slide-content-wrapper">${contentHtml}</div>`;
    
    container.innerHTML = elementsHtml;
    // ensure layout classes are applied
    const layoutClass = slide.layout ? 'layout-' + slide.layout : 'layout-default';
    const themeClass = slide.theme ? 'theme-' + slide.theme : '';
    container.className = `slide-container ${layoutClass} ${themeClass}`;

    // Silent Pre-Fetching (Inspired by Reveal.js)
    preloadNextSlideAssets(index);
}

function preloadNextSlideAssets(currentIndex) {
    if (currentIndex + 1 < mockCourseManifest.slides.length) {
        const nextSlide = mockCourseManifest.slides[currentIndex + 1];
        if (nextSlide.background && nextSlide.background !== 'none') {
            const match = nextSlide.background.match(/url\(['"]?(.*?)['"]?\)/);
            if (match && match[1]) {
                const img = new Image();
                img.src = match[1];
            }
        }
        
        // Preload any specific image elements
        if (nextSlide.elements) {
            nextSlide.elements.forEach(el => {
                if (el.type === 'image' && el.src) {
                    const img = new Image();
                    img.src = el.src;
                }
            });
        }
    }
}

function updateEngine(timestamp, forceDraw = false) {
    if (!isPlaying && !forceDraw) return;
    
    const currentSlide = mockCourseManifest.slides[currentSlideIndex];
    let elapsedInSlide = forceDraw ? pausedTime : (timestamp - slideStartTime);
    
    if (elapsedInSlide >= currentSlide.duration && isPlaying) {
        currentSlideIndex++;
        if (currentSlideIndex >= mockCourseManifest.slides.length) {
            // End of presentation
            currentSlideIndex = 0; 
            isPlaying = false;
            document.getElementById('play-icon').style.display = 'block';
            document.getElementById('pause-icon').style.display = 'none';
            pausedTime = 0;
            renderSlide(currentSlideIndex);
            updateEngine(performance.now(), true);
            return;
        } else {
            slideStartTime = timestamp;
            elapsedInSlide = 0;
            renderSlide(currentSlideIndex);
        }
    }

    // Subtitles & Audio Simulation
    const subtitleOverlay = document.getElementById('subtitle-overlay');
    const activeSubtitle = currentSlide.subtitles?.find(s => elapsedInSlide >= s.start && elapsedInSlide < s.end);
    
    if (activeSubtitle) {
        subtitleOverlay.textContent = activeSubtitle.text;
        subtitleOverlay.classList.add('active');
        
        // Simulate ElevenLabs Audio using Web Speech API
        if (activeSubtitle.text !== window._lastSpokenText && isPlaying) {
            window._lastSpokenText = activeSubtitle.text;
            if ('speechSynthesis' in window && !forceDraw) {
                window.speechSynthesis.cancel(); // Stop any current speech
                const utterance = new SpeechSynthesisUtterance(activeSubtitle.text);
                utterance.rate = 1.0;
                
                // Try to find a premium UK voice for the brand
                const voices = window.speechSynthesis.getVoices();
                const preferredVoice = voices.find(v => v.lang === 'en-GB' || v.name.includes('UK English'));
                if (preferredVoice) utterance.voice = preferredVoice;
                
                window.speechSynthesis.speak(utterance);
            }
        }
    } else {
        subtitleOverlay.classList.remove('active');
    }

    // Timeline Progress
    const totalDuration = mockCourseManifest.slides.reduce((acc, s) => acc + s.duration, 0);
    let timeAccumulator = 0;
    for (let i = 0; i < currentSlideIndex; i++) {
        timeAccumulator += mockCourseManifest.slides[i].duration;
    }
    const totalElapsed = timeAccumulator + elapsedInSlide;
    const progressPercent = (totalElapsed / totalDuration) * 100;
    
    const progressEl = document.getElementById('timeline-progress');
    if (progressEl) {
        progressEl.style.width = `${progressPercent}%`;
    }
    
    // Time Display
    const formatTime = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    const timeDisplay = document.getElementById('time-display');
    if (timeDisplay) {
        timeDisplay.textContent = `${formatTime(totalElapsed)} / ${formatTime(totalDuration)}`;
    }

    if (isPlaying) {
        animationFrameId = requestAnimationFrame(updateEngine);
    }
}
