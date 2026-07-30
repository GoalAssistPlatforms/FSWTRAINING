import { updateCourse } from '../../api/courses.js';
import { supabase } from '../../api/supabase.js';

const logDebug = (msg) => console.log("[DEBUG]", msg);


export const renderSimulationPlayer = (course, user, embeddedContainerId = null) => {

    const isEmbedded = !!embeddedContainerId;

    // Parse content
    const content = typeof course.content_json === 'string'
        ? JSON.parse(course.content_json)
        : course.content_json;

    // Use specific container or take over the app screen
    const appEl = embeddedContainerId ? document.getElementById(embeddedContainerId) : document.getElementById('app');

    const finishSimulation = async () => {
        // Log progression in DB for all roles (allows testing/assignment completion)
        logDebug("finishSimulation started");
        try {
            logDebug("Checking user and course...");
            if (user && user.id && course && course.id) {
                logDebug(`user_id: ${user.id}, course_id: ${course.id}`);
                logDebug("Querying user_progress...");
                const { data: existing, error: selectError } = await supabase
                    .from('user_progress')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('course_id', course.id)
                    .maybeSingle();

                logDebug(`Query finished. Existing: ${JSON.stringify(existing)}, Error: ${JSON.stringify(selectError)}`);
                if (selectError) throw selectError;

                if (existing) {
                    logDebug("Updating existing user_progress...");
                    const { error: updateError } = await supabase
                        .from('user_progress')
                        .update({
                            status: 'completed',
                            completed_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);
                    logDebug(`Update finished. Error: ${JSON.stringify(updateError)}`);
                    if (updateError) throw updateError;
                } else {
                    logDebug("Inserting new user_progress...");
                    const { error: insertError } = await supabase
                        .from('user_progress')
                        .insert([{
                            user_id: user.id,
                            course_id: course.id,
                            status: 'completed',
                            completed_at: new Date().toISOString()
                        }]);
                    logDebug(`Insert finished. Error: ${JSON.stringify(insertError)}`);
                    if (insertError) throw insertError;
                }

                // Show green Completed badge in the header container
                const container = document.getElementById('guide-complete-status-container');
                if (container) {
                    container.innerHTML = `<span style="color: #10b981; font-weight: bold; font-size: 0.9rem; display: flex; align-items: center; gap: 4px;">✓ Completed</span>`;
                }
            } else {
                logDebug("User or user.id is missing!");
            }
        } catch (e) {
            logDebug(`Catch block triggered! Error: ${e.message || JSON.stringify(e)}`);
            console.error('Failed to log guide progress:', e);
            alert('Failed to save progress: ' + (e.message || JSON.stringify(e)));
            throw e;
        }
    };

    if (content && content.type === 'video_walkthrough') {
        return renderVideoTimelinePlayer(content, course, user, appEl, isEmbedded, () => finishSimulation());
    }

    const slides = content.slides || [];
    let currentSlide = 0;

    // Create a generic beep sound (Data URI)
    const errorBeep = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='); // Stub for silence or base64 beep. We'll use Web Audio API for a real beep.

    const playErrorBeep = () => {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = 180; // low frequency buzz
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    };

    const playSuccessChime = () => {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'triangle';
        oscillator.frequency.value = 880; // High frequency chime
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.4);
    };

    const renderSlide = () => {
        if (currentSlide >= slides.length) {
            return finishSimulation();
        }

        const slide = slides[currentSlide];

        let html = `
            <div id="sim-container" style="${isEmbedded ? 'position: relative; width: 100%; min-height: 480px; aspect-ratio: 16/9; background: #000; overflow: hidden; display: flex; flex-direction: column; border-radius: 12px; margin-top: 20px; margin-bottom: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);' : 'position: fixed; inset: 0; background: #000; z-index: 1000; overflow: hidden; display: flex; flex-direction: column;'}">

                <!-- HUD -->
                <div style="background: rgba(0,0,0,0.8); border-bottom: 1px solid rgba(255,255,255,0.1); padding: ${isEmbedded ? '0.5rem 1rem' : '1rem 2rem'}; display: flex; justify-content: space-between; align-items: center; z-index: 10; position: relative;">
                    <!-- Progress Bar Background -->
                    <div style="position: absolute; top: 0; left: 0; height: 3px; background: rgba(16, 185, 129, 0.2); width: 100%;"></div>
                    <!-- Progress Bar Fill -->
                    <div style="position: absolute; top: 0; left: 0; height: 3px; background: #10b981; width: ${((currentSlide + 1) / slides.length) * 100}%; transition: width 0.3s ease;"></div>

                    <div style="display: flex; align-items: center; gap: ${isEmbedded ? '0.5rem' : '1rem'};">
                        ${isEmbedded
                            ? `<button id="sim-fullscreen-btn" class="btn-ghost" style="padding: 0.3rem 0.6rem; color: #34a853; border: 1px solid rgba(52, 168, 83, 0.3); font-size: 0.8rem; border-radius: 4px;">⛶ Fullscreen</button>`
                            : `<button id="sim-exit-btn" class="btn-ghost" style="padding: 0.5rem; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">Exit</button>`}
                        ${currentSlide > 0 ? `<button id="sim-back-btn" class="btn-ghost" style="padding: 0.4rem 0.8rem; color: var(--text-muted); border: 1px solid rgba(255, 255, 255, 0.2); font-size: ${isEmbedded ? '0.8rem' : '0.9rem'};">Back</button>` : ''}
                        <h3 style="margin: 0; color: white; font-size: ${isEmbedded ? '0.9rem' : '1.2rem'};">${course.title}</h3>
                        <span style="color: var(--text-muted); font-size: ${isEmbedded ? '0.7rem' : '0.9rem'};">(Step ${currentSlide + 1} of ${slides.length})</span>
                    </div>
                    <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; color: #10b981; padding: ${isEmbedded ? '0.3rem 0.8rem' : '0.5rem 1rem'}; border-radius: 8px; font-weight: bold; max-width: 50%; text-align: center; box-shadow: 0 0 10px rgba(16, 185, 129, 0.2); font-size: ${isEmbedded ? '0.8rem' : '1rem'};">
                        ${slide.instruction}
                    </div>
                </div>

                <!-- Main Viewport -->
                <div id="sim-viewport" class="sim-viewport-transition" style="flex: 1; position: relative; display: flex; justify-content: center; align-items: center; background: #000; overflow: hidden; opacity: 0; animation: simFadeIn 0.3s forwards;">
                     <img id="sim-img" src="${slide.imageUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain; pointer-events: none; user-select: none;">
                     <div id="sim-hotspot" style="position: absolute; border: 3px solid rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.1); cursor: pointer;">
                        <div style="position: absolute; inset: -4px; border: 2px solid transparent; border-radius: 4px; animation: simPulse 2s infinite;"></div>
                     </div>
                     ${slide.teachingText ? `
                     <!-- Teaching Text Popup -->
                     <div id="sim-popup" style="position: absolute; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; width: 280px; color: white; font-size: 0.9rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5); pointer-events: none; z-index: 5; opacity: 0; transition: opacity 0.3s, transform 0.3s; transform: scale(0.95); margin: 12px; line-height: 1.4;">
                        <div style="font-weight: bold; margin-bottom: 0.5rem; color: #10b981; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 0.5rem;">
                            Step ${currentSlide + 1}
                        </div>
                        ${slide.teachingText.replace(/\n/g, '<br>')}
                     </div>` : ''}
                </div>
            </div>

            <style>
                @keyframes simPulse {
                    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                    70% { box-shadow: 0 0 0 15px rgba(16, 185, 129, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }
                @keyframes simFadeIn {
                    to { opacity: 1; }
                }
                @keyframes simShake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                    20%, 40%, 60%, 80% { transform: translateX(5px); }
                }
                .shake { animation: simShake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
                .shake { animation: simShake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
                ${isEmbedded ? '' : '/* Hide global scrollbars while simulating fullscreen */\nbody { overflow: hidden !important; }'}
            </style>
        `;

        appEl.innerHTML = html;

        // BIND EVENTS
        const simContainer = document.getElementById('sim-container');
        const simViewport = document.getElementById('sim-viewport');
        const imgEl = document.getElementById('sim-img');
        const hotspotEl = document.getElementById('sim-hotspot');
        const exitBtn = document.getElementById('sim-exit-btn');
        const fsBtn = document.getElementById('sim-fullscreen-btn');
        const backBtn = document.getElementById('sim-back-btn');

        if (exitBtn) {
            exitBtn.addEventListener('click', () => {
                document.body.style.overflow = '';
                window.location.href = '/?tab=guides';
            });
        }

        if (fsBtn) {
            fsBtn.addEventListener('click', async () => {
                // Kill embedded instance
                window.removeEventListener('resize', positionHotspot);
                appEl.innerHTML = ``;

                // Launch global course player override
                const { renderCoursePlayer } = await import('../CoursePlayer.js');
                renderCoursePlayer(course, user);
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.removeEventListener('resize', positionHotspot);
                currentSlide--;
                renderSlide();
            });
        }

        // Wait for image to load to position the hotspot relative to its actual rendered bounds
        imgEl.onload = () => {
            positionHotspot();
        };

         const positionHotspot = () => {
             // The image might be pillarboxed or letterboxed due to object-fit: contain.
             // We need to find its actual rendered footprint inside the bounding box.
             const imgRect = imgEl.getBoundingClientRect();
             const viewportRect = simViewport.getBoundingClientRect();
             const b = slide.box;

             // Calculate true scale ratio of the image
             const scale = Math.min(imgRect.width / imgEl.naturalWidth, imgRect.height / imgEl.naturalHeight);

             // Visual dimensions of the image pixel data
             const renderedWidth = imgEl.naturalWidth * scale;
             const renderedHeight = imgEl.naturalHeight * scale;

             // Calculate empty letterbox padding
             const padLeft = (imgRect.width - renderedWidth) / 2;
             const padTop = (imgRect.height - renderedHeight) / 2;

             // Map relative hotspot to the pixel footprint, adjusted for viewport offset
             const relLeft = imgRect.left - viewportRect.left;
             const relTop = imgRect.top - viewportRect.top;

             const hotLeft = relLeft + padLeft + (b.rx * renderedWidth);
             const hotTop = relTop + padTop + (b.ry * renderedHeight);
             const hotWidth = b.rw * renderedWidth;
             const hotHeight = b.rh * renderedHeight;

             hotspotEl.style.left = hotLeft + 'px';
             hotspotEl.style.top = hotTop + 'px';
             hotspotEl.style.width = hotWidth + 'px';
             hotspotEl.style.height = hotHeight + 'px';

             // Position Teaching Text Popup
             const popupEl = document.getElementById('sim-popup');
             if (popupEl) {
                 const screenWidth = viewportRect.width;
                 const screenHeight = viewportRect.height;

                 // Smart lateral positioning: try to place right of the hotspot, otherwise left.
                 if (hotLeft + hotWidth + 300 < screenWidth) {
                     // Plenty of room on the right
                     popupEl.style.left = (hotLeft + hotWidth) + 'px';
                     popupEl.style.right = 'auto';
                 } else {
                     // Forced to pop up on the left
                     popupEl.style.right = (screenWidth - hotLeft) + 'px';
                     popupEl.style.left = 'auto';
                 }

                 // Vertical positioning
                 if (hotTop + 200 > screenHeight) {
                     popupEl.style.bottom = (screenHeight - hotTop - hotHeight) + 'px';
                     popupEl.style.top = 'auto';
                 } else {
                     popupEl.style.top = hotTop + 'px';
                     popupEl.style.bottom = 'auto';
                 }

                 // Animate in shortly after rendering
                 setTimeout(() => {
                     popupEl.style.opacity = '1';
                     popupEl.style.transform = 'scale(1)';
                 }, 150);
             }
        };

        window.addEventListener('resize', positionHotspot);

        const handleClick = (e) => {
             // Prevent UI buttons routing clicks to the viewport canvas
             if (e.target.closest('#sim-exit-btn') || e.target.closest('#sim-back-btn')) return;

             // Did they hit the hotspot?
             const clickX = e.clientX;
             const clickY = e.clientY;

             const spotRect = hotspotEl.getBoundingClientRect();

             if (clickX >= spotRect.left && clickX <= spotRect.right &&
                 clickY >= spotRect.top && clickY <= spotRect.bottom) {

                 // SUCCESS
                 // Visual spark indicator over cursor
                 const spark = document.createElement('div');
                 spark.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                 spark.style.position = 'absolute';
                 spark.style.left = (clickX - 14) + 'px';
                 spark.style.top = (clickY - 14) + 'px';
                 spark.style.zIndex = '99999';
                 spark.style.filter = 'drop-shadow(0 0 8px rgba(16, 185, 129, 1))';
                 spark.style.animation = 'simFadeIn 0.2s forwards';
                 simContainer.appendChild(spark);

                 playSuccessChime();
                 window.removeEventListener('resize', positionHotspot);

                 setTimeout(() => {
                     currentSlide++;
                     renderSlide();
                 }, 400); // Wait for chime and checkmark spark
                 simViewport.removeEventListener('click', handleClick); // Prevent dbl click
             } else {
                 // FAIL
                 playErrorBeep();

                 // Shake Animation
                 simViewport.classList.remove('shake');
                 void simViewport.offsetWidth; // trigger reflow
                 simViewport.classList.add('shake');

                 // Show simple toast locally
                 const existingToast = document.getElementById('sim-toast');
                 if (existingToast) existingToast.remove();

                 const toast = document.createElement('div');
                 toast.id = 'sim-toast';
                 toast.innerText = 'Incorrect click area. Please review the instruction and pop-up context.';
                 toast.style.position = 'absolute';
                 toast.style.top = isEmbedded ? '60px' : '80px';
                 toast.style.left = '50%';
                 toast.style.transform = 'translateX(-50%)';
                 toast.style.background = 'rgba(239, 68, 68, 0.9)';
                 toast.style.backdropFilter = 'blur(4px)';
                 toast.style.color = 'white';
                 toast.style.padding = '8px 20px';
                 toast.style.borderRadius = '20px';
                 toast.style.zIndex = '99999';
                 toast.style.fontWeight = 'bold';
                 toast.style.fontSize = '0.9rem';
                 toast.style.animation = 'simFadeIn 0.2s forwards';
                 simContainer.appendChild(toast);
                 setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
             }
        };

        // Core Click Logic - Note: Added to capture phase in case nested elements intercept
        simViewport.addEventListener('click', handleClick);

        // Ensure fallback positioning just in case it's instantly cached
        if (imgEl.complete) {
            positionHotspot();
        }
    };

    // finishSimulation moved to top of renderSimulationPlayer

    // Initialize
    renderSlide();
};

const renderVideoTimelinePlayer = (content, course, user, appEl, isEmbedded, finishSimulation) => {
    const steps = content.steps || [];
    const videoUrl = content.videoUrl;
    const shouldApplyDynamicEdits = content.renderStatus !== 'ready';
    const videoEdits = shouldApplyDynamicEdits
        ? (content.videoEdits || { trimStart: 0, trimEnd: null, cuts: [] })
        : { trimStart: 0, trimEnd: null, cuts: [] };
    const trimStart = Number.isFinite(Number(videoEdits.trimStart)) ? Number(videoEdits.trimStart) : 0;
    const configuredTrimEnd = videoEdits.trimEnd === null || videoEdits.trimEnd === undefined
        ? null
        : Number(videoEdits.trimEnd);
    const orderedCuts = Array.isArray(videoEdits.cuts)
        ? videoEdits.cuts
            .map(cut => ({ start: Number(cut.start), end: Number(cut.end) }))
            .filter(cut => Number.isFinite(cut.start) && Number.isFinite(cut.end) && cut.start < cut.end)
            .sort((a, b) => a.start - b.start)
        : [];

    const formatTime = (sec) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    let html = `
        <div id="sim-container" style="${isEmbedded ? 'position: relative; width: 100%; min-height: 520px; background: #000; overflow: hidden; display: flex; flex-direction: column; border-radius: 12px; margin-top: 20px; margin-bottom: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);' : 'position: fixed; inset: 0; background: #000; z-index: 1000; overflow: hidden; display: flex; flex-direction: column;'}">

            <!-- HUD -->
            <div style="background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 0.75rem 1.5rem; display: flex; justify-content: space-between; align-items: center; z-index: 10; position: relative;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    ${isEmbedded
                        ? `<button id="sim-fullscreen-btn" class="btn-ghost" style="padding: 0.3rem 0.6rem; color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.8rem; border-radius: 4px; cursor: pointer;">⛶ Fullscreen</button>`
                        : `<button id="sim-exit-btn" class="btn-ghost" style="padding: 0.5rem 1rem; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); cursor: pointer; border-radius: 4px;">Exit Guide</button>`}
                    <h3 style="margin: 0; color: white; font-size: ${isEmbedded ? '0.9rem' : '1.2rem'};">${course.title}</h3>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div id="guide-complete-status-container" style="display: flex; align-items: center;"></div>
                    <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; color: #10b981; padding: 0.4rem 1rem; border-radius: 20px; font-size: 0.8rem; font-weight: bold;">
                        Timeline Mode
                    </div>
                </div>
            </div>

            <!-- Split Viewport -->
            <div id="sim-split-viewport" style="display: flex; flex: 1; overflow: hidden; flex-direction: ${isEmbedded ? 'column' : 'row'};">

                <!-- Left Pane: Video walkthrough player -->
                <div style="flex: 3; position: relative; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; border-right: ${isEmbedded ? 'none' : '1px solid rgba(255,255,255,0.1)'}; border-bottom: ${isEmbedded ? '1px solid rgba(255,255,255,0.1)' : 'none'};">
                    <video id="walkthrough-video" src="${videoUrl}" controls style="width: 100%; height: 100%; object-fit: contain; max-height: ${isEmbedded ? '360px' : 'none'};"></video>

                    <!-- Caption overlay -->
                    <div id="walkthrough-caption" class="caption-pill">
                        <div class="caption-header">
                            <div style="display: flex; align-items: center;">
                                <span class="radar-dot"></span>
                                <span class="caption-label">Active Step Guidance</span>
                            </div>
                            <span id="caption-step-number" class="caption-step-count">STEP 1 OF 4</span>
                        </div>
                        <span id="caption-text"></span>
                    </div>
                </div>

                <!-- Right Pane: Timeline Steps -->
                <div style="flex: 1; background: rgba(15, 23, 42, 0.85); display: flex; flex-direction: column; overflow: hidden; min-width: 300px;">
                    <div style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2); display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; color: var(--primary); font-size: 0.9rem;">📍 Walkthrough Timeline</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${steps.length} Steps</span>
                    </div>
                    <div id="timeline-list" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
                        ${steps.map((s, idx) => `
                            <div class="timeline-card" data-index="${idx}" data-time="${s.sourceTimestamp ?? s.timestamp}" style="padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.25); cursor: pointer; transition: all 0.2s ease; position: relative;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                                    <span class="step-num" style="font-weight: bold; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Step ${idx + 1}</span>
                                    <span style="font-family: monospace; font-size: 0.75rem; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: var(--text-muted);">${formatTime(s.timestamp)}</span>
                                </div>
                                <div class="step-instruction" style="font-weight: 600; color: white; font-size: 0.9rem; margin-bottom: 0.25rem;">${s.instruction}</div>
                                <div class="step-desc" style="color: var(--text-muted); font-size: 0.8rem; line-height: 1.4;">${s.teachingText.replace(/\n/g, '<br>')}</div>

                                <div class="active-indicator" style="position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #10b981; border-top-left-radius: 8px; border-bottom-left-radius: 8px; opacity: 0; transition: opacity 0.2s;"></div>
                            </div>
                        `).join('')}
                    </div>
                </div>

            </div>

        </div>

        <style>
            .timeline-card:hover {
                background: rgba(255,255,255,0.03) !important;
                border-color: rgba(255,255,255,0.1) !important;
            }
            .timeline-card.active {
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.03) 100%) !important;
                border-color: rgba(16, 185, 129, 0.8) !important;
                box-shadow: 0 8px 24px rgba(16, 185, 129, 0.15);
            }
            .timeline-card.active .step-num {
                background: #10b981 !important;
                color: #000 !important;
                font-weight: 800;
                padding: 1px 6px;
                border-radius: 4px;
            }
            .timeline-card.active .active-indicator {
                opacity: 1 !important;
            }
            ${isEmbedded ? '' : 'body { overflow: hidden !important; }'}

            @keyframes pulse-ring {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }

            /* Hide native video controls fullscreen button */
            #walkthrough-video::-webkit-media-controls-fullscreen-button {
                display: none !important;
            }
            #walkthrough-video::-fullscreen-button {
                display: none !important;
            }

            /* Radar dot styling */
            .radar-dot {
                display: inline-block;
                width: 8px;
                height: 8px;
                background: #10b981;
                border-radius: 50%;
                box-shadow: 0 0 12px #10b981;
                margin-right: 0.5rem;
                animation: pulse-ring 1.5s infinite;
            }

            /* Responsive floating caption pill */
            .caption-pill {
                position: absolute;
                top: 12px;
                left: 50%;
                transform: translate(-50%, 0) scale(0.95);
                width: 90%;
                max-width: 500px;
                background: rgba(15, 23, 42, 0.9);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                color: white;
                border-radius: 8px;
                border: 1px solid rgba(16, 185, 129, 0.45);
                border-left: 4px solid #10b981;
                padding: 0.6rem 1rem;
                text-align: left;
                box-shadow: 0 8px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
                display: none;
                transition: opacity 0.3s, transform 0.3s;
                opacity: 0;
                pointer-events: none;
                z-index: 100;
            }
            .caption-pill.show {
                transform: translate(-50%, 0) scale(1) !important;
            }
            .caption-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 0.3rem;
                border-bottom: 1px solid rgba(255,255,255,0.08);
                padding-bottom: 0.3rem;
            }
            .caption-label {
                font-size: 0.65rem;
                color: #10b981;
                text-transform: uppercase;
                font-weight: 800;
                letter-spacing: 1px;
            }
            .caption-step-count {
                font-size: 0.65rem;
                color: var(--text-muted);
                font-weight: 600;
                font-family: monospace;
            }
            #caption-text {
                font-size: 0.9rem;
                font-weight: 700;
                color: white;
                line-height: 1.35;
                display: block;
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }

            /* Force hide the caption overlay in normal embedded mode since the timeline steps list is already visible below the video */
            #sim-container:not(.is-fullscreen) .caption-pill {
                display: none !important;
            }

            /* Fullscreen styling overrides for sim-container */
            #sim-container:fullscreen {
                width: 100vw !important;
                height: 100vh !important;
                max-width: none !important;
                max-height: none !important;
                border-radius: 0 !important;
                border: none !important;
            }
            #sim-container:fullscreen #sim-split-viewport {
                flex-direction: row !important;
            }
            #sim-container:fullscreen #walkthrough-video {
                max-height: none !important;
            }

            /* Scale up active guidance in Fullscreen API */
            #sim-container:fullscreen .caption-pill {
                top: 24px;
                max-width: 650px;
                padding: 1rem 1.4rem;
                border-radius: 12px;
                border-left-width: 6px;
            }
            #sim-container:fullscreen .caption-header {
                margin-bottom: 0.4rem;
                padding-bottom: 0.4rem;
            }
            #sim-container:fullscreen .caption-label {
                font-size: 0.75rem;
                letter-spacing: 1.5px;
            }
            #sim-container:fullscreen .caption-step-count {
                font-size: 0.75rem;
            }
            #sim-container:fullscreen #caption-text {
                font-size: 1.15rem;
                line-height: 1.4;
            }

            /* Fallback window-fullscreen class styling */
            #sim-container.is-fullscreen {
                width: 100vw !important;
                height: 100vh !important;
                max-width: none !important;
                max-height: none !important;
                border-radius: 0 !important;
                border: none !important;
                position: fixed !important;
                inset: 0 !important;
                z-index: 99999 !important;
            }
            #sim-container.is-fullscreen #sim-split-viewport {
                flex-direction: row !important;
            }
            #sim-container.is-fullscreen #walkthrough-video {
                max-height: none !important;
            }
            #sim-container.is-fullscreen .caption-pill {
                top: 24px;
                max-width: 650px;
                padding: 1rem 1.4rem;
                border-radius: 12px;
                border-left-width: 6px;
            }
            #sim-container.is-fullscreen .caption-header {
                margin-bottom: 0.4rem;
                padding-bottom: 0.4rem;
            }
            #sim-container.is-fullscreen .caption-label {
                font-size: 0.75rem;
                letter-spacing: 1.5px;
            }
            #sim-container.is-fullscreen .caption-step-count {
                font-size: 0.75rem;
            }
            #sim-container.is-fullscreen #caption-text {
                font-size: 1.15rem;
                line-height: 1.4;
            }
        </style>
    `;

    appEl.innerHTML = html;

    // Elements
    const video = document.getElementById('walkthrough-video');
    const cards = appEl.querySelectorAll('.timeline-card');
    const captionEl = document.getElementById('walkthrough-caption');
    const captionText = document.getElementById('caption-text');
    const exitBtn = document.getElementById('sim-exit-btn');
    const fsBtn = document.getElementById('sim-fullscreen-btn');

    let playbackCompletionStarted = false;

    const completePlayback = () => {
        if (playbackCompletionStarted) return;
        playbackCompletionStarted = true;
        video.pause();
        finishSimulation();
    };

    const getTrimEnd = () => {
        const mediaDuration = Number.isFinite(video.duration) ? video.duration : Infinity;
        if (configuredTrimEnd === null || !Number.isFinite(configuredTrimEnd)) {
            return mediaDuration;
        }
        return Math.min(configuredTrimEnd, mediaDuration);
    };

    const enforceVideoEdits = () => {
        if (!shouldApplyDynamicEdits || !Number.isFinite(video.currentTime)) return false;

        const endBoundary = getTrimEnd();
        if (video.currentTime >= endBoundary - 0.01) {
            completePlayback();
            return true;
        }

        if (video.currentTime < trimStart - 0.01) {
            video.currentTime = trimStart;
            return true;
        }

        const activeCut = orderedCuts.find(cut =>
            video.currentTime >= cut.start - 0.01 && video.currentTime < cut.end - 0.01
        );
        if (activeCut) {
            const nextTime = Math.min(activeCut.end, endBoundary);
            if (nextTime >= endBoundary - 0.01) {
                completePlayback();
            } else {
                video.currentTime = nextTime;
            }
            return true;
        }

        return false;
    };

    video.addEventListener('loadedmetadata', () => {
        if (shouldApplyDynamicEdits && trimStart > 0 && video.currentTime < trimStart) {
            video.currentTime = trimStart;
        }
    });

    video.addEventListener('seeking', () => {
        enforceVideoEdits();
    });

    // Click to seek
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const time = parseFloat(card.dataset.time);
            video.currentTime = time;
            video.play();
        });
    });

    // Time update highlights
    video.addEventListener('timeupdate', () => {
        if (enforceVideoEdits()) return;
        const curTime = video.currentTime;
        let activeIdx = -1;

        // Find current step active based on timestamp range
        for (let i = 0; i < steps.length; i++) {
            const stepTime = steps[i].sourceTimestamp ?? steps[i].timestamp;
            const nextStepTime = steps[i + 1]
                ? (steps[i + 1].sourceTimestamp ?? steps[i + 1].timestamp)
                : Infinity;

            if (curTime >= stepTime && curTime < nextStepTime) {
                activeIdx = i;
                break;
            }
        }

        // Apply highlights
        cards.forEach((card, idx) => {
            if (idx === activeIdx) {
                if (!card.classList.contains('active')) {
                    card.classList.add('active');
                    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                    // Show overlaid caption on video
                    captionText.innerText = steps[idx].instruction;
                    const stepNumEl = document.getElementById('caption-step-number');
                    if (stepNumEl) {
                        stepNumEl.innerText = `STEP ${idx + 1} OF ${steps.length}`;
                    }
                    captionEl.style.display = 'block';
                    void captionEl.offsetWidth; // Force layout
                    captionEl.style.opacity = '1';
                    captionEl.classList.add('show');
                }
            } else {
                card.classList.remove('active');
            }
        });

        // Hide overlay if video before first step or no step active
        if (activeIdx === -1) {
            captionEl.style.opacity = '0';
            captionEl.classList.remove('show');
            setTimeout(() => {
                if (video.currentTime < (steps[0]?.timestamp || 0)) {
                    captionEl.style.display = 'none';
                }
            }, 300);
        }
    });

    // Handle end of video to finish progression
    video.addEventListener('ended', () => {
        completePlayback();
    });

    // Navigation buttons
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            document.body.style.overflow = '';
            window.location.href = '/?tab=guides';
        });
    }

    const simContainer = document.getElementById('sim-container');

    const onFullscreenChange = () => {
        const isFS = !!document.fullscreenElement;
        if (isFS && document.fullscreenElement === simContainer) {
            simContainer.classList.add('is-fullscreen');
            if (fsBtn) fsBtn.innerText = "Exit Fullscreen";
        } else {
            simContainer.classList.remove('is-fullscreen');
            if (fsBtn) fsBtn.innerText = "⛶ Fullscreen";
        }
    };

    if (window._simFsHandler) {
        document.removeEventListener('fullscreenchange', window._simFsHandler);
    }
    window._simFsHandler = onFullscreenChange;
    document.addEventListener('fullscreenchange', onFullscreenChange);

    if (fsBtn) {
        fsBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                simContainer.requestFullscreen().catch(err => {
                    console.warn("Fullscreen request failed, falling back to CSS toggle:", err);
                    simContainer.classList.toggle('is-fullscreen');
                    fsBtn.innerText = simContainer.classList.contains('is-fullscreen') ? "Exit Fullscreen" : "⛶ Fullscreen";
                });
            } else {
                document.exitFullscreen().catch(() => {});
            }
        });
    }

    const checkGuideProgress = async () => {
        if (!user || !user.id || !course || !course.id) return;

        const { data } = await supabase
            .from('user_progress')
            .select('status')
            .eq('user_id', user.id)
            .eq('course_id', course.id)
            .maybeSingle();

        const container = document.getElementById('guide-complete-status-container');
        if (!container) return;

        if (data?.status === 'completed') {
            container.innerHTML = `<span style="color: #10b981; font-weight: bold; font-size: 0.9rem; display: flex; align-items: center; gap: 4px;">✓ Completed</span>`;
        } else {
            container.innerHTML = '';
        }
    };
    checkGuideProgress();
};
