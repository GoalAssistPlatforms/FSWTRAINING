import { updateCourse } from '../../api/courses.js';
import { supabase } from '../../api/supabase.js';

export const renderSimulationPlayer = (course, user) => {
    
    // Parse slides
    const content = typeof course.content_json === 'string' 
        ? JSON.parse(course.content_json) 
        : course.content_json;

    const slides = content.slides || [];
    let currentSlide = 0;

    // We take over the whole app screen
    const appEl = document.getElementById('app');

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
            <div id="sim-container" style="position: fixed; inset: 0; background: #111; z-index: 1000; overflow: hidden; display: flex; flex-direction: column; cursor: none;">
                
                <!-- HUD -->
                <div style="background: rgba(0,0,0,0.8); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; z-index: 10;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <button id="sim-exit-btn" class="btn-ghost" style="padding: 0.5rem; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">Exit</button>
                        <h3 style="margin: 0; color: white;">${course.title}</h3>
                        <span style="color: var(--text-muted); font-size: 0.9rem;">(Step ${currentSlide + 1} of ${slides.length})</span>
                    </div>
                    <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; color: #10b981; padding: 0.5rem 1rem; border-radius: 8px; font-weight: bold; max-width: 50%; text-align: center; box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);">
                        ${slide.instruction}
                    </div>
                </div>

                <!-- Main Viewport -->
                <div id="sim-viewport" style="flex: 1; position: relative; display: flex; justify-content: center; align-items: center; background: #000; overflow: hidden;">
                     <img id="sim-img" src="${slide.imageUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain; pointer-events: none; user-select: none;">
                     <div id="sim-hotspot" style="position: absolute; border: 3px solid rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.1); cursor: none;">
                        <div style="position: absolute; inset: -4px; border: 2px solid transparent; border-radius: 4px; animation: simPulse 2s infinite;"></div>
                     </div>
                </div>

                <!-- Custom Cursor Hand -->
                <div id="sim-cursor" style="position: absolute; pointer-events: none; z-index: 9999; transform: translate(-5%, -5%); width: 30px; height: 30px; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.5)); transition: transform 0.1s;">
                    <svg viewBox="0 0 24 24" fill="white" stroke="black" stroke-width="1"><path d="M11 2v9h-2L6 8 3 11l6 6v5h12v-9l-2-2v-4a2 2 0 0 0-4 0v4h-2V6a2 2 0 0 0-4 0v5H7V4L5 6V2a2 2 0 0 1 4 0z"/></svg>
                </div>
            </div>
            
            <style>
                @keyframes simPulse {
                    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                    70% { box-shadow: 0 0 0 15px rgba(16, 185, 129, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }
                /* Hide global scrollbars while simulating */
                body { overflow: hidden !important; }
            </style>
        `;

        appEl.innerHTML = html;

        // BIND EVENTS
        const simContainer = document.getElementById('sim-container');
        const simViewport = document.getElementById('sim-viewport');
        const imgEl = document.getElementById('sim-img');
        const hotspotEl = document.getElementById('sim-hotspot');
        const cursorEl = document.getElementById('sim-cursor');
        const exitBtn = document.getElementById('sim-exit-btn');

        // Custom Cursor Mover
        document.addEventListener('mousemove', (e) => {
            if (cursorEl) {
                cursorEl.style.left = e.clientX + 'px';
                cursorEl.style.top = e.clientY + 'px';
            }
        });

        // Click effect on cursor
        document.addEventListener('mousedown', () => {
            if (cursorEl) cursorEl.style.transform = 'translate(-5%, -5%) scale(0.9)';
        });
        document.addEventListener('mouseup', () => {
            if (cursorEl) cursorEl.style.transform = 'translate(-5%, -5%) scale(1)';
        });

        exitBtn.addEventListener('click', () => {
            document.body.style.overflow = '';
            // Just reload to dashboard
            window.location.reload(); 
        });

        // Wait for image to load to position the hotspot relative to its actual rendered bounds
        imgEl.onload = () => {
            positionHotspot();
        };

        const positionHotspot = () => {
             // The image might be pillarboxed or letterboxed due to object-fit: contain.
             // We need to find its actual rendered coordinates.
             const rect = imgEl.getBoundingClientRect();
             const b = slide.box;

             hotspotEl.style.left = (rect.left + (b.rx * rect.width)) + 'px';
             hotspotEl.style.top = (rect.top + (b.ry * rect.height)) + 'px';
             hotspotEl.style.width = (b.rw * rect.width) + 'px';
             hotspotEl.style.height = (b.rh * rect.height) + 'px';
        };

        window.addEventListener('resize', positionHotspot);

        // Core Click Logic
        simViewport.addEventListener('click', (e) => {
             // Did they hit the hotspot?
             const clickX = e.clientX;
             const clickY = e.clientY;
             
             const spotRect = hotspotEl.getBoundingClientRect();

             if (clickX >= spotRect.left && clickX <= spotRect.right &&
                 clickY >= spotRect.top && clickY <= spotRect.bottom) {
                 // SUCCESS
                 playSuccessChime();
                 window.removeEventListener('resize', positionHotspot);
                 setTimeout(() => {
                     currentSlide++;
                     renderSlide();
                 }, 300);
             } else {
                 // FAIL
                 playErrorBeep();
                 // Flash red viewport
                 const origBg = simViewport.style.background;
                 simViewport.style.background = '#450a0a';
                 setTimeout(() => { simViewport.style.background = origBg; }, 150);
             }
        });

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

        appEl.innerHTML = `
            <div style="position: fixed; inset: 0; background: #000; z-index: 1000; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <div class="fade-in" style="text-align: center;">
                    <div style="width: 80px; height: 80px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; box-shadow: 0 0 30px rgba(16, 185, 129, 0.5);">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <h2 style="color: white; font-size: 2rem;">Simulation Complete!</h2>
                    <p style="color: var(--text-muted); margin-bottom: 2rem;">You've successfully completed the system walkthrough.</p>
                    <button class="btn-primary" onclick="window.location.reload()" style="padding: 1rem 3rem;">Return to Dashboard</button>
                </div>
            </div>
            <style>body { overflow: hidden !important; }</style>
        `;
    };

    // Initialize
    renderSlide();
};
