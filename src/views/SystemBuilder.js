import { createCourse, updateCourse } from '../api/courses.js';
import { fetchSystemTags } from '../api/guides.js';
import { supabase } from '../api/supabase.js';
import { fswAlert, fswConfirm } from '../utils/dialog';

export const renderSystemBuilder = () => {
    return `
    <div class="glass fade-in" style="padding: 2rem; border-radius: var(--radius-lg); position: relative; min-height: 80vh; display: flex; flex-direction: column;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem; margin-bottom: 1rem;">
            <div>
                <h2 style="margin: 0; color: white;">Interactive Guide Builder</h2>
                <p style="margin: 0.5rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">Create a step-by-step interactive software guide.</p>
            </div>
            <div style="display: flex; gap: 1rem;">
                <button id="sys-cancel-btn" class="btn-ghost">Cancel</button>
                <button id="sys-save-btn" class="btn-primary" disabled>Publish Guide</button>
            </div>
        </div>

        <!-- Meta Setup -->
        <div id="sys-meta-step" style="display: flex; gap: 2rem;">
            <div style="flex: 1;">
                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem;">Interactive Guide Title</label>
                <input type="text" id="sys-title" placeholder="e.g. Sage 50: Raising a Purchase Order" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem;">
                
                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem;">Short Description</label>
                <textarea id="sys-desc" rows="3" placeholder="Briefly explain what the user will learn to do..." style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; resize: none;"></textarea>
                
                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem;">Tags (comma separated)</label>
                <input type="text" id="sys-tags" list="sys-tags-list" placeholder="e.g. Sage 50, Sales" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem;">
                <datalist id="sys-tags-list"></datalist>
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
                        <input type="text" id="sys-instruction" placeholder="e.g. Click 'Submit' to proceed" style="width: 100%; padding: 0.6rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem;">

                        <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.8rem;">Detailed Explanation (Floating Popup):</label>
                        <textarea id="sys-teaching" rows="3" placeholder="Explain why they need to click this or what it does..." style="width: 100%; padding: 0.6rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; resize: none; font-size: 0.9rem; font-family: inherit;"></textarea>

                        <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-muted);">
                            <strong>Hotspot Data:</strong>
                            <div id="sys-hotspot-data" style="margin-top: 0.25rem; font-family: monospace; color: var(--primary);">No hotspot drawn</div>
                        </div>

                        <button id="sys-clear-hotspot" class="btn-ghost" style="width: 100%; padding: 0.4rem; font-size: 0.8rem; margin-top: 1rem; color: #ef4444;">Clear Hotspot</button>
                    </div>

                    <div style="margin-top: auto; display: flex; gap: 0.5rem;">
                        <button id="sys-delete-slide-btn" class="btn-ghost" style="color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.5); padding: 0.8rem; border-radius: var(--radius-md);" title="Delete Slide">🗑️</button>
                        <button id="sys-next-slide-btn" class="btn-secondary" style="flex: 1;">Next Slide</button>
                    </div>
                 </div>

             </div>

        </div>

    </div>
    `;
};

export const initSystemBuilder = (onClose, existingGuide = null) => {
    const cancelBtn = document.getElementById('sys-cancel-btn');
    const saveBtn = document.getElementById('sys-save-btn');
    const titleInput = document.getElementById('sys-title');
    const descInput = document.getElementById('sys-desc');
    const tagsInput = document.getElementById('sys-tags');
    const tagsList = document.getElementById('sys-tags-list');
    const uploadZone = document.getElementById('sys-upload-zone');
    const fileInput = document.getElementById('sys-files');

    const metaStep = document.getElementById('sys-meta-step');
    const editorStep = document.getElementById('sys-editor-step');

    // Populate Datalist
    fetchSystemTags().then(tags => {
        tagsList.innerHTML = tags.map(t => `<option value="${t}"></option>`).join('');
    });

    const slideNav = document.getElementById('sys-slide-nav');
    const canvas = document.getElementById('sys-canvas');
    const ctx = canvas.getContext('2d');
    const instructionInput = document.getElementById('sys-instruction');
    const teachingInput = document.getElementById('sys-teaching');
    const hotspotDataText = document.getElementById('sys-hotspot-data');
    const clearHotspotBtn = document.getElementById('sys-clear-hotspot');
    const nextSlideBtn = document.getElementById('sys-next-slide-btn');

    let rawFiles = []; // Blob states
    
    // Core Data Structure for the System Course
    // slide: { id, imageUrl, imageObj, instruction, box: { x, y, width, height, rw, rh } }
    let slides = [];
    let activeSlideIndex = 0;
    let insertIndex = -1;

    // Canvas drawing state
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let tempBox = null;

    cancelBtn.addEventListener('click', onClose);

    uploadZone.addEventListener('click', () => fileInput.click());

    const loadImageObject = (src) => {
        return new Promise((resolve) => {
            if (!src) return resolve(null);
            const img = new Image();
            let resolved = false;
            const finish = (result) => {
                if (resolved) return;
                resolved = true;
                resolve(result);
            };
            img.crossOrigin = "anonymous";
            img.onload = () => finish(img);
            img.onerror = () => {
                console.error("Failed to load image", src);
                finish(null);
            };
            img.src = src;
            setTimeout(() => finish(null), 8000); // 8s timeout
        });
    };

    // PRE-POPULATE IF EDITING
    if (existingGuide) {
        titleInput.value = existingGuide.title || '';
        descInput.value = existingGuide.description || '';
        tagsInput.value = (existingGuide.tags || []).join(', ');
        
        const loadExisting = async () => {
             try {
                 let cJson = existingGuide.content_json;
                 if (typeof cJson === 'string') {
                     try { cJson = JSON.parse(cJson); } catch (e) {}
                 }
                 const jsonSlides = cJson?.slides || [];
                 
                 const loadedSlides = await Promise.all(jsonSlides.map(async (s) => {
                     if (!s) return null;
                     const img = await loadImageObject(s.imageUrl);
                     return {
                         id: s.id || `slide_${Math.random()}`,
                         imageUrl: s.imageUrl || '',
                         originalImage: img,
                         instruction: s.instruction || '',
                         teachingText: s.teachingText || '',
                         box: s.box ? { ...s.box } : null
                     };
                 }));
                 slides = loadedSlides.filter(Boolean);
                 
                 if (slides.length > 0) {
                     editorStep.style.display = 'flex';
                     editorStep.style.borderTop = '1px solid var(--glass-border)';
                     editorStep.style.paddingTop = '1.5rem';
                     saveBtn.disabled = false;
                     renderNav();
                     setActiveSlide(0);
                 } else {
                     console.warn("No slides found in the existing guide.");
                 }
             } catch (err) {
                 console.error("Error in loadExisting:", err);
                 alert("Could not load previous slides: " + (err.message || err.toString()));
             }
        };
        loadExisting();
    }

    // 1. Loading Files
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newSlides = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const url = URL.createObjectURL(file);
            const img = await loadImageObject(url);
            newSlides.push({
                id: `slide_${Date.now()}_${i}`,
                file: file,
                imageUrl: url,
                originalImage: img,
                instruction: `Click the target on this screen`,
                teachingText: '',
                box: null // No hotspot yet
            });
        }

        if (insertIndex === -1) {
            slides.push(...newSlides);
        } else {
            slides.splice(insertIndex, 0, ...newSlides);
            activeSlideIndex = insertIndex;
            insertIndex = -1; // reset
        }

        fileInput.value = ''; // Clean input so same file can trigger again if needed

        // Show editor mode
        editorStep.style.display = 'flex';
        editorStep.style.borderTop = '1px solid var(--glass-border)';
        editorStep.style.paddingTop = '1.5rem';
        
        saveBtn.disabled = false; // We can save now

        renderNav();
        setActiveSlide(activeSlideIndex);
    });

    // 2. Navigation
    const renderNav = () => {
        slideNav.innerHTML = '';
        
        // Initial insert button
        const startPlus = document.createElement('button');
        startPlus.innerHTML = '+';
        startPlus.style = `background: rgba(255,255,255,0.05); border: 1px dashed rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; height: 50px; flex-shrink: 0; font-size: 1.2rem; padding: 0 10px; transition: all 0.2s;`;
        startPlus.onclick = () => { insertIndex = 0; fileInput.click(); };
        startPlus.onmouseenter = () => startPlus.style.background = 'rgba(255,255,255,0.2)';
        startPlus.onmouseleave = () => startPlus.style.background = 'rgba(255,255,255,0.05)';
        slideNav.appendChild(startPlus);

        slides.forEach((s, idx) => {
            const thumb = document.createElement('div');
            thumb.className = `sys-thumb ${idx === activeSlideIndex ? 'active' : ''}`;
            thumb.style = `width: 80px; height: 50px; background-image: url(${s.imageUrl}); background-size: cover; background-position: center; border-radius: 4px; cursor: pointer; border: 2px solid ${idx === activeSlideIndex ? 'var(--primary)' : 'transparent'}; opacity: ${idx === activeSlideIndex ? '1' : '0.5'}; transition: all 0.2s; flex-shrink: 0; position: relative;`;
            if (s.box) {
                thumb.innerHTML = `<div style="position: absolute; bottom: 0; right: 0; background: #10b981; width: 10px; height: 10px; border-radius: 50%;"></div>`;
            }
            thumb.onclick = async () => {
                if (idx !== activeSlideIndex && !slides[activeSlideIndex].box) {
                    const proceed = await fswConfirm("You haven't drawn a click area for this slide. Are you sure you want to move on?");
                    if (!proceed) return;
                }
                setActiveSlide(idx);
            };
            slideNav.appendChild(thumb);

            const plusBtn = document.createElement('button');
            plusBtn.innerHTML = '+';
            plusBtn.style = `background: rgba(255,255,255,0.05); border: 1px dashed rgba(255,255,255,0.3); color: white; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; height: 50px; flex-shrink: 0; font-size: 1.2rem; padding: 0 10px; transition: all 0.2s;`;
            plusBtn.onclick = () => { insertIndex = idx + 1; fileInput.click(); };
            plusBtn.onmouseenter = () => plusBtn.style.background = 'rgba(255,255,255,0.2)';
            plusBtn.onmouseleave = () => plusBtn.style.background = 'rgba(255,255,255,0.05)';
            slideNav.appendChild(plusBtn);
        });
    };

    const setActiveSlide = (index) => {
        activeSlideIndex = index;
        const slide = slides[index];
        
        instructionInput.value = slide.instruction || '';
        teachingInput.value = slide.teachingText || '';
        tempBox = slide.box ? { ...slide.box } : null;

        updateHotspotText();
        resizeAndDrawCanvas();
        renderNav();
    };

    instructionInput.addEventListener('input', (e) => {
        slides[activeSlideIndex].instruction = e.target.value;
    });

    teachingInput.addEventListener('input', (e) => {
        slides[activeSlideIndex].teachingText = e.target.value;
    });

    clearHotspotBtn.addEventListener('click', () => {
        slides[activeSlideIndex].box = null;
        tempBox = null;
        updateHotspotText();
        resizeAndDrawCanvas();
        renderNav(); // Update badge
    })

    nextSlideBtn.addEventListener('click', async () => {
        if (activeSlideIndex < slides.length - 1) {
            if (!slides[activeSlideIndex].box) {
                const proceed = await fswConfirm("You haven't drawn a click area for this slide. Are you sure you want to move on?");
                if (!proceed) return;
            }
            setActiveSlide(activeSlideIndex + 1);
        } else {
            await fswAlert('You are on the final slide! If all target hotspots are drawn, hit Publish Guide up top.');
        }
    });

    const deleteSlideBtn = document.getElementById('sys-delete-slide-btn');
    deleteSlideBtn.addEventListener('click', async () => {
        if (slides.length <= 1) {
            await fswAlert("You cannot delete the only slide. Cancel the builder instead.");
            return;
        }
        if (await fswConfirm("Delete this slide from the sequence?")) {
            slides.splice(activeSlideIndex, 1);
            activeSlideIndex = Math.max(0, activeSlideIndex - 1);
            renderNav();
            setActiveSlide(activeSlideIndex);
        }
    });

    // 3. Canvas Interactions
    const resizeAndDrawCanvas = () => {
        const slide = slides[activeSlideIndex];
        if (!slide || !slide.originalImage) return;
        const img = slide.originalImage;
        
        // We want the canvas's internal resolution to perfectly match the raw image for accurate ratios
        canvas.width = img.width;
        canvas.height = img.height;

        renderCanvas();
    };

    const renderCanvas = () => {
        const slide = slides[activeSlideIndex];
        const img = slide.originalImage;
        
        if (!img) return;

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
        if (!title) {
            await fswAlert('Please enter a Simulator Title');
            return;
        }
        
        // Validate all have boxes
        const missing = slides.findIndex(s => !s.box);
        if (missing > -1) {
            await fswAlert(`Slide ${missing + 1} is missing a hotspot! Please draw one before publishing.`);
            setActiveSlide(missing);
            return;
        }

        try {
            saveBtn.innerText = 'Publishing...';
            saveBtn.disabled = true;

            const { data: userAuth } = await supabase.auth.getUser();

            // 1. Upload Images to Storage
            // 1. Upload Images to Storage
            const finalSlides = [];
            for (let s of slides) {
                let sUrl = s.imageUrl;
                if (s.file) { // Needs upload
                    saveBtn.innerText = `Uploading...`;
                    const fileName = `sim_${Date.now()}_${s.file.name}`;
                    const { error: uploadError } = await supabase.storage.from('guides').upload(fileName, s.file);
                    if (uploadError) throw uploadError;
                    const { data: { publicUrl } } = supabase.storage.from('guides').getPublicUrl(fileName);
                    sUrl = publicUrl;
                }
                finalSlides.push({
                    id: s.id,
                    imageUrl: sUrl,
                    instruction: s.instruction,
                    teachingText: s.teachingText,
                    box: s.box
                });
            }
            
            // 2. Create Course Database Entry
            const thumbnail_url = finalSlides[0].imageUrl; // Use slide 1 as thumbnail
            const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);

            const finalContent = {
                is_system_simulation: true,
                slides: finalSlides
            };

            if (existingGuide) {
                await updateCourse(existingGuide.id, {
                    title: title,
                    description: descInput.value,
                    thumbnail_url: thumbnail_url,
                    tags: tags,
                    content_json: finalContent
                });
            } else {
                await createCourse({
                    title: title,
                    description: descInput.value,
                    thumbnail_url: thumbnail_url,
                    tags: tags,
                    content_json: finalContent,
                    status: 'live' // Make it live directly for testing
                });
            }
            
            saveBtn.innerText = 'Success!';
            // Delay 1 sec then close
            setTimeout(() => {
                onClose();
            }, 1000);

        } catch (e) {
            console.error('Save failed:', e);
            await fswAlert(e.message || 'Failed to publish guide');
            saveBtn.innerText = 'Error';
            saveBtn.disabled = false;
        }
    });
};
