import { createCourse } from '../api/courses.js';
import { supabase } from '../api/supabase.js';

export const renderSystemBuilder = () => {
    return `
    <div class="glass fade-in" style="padding: 2rem; border-radius: var(--radius-lg); position: relative; min-height: 80vh; display: flex; flex-direction: column;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem; margin-bottom: 1rem;">
            <div>
                <h2 style="margin: 0; color: white;">Interactive System Builder</h2>
                <p style="margin: 0.5rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">Upload screenshots and draw hotspots to simulate software interactions.</p>
            </div>
            <div style="display: flex; gap: 1rem;">
                <button id="sys-cancel-btn" class="btn-ghost">Cancel</button>
                <button id="sys-save-btn" class="btn-primary" disabled>Publish Simulator</button>
            </div>
        </div>

        <!-- Meta Setup -->
        <div id="sys-meta-step" style="display: flex; gap: 2rem;">
            <div style="flex: 1;">
                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem;">Simulator Title</label>
                <input type="text" id="sys-title" placeholder="e.g. Sage 50: Raising a Purchase Order" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem;">
                
                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem;">Short Description</label>
                <textarea id="sys-desc" rows="3" placeholder="Briefly explain what the user will learn to do..." style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; resize: none;"></textarea>
            </div>

            <div style="flex: 1;">
                 <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem;">Step 1: Upload Screenshots (In Order)</label>
                 <div id="sys-upload-zone" style="border: 2px dashed rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); border-radius: var(--radius-md); padding: 2rem; text-align: center; cursor: pointer; transition: all 0.3s; height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" style="margin-bottom: 0.5rem;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    <div style="font-size: 0.9rem; color: var(--text-muted);">Select Screenshots (PNG, JPG)</div>
                    <input type="file" id="sys-files" multiple accept="image/*" style="display: none;">
                 </div>
            </div>
        </div>

        <!-- Canvas Editor -->
        <div id="sys-editor-step" style="display: none; flex-direction: column; flex: 1;">
            
            <!-- Slide Navigation Bar -->
             <div style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 1rem; margin-bottom: 1rem; border-bottom: 1px solid var(--glass-border);" id="sys-slide-nav">
                <!-- Thumbs -->
             </div>

             <!-- Editor Area -->
             <div style="display: flex; gap: 1.5rem; flex: 1;">
                 
                 <!-- Canvas Wrapper -->
                 <div style="flex: 3; background: rgba(0,0,0,0.5); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;" id="sys-canvas-wrapper">
                    <canvas id="sys-canvas" style="cursor: crosshair; display: block; max-width: 100%; max-height: 500px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"></canvas>
                    <div id="sys-canvas-hint" style="position: absolute; top: 1rem; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; pointer-events: none;">Draw a rectangle over the target button</div>
                 </div>

                 <!-- Sidebar Controls -->
                 <div style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
                    <div class="glass" style="padding: 1rem; border-radius: var(--radius-md);">
                        <h4 style="margin: 0 0 0.5rem 0;">Slide Properties</h4>
                        
                        <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.8rem;">Instruction for User:</label>
                        <input type="text" id="sys-instruction" placeholder="e.g. Click 'Submit' to proceed" style="width: 100%; padding: 0.6rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">

                        <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-muted);">
                            <strong>Hotspot Data:</strong>
                            <div id="sys-hotspot-data" style="margin-top: 0.25rem; font-family: monospace; color: var(--primary);">No hotspot drawn</div>
                        </div>

                        <button id="sys-clear-hotspot" class="btn-ghost" style="width: 100%; padding: 0.4rem; font-size: 0.8rem; margin-top: 1rem; color: #ef4444;">Clear Hotspot</button>
                    </div>

                    <div style="margin-top: auto;">
                        <button id="sys-next-slide-btn" class="btn-secondary" style="width: 100%;">Next Slide</button>
                    </div>
                 </div>

             </div>

        </div>

    </div>
    `;
};

export const initSystemBuilder = (onClose) => {
    const cancelBtn = document.getElementById('sys-cancel-btn');
    const saveBtn = document.getElementById('sys-save-btn');
    const titleInput = document.getElementById('sys-title');
    const descInput = document.getElementById('sys-desc');
    const uploadZone = document.getElementById('sys-upload-zone');
    const fileInput = document.getElementById('sys-files');

    const metaStep = document.getElementById('sys-meta-step');
    const editorStep = document.getElementById('sys-editor-step');

    const slideNav = document.getElementById('sys-slide-nav');
    const canvas = document.getElementById('sys-canvas');
    const ctx = canvas.getContext('2d');
    const instructionInput = document.getElementById('sys-instruction');
    const hotspotDataText = document.getElementById('sys-hotspot-data');
    const clearHotspotBtn = document.getElementById('sys-clear-hotspot');
    const nextSlideBtn = document.getElementById('sys-next-slide-btn');

    let rawFiles = []; // Blob states
    
    // Core Data Structure for the System Course
    // slide: { id, imageUrl, imageObj, instruction, box: { x, y, width, height, rw, rh } }
    let slides = [];
    let activeSlideIndex = 0;

    // Canvas drawing state
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let tempBox = null;

    cancelBtn.addEventListener('click', onClose);

    uploadZone.addEventListener('click', () => fileInput.click());

    // 1. Loading Files
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        rawFiles = files;
        slides = [];

        // Preload images into objects
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const url = URL.createObjectURL(file);
            const img = await loadImageObject(url);
            slides.push({
                id: `slide_${i}`,
                file: file,
                imageUrl: url,
                originalImage: img,
                instruction: `Click the target on screen ${i+1}`,
                box: null // No hotspot yet
            });
        }

        // Switch purely to editor mode
        // Note: Keep title inputs in DOM but hide meta if wanted. 
        // We will just slide the editor in.
        metaStep.style.display = 'none';
        editorStep.style.display = 'flex';
        
        saveBtn.disabled = false; // We can save now (technically)

        renderNav();
        setActiveSlide(0);
    });

    const loadImageObject = (src) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = src;
        });
    }

    // 2. Navigation
    const renderNav = () => {
        slideNav.innerHTML = slides.map((s, i) => `
            <div data-idx="${i}" class="sys-thumb ${i === activeSlideIndex ? 'active' : ''}" style="width: 80px; height: 50px; background-image: url(${s.imageUrl}); background-size: cover; background-position: center; border-radius: 4px; cursor: pointer; border: 2px solid ${i === activeSlideIndex ? 'var(--primary)' : 'transparent'}; opacity: ${i === activeSlideIndex ? '1' : '0.5'}; transition: all 0.2s; position: flex-shrink: 0;">
                ${s.box ? `<div style="position: absolute; bottom: 0; right: 0; background: #10b981; width: 10px; height: 10px; border-radius: 50%;"></div>` : ''}
            </div>
        `).join('');

        document.querySelectorAll('.sys-thumb').forEach(t => {
            t.style.position = 'relative'; // Ensure relative for badge
            t.addEventListener('click', () => setActiveSlide(parseInt(t.dataset.idx, 10)));
        });
    };

    const setActiveSlide = (index) => {
        activeSlideIndex = index;
        const slide = slides[index];
        
        instructionInput.value = slide.instruction || '';
        tempBox = slide.box ? { ...slide.box } : null;

        updateHotspotText();
        resizeAndDrawCanvas();
        renderNav();
    };

    instructionInput.addEventListener('input', (e) => {
        slides[activeSlideIndex].instruction = e.target.value;
    });

    clearHotspotBtn.addEventListener('click', () => {
        slides[activeSlideIndex].box = null;
        tempBox = null;
        updateHotspotText();
        resizeAndDrawCanvas();
        renderNav(); // Update badge
    })

    nextSlideBtn.addEventListener('click', () => {
        if (activeSlideIndex < slides.length - 1) {
            setActiveSlide(activeSlideIndex + 1);
        } else {
            alert('You are on the final slide! If all target hotspots are drawn, hit Publish Simulator.');
        }
    });

    // 3. Canvas Interactions
    const resizeAndDrawCanvas = () => {
        const slide = slides[activeSlideIndex];
        if (!slide) return;
        const img = slide.originalImage;
        
        // We want the canvas's internal resolution to perfectly match the raw image for accurate ratios
        canvas.width = img.width;
        canvas.height = img.height;

        renderCanvas();
    };

    const renderCanvas = () => {
        const slide = slides[activeSlideIndex];
        const img = slide.originalImage;

        // Clear and draw image base
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Draw overlay shadow if box exists
        if (tempBox) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // "Cut out" the box to highlight
            ctx.clearRect(tempBox.x, tempBox.y, tempBox.width, tempBox.height);
            // Draw original image just inside the box to effectively 'cut' the shadow
            ctx.drawImage(img, tempBox.x, tempBox.y, tempBox.width, tempBox.height, tempBox.x, tempBox.y, tempBox.width, tempBox.height);

            // Give it a pulsing green border effect
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 10]);
            ctx.strokeRect(tempBox.x, tempBox.y, tempBox.width, tempBox.height);
            ctx.setLineDash([]); // Reset
        }
    };

    const updateHotspotText = () => {
        if (!tempBox) {
            hotspotDataText.innerText = "No hotspot drawn";
            hotspotDataText.style.color = "var(--text-muted)";
        } else {
            hotspotDataText.innerText = `X:${Math.round(tempBox.x)} Y:${Math.round(tempBox.y)} W:${Math.round(tempBox.width)} H:${Math.round(tempBox.height)}\n(Rel: ${Math.round(tempBox.rw*100)}% x ${Math.round(tempBox.rh*100)}%)`;
            hotspotDataText.style.color = "var(--primary)";
        }
    }

    // Get exact cursor coordinate relative to the internal canvas dimensions 
    // (since canvas CSS stretches it, we must map mouse pos to internal coords)
    const getMousePos = (evt) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY
        };
    };

    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const pos = getMousePos(e);
        startX = pos.x;
        startY = pos.y;
        tempBox = { x: startX, y: startY, width: 0, height: 0, rw: 0, rh: 0, rx: 0, ry: 0 };
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const pos = getMousePos(e);
        const w = pos.x - startX;
        const h = pos.y - startY;

        // Ensure box allows dragging left/up by normalizing negative widths
        tempBox = {
            x: Math.min(startX, pos.x),
            y: Math.min(startY, pos.y),
            width: Math.abs(w),
            height: Math.abs(h),
            rx: Math.min(startX, pos.x) / canvas.width,
            ry: Math.min(startY, pos.y) / canvas.height,
            rw: Math.abs(w) / canvas.width,
            rh: Math.abs(h) / canvas.height
        };

        renderCanvas();
    });

    canvas.addEventListener('mouseup', () => {
        isDrawing = false;
        if (tempBox && tempBox.width > 10 && tempBox.height > 10) {
            slides[activeSlideIndex].box = { ...tempBox };
            updateHotspotText();
            renderNav();
        } else {
            // Discard click without drag
            tempBox = slides[activeSlideIndex].box ? { ...slides[activeSlideIndex].box } : null;
            renderCanvas();
        }
    });

    // 4. Save and Upload
    saveBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        if (!title) return alert('Please enter a Simulator Title');
        
        // Validate all have boxes
        const missing = slides.findIndex(s => !s.box);
        if (missing > -1) {
            alert(`Slide ${missing + 1} is missing a hotspot! Please draw one before publishing.`);
            setActiveSlide(missing);
            return;
        }

        try {
            saveBtn.innerText = 'Publishing...';
            saveBtn.disabled = true;

            const { data: userAuth } = await supabase.auth.getUser();

            // 1. Upload Images to Storage
            const finalContent = {
                is_system_simulation: true,
                slides: []
            };

            for (let i = 0; i < slides.length; i++) {
                const s = slides[i];
                const fileName = `sim_${Date.now()}_${i}_${s.file.name}`;
                
                // Usually we'd use a 'simulations' bucket, but 'courses' assets works too. Assuming we just use public thumbnail bucket
                // For safety, let's assume 'course_thumbnails' exists from earlier or we can use the same bucket.
                const { error: uploadError } = await supabase.storage
                    .from('guides') // re-using guides public bucket for files
                    .upload(fileName, s.file);
                    
                if (uploadError) throw new Error("File upload failed: " + uploadError.message);
                
                const { data: publicUrlData } = supabase.storage.from('guides').getPublicUrl(fileName);

                finalContent.slides.push({
                    imageUrl: publicUrlData.publicUrl,
                    instruction: s.instruction,
                    box: {
                        rx: s.box.rx,  // relative X
                        ry: s.box.ry,  // relative Y
                        rw: s.box.rw,  // relative Width
                        rh: s.box.rh   // relative Height
                    }
                });
            }

            // 2. Create Course Database Entry
            const thumbnail_url = finalContent.slides[0].imageUrl; // Use slide 1 as thumbnail

            await createCourse({
                title: title,
                description: descInput.value,
                thumbnail_url: thumbnail_url,
                content_json: finalContent,
                status: 'live' // Make it live directly for testing
            });

            alert('Simulator Published Successfully!');
            onClose();

        } catch (e) {
            console.error(e);
            alert("Error saving: " + e.message);
            saveBtn.innerText = 'Publish Simulator';
            saveBtn.disabled = false;
        }
    });
};
