import { mockCourseManifest, recalculateSlideAudio } from '../data/mockCourseManifest.js';
import { renderBespokePlayerDemo } from './BespokePlayerDemo.js';
import { generateThumbnail, uploadToCloudinary } from '../api/images.js';
import { generateBespokeSlides } from '../api/bespoke-ai.js';
import '../styles/bespoke-builder.css';

// We create a mutable clone of the manifest to act as our live state
let builderState = JSON.parse(JSON.stringify(mockCourseManifest));
let activeSlideIndex = 0;
let globalFileInput = null;

const handleImageAction = async (actionType, callback, btnElement) => {
    const originalText = btnElement.innerText;

    try {
        if (actionType === 'ai') {
            const prompt = window.prompt("What should this image be of?");
            if (!prompt) return;
            
            btnElement.innerText = "Generating...";
            btnElement.disabled = true;
            
            const newUrl = await generateThumbnail(prompt);
            if (newUrl) {
                callback(newUrl);
            } else {
                alert("Failed to generate image.");
            }
        } else if (actionType === 'upload') {
            if (!globalFileInput) {
                globalFileInput = document.createElement('input');
                globalFileInput.type = 'file';
                globalFileInput.accept = 'image/*';
                globalFileInput.style.display = 'none';
                document.body.appendChild(globalFileInput);
            }
            
            globalFileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                btnElement.innerText = "Uploading...";
                btnElement.disabled = true;
                
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const dataUri = event.target.result;
                    try {
                        const newUrl = await uploadToCloudinary(dataUri, 'studio_upload');
                        if (newUrl) {
                            callback(newUrl);
                        } else {
                            alert("Failed to upload image.");
                        }
                    } catch (err) {
                        alert("Upload failed: " + err.message);
                    } finally {
                        btnElement.innerText = originalText;
                        btnElement.disabled = false;
                        globalFileInput.value = '';
                    }
                };
                reader.readAsDataURL(file);
            };
            
            globalFileInput.click();
            return;
        }
    } catch (err) {
        alert("Action failed: " + err.message);
    }
    
    btnElement.innerText = originalText;
    btnElement.disabled = false;
};

export const renderBespokeBuilderDemo = () => {
    const app = document.querySelector('#app');
    
    app.innerHTML = `
        <div class="builder-layout">
            <!-- Column 1: Navigator -->
            <div class="builder-column navigator">
                <div style="margin-bottom: 1.5rem;">
                    <h3 style="margin:0; font-size: 1.2rem;">Slides</h3>
                    <p style="margin:0; font-size: 0.8rem; color: #94a3b8;">Drag to reorder (Coming Soon)</p>
                </div>
                
                <!-- AI GENERATOR UI -->
                <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                    <div style="font-size: 0.75rem; color: #38bdf8; text-transform: uppercase; font-weight: bold; margin-bottom: 0.5rem;">✨ AI Slide Generator</div>
                    <input type="text" id="ai-topic-input" class="form-input" placeholder="Enter topic (e.g., Future of AI)" style="width: 100%; margin-bottom: 0.5rem; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 0.5rem; border-radius: 4px;" />
                    <button id="generate-ai-btn" class="btn-primary" style="width: 100%; display: flex; justify-content: center; align-items: center; gap: 0.5rem;">
                        <span>Generate Deck</span>
                    </button>
                </div>
                <div id="builder-nav-list"></div>
                <button id="add-slide-btn" class="btn-primary" style="width: 100%; margin-top: 1rem;">+ Add Slide</button>
            </div>
            
            <!-- Column 2: Canvas (Live Preview) -->
            <div class="builder-column canvas" id="builder-canvas-container">
                <div class="canvas-scale-wrapper" id="player-mount">
                    <!-- The BespokePlayer will mount inside here -->
                </div>
            </div>
            
            <!-- Column 3: Inspector -->
            <div class="builder-column inspector" id="builder-inspector">
                <!-- Form renders here dynamically based on selected slide -->
            </div>
        </div>
    `;

    renderNavigator();
    renderInspector();
    
    // We update the original mockCourseManifest by reference to trick the player into reading our state
    // (Since BespokePlayerDemo directly imports mockCourseManifest)
    updatePlayerManifest();
    
    // Mount the player into #player-mount
    renderBespokePlayerDemo(activeSlideIndex);

    // AI Generation Listener
    const aiBtn = document.getElementById('generate-ai-btn');
    if (aiBtn) {
        aiBtn.addEventListener('click', async () => {
            const topicInput = document.getElementById('ai-topic-input');
            const topic = topicInput.value.trim();
            if (!topic) {
                alert("Please enter a topic.");
                return;
            }

            const originalText = aiBtn.innerHTML;
            aiBtn.innerHTML = `<span>Generating...</span>`;
            try {
                const newSlides = await generateBespokeSlides(topic, (status) => {
                    aiBtn.innerHTML = `<span>${status}</span>`;
                });
                
                // Post-process the slides to ensure player compatibility
                newSlides.forEach(slide => {
                    // Map narrationScript to narration
                    if (slide.narrationScript) {
                        slide.narration = slide.narrationScript;
                    }
                    // Calculate duration based on narration word count
                    recalculateSlideAudio(slide);
                    
                    // Ensure every element has a type fallback just in case
                    if (slide.elements) {
                        slide.elements.forEach(el => {
                            if (!el.type) el.type = 'text';
                            if (!el.animation) el.animation = 'fade-in';
                        });
                    }
                });

                builderState.slides = newSlides;
                activeSlideIndex = 0;
                
                updatePlayerManifest();
                renderNavigator();
                renderInspector();
                renderBespokePlayerDemo(activeSlideIndex);
            } catch (err) {
                alert("AI Generation failed: " + err.message);
            } finally {
                aiBtn.innerHTML = originalText;
                aiBtn.disabled = false;
            }
        });
    }
};

const renderNavigator = () => {
    const navList = document.getElementById('builder-nav-list');
    navList.innerHTML = builderState.slides.map((slide, index) => `
        <div class="nav-slide-item ${index === activeSlideIndex ? 'active' : ''}" data-index="${index}">
            <div class="nav-slide-title">${index + 1}. ${slide.slideTitle || 'Untitled Slide'}</div>
            <div class="nav-slide-meta">${slide.layout || 'default'} • ${(slide.duration / 1000).toFixed(1)}s</div>
        </div>
    `).join('');

    // Attach click listeners for selection
    document.querySelectorAll('.nav-slide-item').forEach(el => {
        el.addEventListener('click', (e) => {
            activeSlideIndex = parseInt(e.currentTarget.dataset.index);
            renderNavigator();
            renderInspector();
            
            // Hack to force the player to seek to the newly selected slide
            // We can do this by setting a global or just letting the user manually navigate for now
            // To be robust, we will just re-render the player.
            renderBespokePlayerDemo(activeSlideIndex);
        });
    });
};

const renderInspector = () => {
    const inspector = document.getElementById('builder-inspector');
    const slide = builderState.slides[activeSlideIndex];
    
    // Safety check
    if (!slide) {
        inspector.innerHTML = `<p>No slide selected</p>`;
        return;
    }

    inspector.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem;">Slide Properties</h3>
        
        <div class="builder-form-group">
            <label>Slide Title (Admin Only)</label>
            <input type="text" id="prop-slideTitle" value="${slide.slideTitle || ''}">
        </div>
        
        <div class="builder-form-group">
            <label>Narration Script</label>
            <textarea id="prop-narration" rows="4">${escapeHtml(slide.narration || '')}</textarea>
        </div>

        <div class="builder-form-group">
            <label>Layout Template</label>
            <select id="prop-layout">
                <option value="title" ${slide.layout === 'title' ? 'selected' : ''}>Title Full</option>
                <option value="default" ${!slide.layout || slide.layout === 'default' ? 'selected' : ''}>Standard Content</option>
                <option value="split-left" ${slide.layout === 'split-left' ? 'selected' : ''}>Split Left</option>
                <option value="split-right" ${slide.layout === 'split-right' ? 'selected' : ''}>Split Right</option>
                <option value="comparison" ${slide.layout === 'comparison' ? 'selected' : ''}>Comparison</option>
            </select>
        </div>


        <div class="builder-form-group">
            <label>Background Image</label>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn-secondary" id="prop-bg-upload" style="flex:1; padding: 0.5rem; font-size: 0.8rem;">Upload</button>
                <button class="btn-secondary" id="prop-bg-ai" style="flex:1; padding: 0.5rem; font-size: 0.8rem;">AI Gen</button>
                <button class="btn-ghost" id="prop-bg-clear" style="flex:1; padding: 0.5rem; font-size: 0.8rem; color: #ef4444;">Remove</button>
            </div>
            ${slide.background ? `<div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.5rem; word-break: break-all;">Current: ${slide.background.slice(5, -2)}</div>` : ''}
        </div>
        
        <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 2rem 0;">
        <h3 style="margin-top: 0; margin-bottom: 1.5rem; padding-bottom: 0.5rem;">Slide Elements</h3>
        <div id="builder-blocks-container">
            ${renderBlockFields(slide.elements || [])}
        </div>
        
        <div style="margin-top: 1rem; margin-bottom: 4rem; position: relative;">
            <button id="add-element-btn" class="btn-primary" style="width: 100%; padding: 0.75rem; font-weight: bold; background: #38bdf8; color: #0f172a; border-radius: 8px;">+ Add Element</button>
            <div id="add-element-dropdown" style="display: none; position: absolute; bottom: 110%; left: 0; width: 100%; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 0.5rem; z-index: 50; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);">
                <div style="font-size: 0.7rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 0.5rem; padding: 0 0.25rem;">Smart Layouts</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    <button class="btn-secondary add-element-option" data-type="text" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Text</button>
                    <button class="btn-secondary add-element-option" data-type="quote" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Quote</button>
                    <button class="btn-secondary add-element-option" data-type="stat" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Stat</button>
                    <button class="btn-secondary add-element-option" data-type="callout" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Callout</button>
                    <button class="btn-secondary add-element-option" data-type="bento-grid" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Bento Grid</button>
                    <button class="btn-secondary add-element-option" data-type="timeline" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Sequence / Timeline</button>
                    <button class="btn-secondary add-element-option" data-type="comparison" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Comparison</button>
                    <button class="btn-secondary add-element-option" data-type="feature-list" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Feature List</button>
                    <button class="btn-secondary add-element-option" data-type="pyramid" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Pyramid</button>
                    <button class="btn-secondary add-element-option" data-type="table" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Data Table</button>
                    <button class="btn-secondary add-element-option" data-type="chart" style="font-size: 0.8rem; text-align: left; padding: 0.5rem;">Bar Chart</button>
                </div>
            </div>
        </div>
    `;

    // Bind inputs to our builderState, and trigger live re-renders!
    document.getElementById('prop-slideTitle').addEventListener('input', (e) => {
        slide.slideTitle = e.target.value;
        renderNavigator(); 
    });
    
    document.getElementById('prop-narration').addEventListener('input', (e) => {
        slide.narration = e.target.value;
        recalculateSlideAudio(slide);
        renderNavigator();
        triggerLivePreview();
    });

    document.getElementById('prop-layout').addEventListener('change', (e) => {
        slide.layout = e.target.value;
        renderNavigator();
        triggerLivePreview();
    });


    document.getElementById('prop-bg-upload').addEventListener('click', (e) => {
        handleImageAction('upload', (url) => {
            slide.background = "url('" + url + "')";
            triggerLivePreview();
            renderInspector(); // Re-render to show new URL text
        }, e.target);
    });

    document.getElementById('prop-bg-ai').addEventListener('click', (e) => {
        handleImageAction('ai', (url) => {
            slide.background = "url('" + url + "')";
            triggerLivePreview();
            renderInspector(); // Re-render to show new URL text
        }, e.target);
    });

    document.getElementById('prop-bg-clear').addEventListener('click', (e) => {
        slide.background = ""; // Clear the background
        triggerLivePreview();
        renderInspector();
    });

    // Handle block reordering and deletion
    document.querySelectorAll('.block-control-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            const index = parseInt(e.currentTarget.dataset.index);
            if (!slide.elements) slide.elements = [];
            
            if (action === 'delete') {
                slide.elements.splice(index, 1);
            } else if (action === 'up' && index > 0) {
                const temp = slide.elements[index];
                slide.elements[index] = slide.elements[index - 1];
                slide.elements[index - 1] = temp;
            } else if (action === 'down' && index < slide.elements.length - 1) {
                const temp = slide.elements[index];
                slide.elements[index] = slide.elements[index + 1];
                slide.elements[index + 1] = temp;
            }
            
            renderInspector();
            triggerLivePreview();
        });
    });

    // Handle dropdown toggling
    const dropdown = document.getElementById('add-element-dropdown');
    document.getElementById('add-element-btn').addEventListener('click', () => {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    // Handle adding new elements
    document.querySelectorAll('.add-element-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.currentTarget.dataset.type;
            if (!slide.elements) slide.elements = [];
            slide.elements.push(createDefaultElement(type));
            dropdown.style.display = 'none';
            renderInspector();
            triggerLivePreview();
        });
    });

    bindBlockFields(slide.elements || []);
};

const updatePlayerManifest = () => {
    // We empty the original manifest's slides array and replace it with our builderState slides
    mockCourseManifest.slides.length = 0; 
    builderState.slides.forEach(s => mockCourseManifest.slides.push(s));
};

const triggerLivePreview = () => {
    updatePlayerManifest();
    
    // We re-render the player to instantly show changes.
    // Because it mounts to #player-mount, it only destroys the middle column!
    renderBespokePlayerDemo(activeSlideIndex);
};

const escapeHtml = (unsafe) => {
    if (!unsafe) return '';
    return unsafe.toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
};

const renderBlockFields = (elements) => {
    return elements.map((el, i) => {
        let fieldsHtml = '';
        if (el.type === 'text') {
            fieldsHtml = `
                <div class="builder-form-group">
                    <label>Text Content</label>
                    <textarea id="block-${i}-content" rows="3">${escapeHtml(el.content)}</textarea>
                </div>
            `;
        } else if (el.type === 'quote') {
            fieldsHtml = `
                <div class="builder-form-group">
                    <label>Quote Content</label>
                    <textarea id="block-${i}-content" rows="3">${escapeHtml(el.content)}</textarea>
                </div>
                <div class="builder-form-group">
                    <label>Attribution</label>
                    <input type="text" id="block-${i}-attr" value="${escapeHtml(el.attribution)}">
                </div>
            `;
        } else if (el.type === 'stat') {
            fieldsHtml = `
                <div class="builder-form-group">
                    <label>Number</label>
                    <input type="text" id="block-${i}-num" value="${escapeHtml(el.number)}">
                </div>
                <div class="builder-form-group">
                    <label>Label</label>
                    <input type="text" id="block-${i}-label" value="${escapeHtml(el.label)}">
                </div>
            `;
        } else if (el.type === 'callout') {
            fieldsHtml = `
                <div class="builder-form-group">
                    <label>Variant</label>
                    <select id="block-${i}-variant">
                        <option value="info" ${el.variant === 'info' ? 'selected' : ''}>Info</option>
                        <option value="warning" ${el.variant === 'warning' ? 'selected' : ''}>Warning</option>
                        <option value="success" ${el.variant === 'success' ? 'selected' : ''}>Success</option>
                        <option value="danger" ${el.variant === 'danger' ? 'selected' : ''}>Danger</option>
                    </select>
                </div>
                <div class="builder-form-group">
                    <label>Icon (Emoji)</label>
                    <input type="text" id="block-${i}-icon" value="${escapeHtml(el.icon)}">
                </div>
                <div class="builder-form-group">
                    <label>Content</label>
                    <textarea id="block-${i}-content" rows="3">${escapeHtml(el.content)}</textarea>
                </div>
            `;
        } else if (el.type === 'bento-grid' || el.type === 'timeline' || el.type === 'feature-list' || el.type === 'pyramid' || el.type === 'chart') {
            fieldsHtml = `
                <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 1rem;">Nested Items:</div>
                ${(el.items || []).map((item, j) => `
                    <div style="padding-left: 1rem; border-left: 2px solid #38bdf8; margin-bottom: 1rem;">
                        <div class="builder-form-group">
                            <label>Item ${j+1} Title</label>
                            <input type="text" id="block-${i}-item-${j}-title" value="${escapeHtml(item.title)}">
                        </div>
                        <div class="builder-form-group">
                            <label>Item ${j+1} Content</label>
                            <textarea id="block-${i}-item-${j}-content" rows="2">${escapeHtml(item.content)}</textarea>
                        </div>
                        ${el.type === 'grid' ? `
                        <div class="builder-form-group">
                            <label>Item ${j+1} Icon (Emoji)</label>
                            <input type="text" id="block-${i}-item-${j}-icon" value="${escapeHtml(item.icon)}">
                        </div>
                        ` : ''}
                        ${el.type === 'bento-grid' ? `
                        <div class="builder-form-group">
                            <label>Item ${j+1} Image</label>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn-secondary" id="block-${i}-item-${j}-upload" style="flex:1; padding: 0.5rem; font-size: 0.8rem;">Upload</button>
                                <button class="btn-secondary" id="block-${i}-item-${j}-ai" style="flex:1; padding: 0.5rem; font-size: 0.8rem;">AI Gen</button>
                                <button class="btn-ghost" id="block-${i}-item-${j}-clear" style="flex:1; padding: 0.5rem; font-size: 0.8rem; color: #ef4444;">Remove</button>
                            </div>
                            ${item.bgImage ? `<div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.5rem; word-break: break-all;">Current: ${item.bgImage}</div>` : ''}
                        </div>
                        ` : ''}
                    </div>
                    </div>
                `).join('')}
            `;
        } else if (el.type === 'table') {
            fieldsHtml = `
                <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 1rem;">Table Columns (Max 3):</div>
                <div class="builder-form-group" style="display: flex; gap: 0.5rem;">
                    <input type="text" id="block-${i}-header-0" value="${escapeHtml(el.headers?.[0] || '')}" placeholder="Header 1" style="flex:1;">
                    <input type="text" id="block-${i}-header-1" value="${escapeHtml(el.headers?.[1] || '')}" placeholder="Header 2" style="flex:1;">
                    <input type="text" id="block-${i}-header-2" value="${escapeHtml(el.headers?.[2] || '')}" placeholder="Header 3" style="flex:1;">
                </div>
                <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 1rem; margin-top: 1rem;">Table Rows:</div>
                ${(el.items || []).map((item, j) => `
                    <div style="padding-left: 1rem; border-left: 2px solid #38bdf8; margin-bottom: 1rem; display: flex; gap: 0.5rem;">
                        <input type="text" id="block-${i}-item-${j}-col1" value="${escapeHtml(item.col1)}" placeholder="Col 1" style="flex:1;">
                        <input type="text" id="block-${i}-item-${j}-col2" value="${escapeHtml(item.col2)}" placeholder="Col 2" style="flex:1;">
                        <input type="text" id="block-${i}-item-${j}-col3" value="${escapeHtml(item.col3)}" placeholder="Col 3" style="flex:1;">
                    </div>
                `).join('')}
            `;
        } else if (el.type === 'comparison') {
             fieldsHtml = `
                 <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 1rem;">Left Side:</div>
                 <div class="builder-form-group">
                    <label>Title</label>
                    <input type="text" id="block-${i}-left-title" value="${escapeHtml(el.left?.title)}">
                 </div>
                 <div class="builder-form-group">
                    <label>Content</label>
                    <textarea id="block-${i}-left-content" rows="2">${escapeHtml(el.left?.content)}</textarea>
                 </div>
                 <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 1rem;">Right Side:</div>
                 <div class="builder-form-group">
                    <label>Title</label>
                    <input type="text" id="block-${i}-right-title" value="${escapeHtml(el.right?.title)}">
                 </div>
                 <div class="builder-form-group">
                    <label>Content</label>
                    <textarea id="block-${i}-right-content" rows="2">${escapeHtml(el.right?.content)}</textarea>
                 </div>
             `;
        } else {
            fieldsHtml = `<div style="font-size: 0.8rem; color: #94a3b8;">Block properties editing not yet supported for ${el.type}.</div>`;
        }

        return `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; position: relative;">
                <div style="font-size: 0.7rem; text-transform: uppercase; color: #38bdf8; margin-bottom: 1rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                    <span>Block: ${el.type}</span>
                    <div style="display: flex; gap: 0.25rem;">
                        <button class="btn-ghost block-control-btn" data-action="up" data-index="${i}" title="Move Up" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">↑</button>
                        <button class="btn-ghost block-control-btn" data-action="down" data-index="${i}" title="Move Down" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">↓</button>
                        <button class="btn-ghost block-control-btn" data-action="delete" data-index="${i}" title="Delete Block" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; color: #ef4444;">✕</button>
                    </div>
                </div>
                ${fieldsHtml}
            </div>
        `;
    }).join('');
};

const createDefaultElement = (type) => {
    switch (type) {
        case 'text': return { type: 'text', content: 'New Text Block', typography: 'p', animation: 'fade-in', delay: 0 };
        case 'quote': return { type: 'quote', content: 'Inspirational quote.', attribution: 'Author', animation: 'fade-in', delay: 0 };
        case 'stat': return { type: 'stat', number: '100%', label: 'Success Rate', animation: 'pop-in', delay: 0 };
        case 'callout': return { type: 'callout', variant: 'info', icon: 'ℹ️', content: 'Important information.', animation: 'pop-in', delay: 0 };
        case 'bento-grid': return { type: 'bento-grid', animation: 'slide-up', delay: 0, items: [{ title: "Item 1", content: "Details" }] };
        case 'timeline': return { type: 'timeline', animation: 'slide-up', delay: 0, items: [{ title: "Step 1", content: "Details" }] };
        case 'comparison': return { type: 'comparison', animation: 'slide-up', delay: 0, left: { title: "Old", content: "..." }, right: { title: "New", content: "..." } };
        case 'feature-list': return { type: 'feature-list', animation: 'slide-in-right', delay: 0, items: [{ title: "Feature", content: "Details" }] };
        case 'pyramid': return { type: 'pyramid', animation: 'slide-up', delay: 0, items: [{ title: "Peak", content: "Top level" }, { title: "Middle", content: "Core concept" }, { title: "Base", content: "Foundation" }] };
        case 'table': return { type: 'table', animation: 'fade-in', delay: 0, headers: ["Feature", "Basic", "Pro"], items: [{ col1: "Support", col2: "Email", col3: "24/7 Phone" }] };
        case 'chart': return { type: 'chart', animation: 'slide-up', delay: 0, items: [{ title: "Q1", content: "40" }, { title: "Q2", content: "65" }, { title: "Q3", content: "90" }] };
        default: return { type: 'text', content: 'Unknown block type.' };
    }
};

const bindBlockFields = (elements) => {
    elements.forEach((el, i) => {
        if (el.type === 'text') {
            document.getElementById(`block-${i}-content`).addEventListener('input', (e) => {
                el.content = e.target.value;
                triggerLivePreview();
            });
        } else if (el.type === 'quote') {
            document.getElementById(`block-${i}-content`).addEventListener('input', (e) => {
                el.content = e.target.value;
                triggerLivePreview();
            });
            document.getElementById(`block-${i}-attr`).addEventListener('input', (e) => {
                el.attribution = e.target.value;
                triggerLivePreview();
            });
        } else if (el.type === 'stat') {
            document.getElementById(`block-${i}-num`).addEventListener('input', (e) => {
                el.number = e.target.value;
                triggerLivePreview();
            });
            document.getElementById(`block-${i}-label`).addEventListener('input', (e) => {
                el.label = e.target.value;
                triggerLivePreview();
            });
        } else if (el.type === 'callout') {
            document.getElementById(`block-${i}-variant`).addEventListener('change', (e) => {
                el.variant = e.target.value;
                triggerLivePreview();
            });
            document.getElementById(`block-${i}-icon`).addEventListener('input', (e) => {
                el.icon = e.target.value;
                triggerLivePreview();
            });
            document.getElementById(`block-${i}-content`).addEventListener('input', (e) => {
                el.content = e.target.value;
                triggerLivePreview();
            });
        } else if (el.type === 'bento-grid' || el.type === 'timeline' || el.type === 'feature-list' || el.type === 'pyramid' || el.type === 'chart') {
            (el.items || []).forEach((item, j) => {
                document.getElementById(`block-${i}-item-${j}-title`).addEventListener('input', (e) => {
                    item.title = e.target.value;
                    triggerLivePreview();
                });
                document.getElementById(`block-${i}-item-${j}-content`).addEventListener('input', (e) => {
                    item.content = e.target.value;
                    triggerLivePreview();
                });
                if (el.type === 'bento-grid') {
                    document.getElementById(`block-${i}-item-${j}-upload`)?.addEventListener('click', (e) => {
                        handleImageAction('upload', (url) => {
                            item.bgImage = url;
                            triggerLivePreview();
                            renderInspector();
                        }, e.target);
                    });
                    document.getElementById(`block-${i}-item-${j}-ai`)?.addEventListener('click', (e) => {
                        handleImageAction('ai', (url) => {
                            item.bgImage = url;
                            triggerLivePreview();
                            renderInspector();
                        }, e.target);
                    });
                    document.getElementById(`block-${i}-item-${j}-clear`)?.addEventListener('click', (e) => {
                        item.bgImage = ""; // Clear the image
                        triggerLivePreview();
                        renderInspector();
                    });
                }
            });
        } else if (el.type === 'table') {
            [0, 1, 2].forEach(colIndex => {
                document.getElementById(`block-${i}-header-${colIndex}`)?.addEventListener('input', (e) => {
                    el.headers[colIndex] = e.target.value;
                    triggerLivePreview();
                });
            });
            (el.items || []).forEach((item, j) => {
                document.getElementById(`block-${i}-item-${j}-col1`)?.addEventListener('input', (e) => { item.col1 = e.target.value; triggerLivePreview(); });
                document.getElementById(`block-${i}-item-${j}-col2`)?.addEventListener('input', (e) => { item.col2 = e.target.value; triggerLivePreview(); });
                document.getElementById(`block-${i}-item-${j}-col3`)?.addEventListener('input', (e) => { item.col3 = e.target.value; triggerLivePreview(); });
            });
        } else if (el.type === 'comparison') {
             document.getElementById(`block-${i}-left-title`).addEventListener('input', (e) => {
                el.left.title = e.target.value; triggerLivePreview();
             });
             document.getElementById(`block-${i}-left-content`).addEventListener('input', (e) => {
                el.left.content = e.target.value; triggerLivePreview();
             });
             document.getElementById(`block-${i}-right-title`).addEventListener('input', (e) => {
                el.right.title = e.target.value; triggerLivePreview();
             });
             document.getElementById(`block-${i}-right-content`).addEventListener('input', (e) => {
                el.right.content = e.target.value; triggerLivePreview();
             });
        }
    });
};
