import { updateCourse } from '../../api/courses.js';
import { supabase } from '../../api/supabase.js';

export const renderSimulationPlayer = (course, user, embeddedContainerId = null) => {
    
    const isEmbedded = !!embeddedContainerId;

    // Parse slides
    const content = typeof course.content_json === 'string' 
        ? JSON.parse(course.content_json) 
        : course.content_json;

    const slides = content.slides || [];
    let currentSlide = 0;

    // Use specific container or take over the app screen
    const appEl = embeddedContainerId ? document.getElementById(embeddedContainerId) : document.getElementById('app');

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

    const finishSimulation = async () => {
        // Log progression in DB
        if (user.role !== 'manager') { // Only register progress for actual users
             const { data: { session } } = await supabase.auth.getSession();
             if (session) {
                 await supabase.from('user_progress').upsert({
                     user_id: user.id,
                     course_id: course.id,
                     status: 'completed',
                     completed_at: new Date().toISOString()
                 }, { onConflict: 'user_id,course_id' });
             }
        }

        if (isEmbedded) {
             appEl.innerHTML = `
                 <div class="fade-in" style="background: rgba(16, 185, 129, 0.05); padding: 2rem; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.3); text-align: center; margin-top: 20px; margin-bottom: 20px;">
                     <div style="width: 50px; height: 50px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; box-shadow: 0 0 20px rgba(16, 185, 129, 0.5);">
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                     </div>
                     <h3 style="color: white; margin: 0 0 0.5rem 0;">Simulation Complete!</h3>
                     <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">You've successfully completed the guide.</p>
                 </div>
             `;
        } else {
            appEl.innerHTML = `
                <div style="position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <div class="fade-in" style="text-align: center;">
                        <div style="width: 80px; height: 80px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; box-shadow: 0 0 30px rgba(16, 185, 129, 0.5);">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <h2 style="color: white; font-size: 2rem;">Simulation Complete!</h2>
                        <p style="color: var(--text-muted); margin-bottom: 2rem;">You've successfully completed the system walkthrough.</p>
                        <button class="btn-primary" onclick="window.location.href='/?tab=guides'" style="padding: 1rem 3rem;">Return to Guides</button>
                    </div>
                </div>
                <style>body { overflow: hidden !important; }</style>
            `;
        }
    };

    // Initialize
    renderSlide();
};
