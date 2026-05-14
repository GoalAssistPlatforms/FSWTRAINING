import { createPresentation } from '../api/gamma.js';
import { generateChatAudio } from '../api/elevenlabs.js';

export const mountTheatreMode = () => {
    // 1. Create the DOM elements
    const overlay = document.createElement('div');
    overlay.id = 'theatre-mode-overlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: #0f172a;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
    `;

    // Top Bar
    const topBar = document.createElement('div');
    topBar.style.cssText = `
        padding: 1rem 2rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(0,0,0,0.5);
        z-index: 10;
    `;

    const titleSpan = document.createElement('div');
    titleSpan.innerHTML = `
        <h3 style="margin:0; color: #38bdf8;">🎬 Theatre Mode (AI Generation Demo)</h3>
        <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: #94a3b8;">Click the button below to generate a real Gamma slide and ElevenLabs audio on the fly.</p>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = "Exit Demo";
    closeBtn.style.cssText = `
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
    `;

    topBar.appendChild(titleSpan);
    topBar.appendChild(closeBtn);

    // Input Area
    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
        display: flex;
        gap: 1rem;
        padding: 1rem 2rem;
        background: rgba(255,255,255,0.05);
        align-items: center;
        justify-content: center;
    `;

    const generateBtn = document.createElement('button');
    generateBtn.innerHTML = `✨ Generate Demo with Gamma & 11Labs API`;
    generateBtn.style.cssText = `background: #10b981; color: white; border: none; padding: 0.75rem 2rem; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1.1rem;`;

    inputArea.appendChild(generateBtn);

    // Main Content Area (Gamma iframe + Audio element)
    const contentArea = document.createElement('div');
    contentArea.style.cssText = `
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #000;
    `;

    const loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = `
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.8);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 20;
    `;
    loadingOverlay.innerHTML = `<h2 style="color: #38bdf8;">Generating Assets...</h2><p style="color: #94a3b8;">Calling Gamma and ElevenLabs APIs. This usually takes about 30 seconds.</p>`;

    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = `
        width: 100%;
        height: 100%;
        max-width: 1200px;
        margin: 0 auto;
        position: relative;
    `;

    const gammaIframe = document.createElement('iframe');
    gammaIframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        border-radius: 8px;
    `;

    iframeContainer.appendChild(gammaIframe);
    contentArea.appendChild(iframeContainer);
    contentArea.appendChild(loadingOverlay);

    // Audio Element (Hidden but drives logic)
    const audioElement = document.createElement('audio');
    
    // Bottom Controls
    const bottomControls = document.createElement('div');
    bottomControls.style.cssText = `
        padding: 1.5rem;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 1rem;
        background: rgba(0,0,0,0.8);
        border-top: 1px solid #334155;
    `;

    const playBtn = document.createElement('button');
    playBtn.textContent = "▶ Play Demo";
    playBtn.style.cssText = `
        background: #0ea5e9;
        color: white;
        border: none;
        padding: 0.75rem 2rem;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: bold;
        cursor: pointer;
        display: none;
    `;

    const statusText = document.createElement('span');
    statusText.textContent = "Waiting to generate assets...";
    statusText.style.color = "#94a3b8";

    bottomControls.appendChild(playBtn);
    bottomControls.appendChild(statusText);

    overlay.appendChild(topBar);
    overlay.appendChild(inputArea);
    overlay.appendChild(contentArea);
    overlay.appendChild(bottomControls);

    // 3. Logic Functions
    generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        generateBtn.style.opacity = '0.5';
        loadingOverlay.style.display = 'flex';
        statusText.textContent = "Calling APIs...";

        try {
            // Define mock content
            const topic = "Guided Presentations vs Reading";
            const script = "This presentation explains why guided, audio-synced presentations are significantly better for user retention and engagement than traditional manual scrolling courses. They reduce cognitive load and dictate pacing.";
            const audioText = "Welcome to the real-time API demo. This audio track was generated entirely on the fly using the Eleven Labs API. The presentation you see above was just generated using the Gamma AI API. Notice how immersive the experience is when a premium voiceover accompanies crisp, professional slides. When this audio finishes, the system will automatically advance to the next slide.";

            // Run API calls in parallel
            const [gammaUrl, audioUrl] = await Promise.all([
                createPresentation(topic, script),
                generateChatAudio(audioText) // Using ChatAudio so it doesn't upload to your real DB bucket
            ]);

            if (gammaUrl) {
                let embedUrl = gammaUrl;
                if (embedUrl.includes('/docs/')) embedUrl = embedUrl.replace('/docs/', '/embed/');
                // Ensure we don't have ?mode=doc to force presentation mode instead of scroll
                embedUrl = embedUrl.replace('?mode=doc', '');
                gammaIframe.src = embedUrl;
            } else {
                alert("Gamma generation failed. Using fallback.");
                gammaIframe.src = "https://gamma.app/embed/fallback-url"; // Fallback if API fails
            }

            if (audioUrl) {
                audioElement.src = audioUrl;
                playBtn.style.display = 'block';
                statusText.textContent = "Assets generated successfully! Click Play.";
            } else {
                alert("ElevenLabs generation failed. Check your API keys.");
                statusText.textContent = "Audio failed to generate.";
            }

        } catch (error) {
            console.error(error);
            alert("Error generating assets. Check console.");
        } finally {
            loadingOverlay.style.display = 'none';
            generateBtn.style.display = 'none'; // Hide button after generating
        }
    });

    let isPlaying = false;

    playBtn.addEventListener('click', () => {
        if (!audioElement.src) return;

        if (isPlaying) {
            audioElement.pause();
            playBtn.textContent = "▶ Play Audio";
            isPlaying = false;
        } else {
            audioElement.play().catch(e => alert("Audio playback failed. Please check the URL."));
            playBtn.textContent = "⏸ Pause Audio";
            isPlaying = true;
        }
    });

    audioElement.addEventListener('ended', () => {
        isPlaying = false;
        playBtn.textContent = "▶ Replay Audio";
        statusText.textContent = "Audio finished! (This is where the system automatically triggers the next slide).";
        
        // Visual cue
        gammaIframe.style.opacity = '0.5';
        setTimeout(() => { gammaIframe.style.opacity = '1'; }, 500);
    });

    audioElement.addEventListener('timeupdate', () => {
        if (audioElement.duration) {
            const progress = (audioElement.currentTime / audioElement.duration) * 100;
            statusText.textContent = `Audio Playing: ${Math.round(progress)}%`;
        }
    });

    closeBtn.addEventListener('click', () => {
        audioElement.pause();
        audioElement.src = '';
        document.body.removeChild(overlay);
    });

    // Initialize
    document.body.appendChild(overlay);
};
