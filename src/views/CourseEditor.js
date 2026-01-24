import { updateCourse } from '../api/courses'

export const renderCourseEditor = (course, user) => {
    let modules = typeof course.content_json === 'string'
        ? JSON.parse(course.content_json)
        : course.content_json

    const render = () => {
        document.querySelector('main').innerHTML = `
      <div class="glass" style="padding: 2rem; border-radius: var(--radius-lg); margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <button id="back-btn" class="btn-secondary">← Back</button>
                <h2 style="margin: 0;">Edit Course</h2>
            </div>
            <div style="display: flex; gap: 1rem; align-items: center;">
                <span id="status-badge" style="padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.8rem; font-weight: bold; background: ${course.status === 'live' ? '#10b981' : '#f59e0b'}; color: black;">
                    ${course.status.toUpperCase()}
                </span>
                <button id="toggle-status" class="btn-primary" style="background: ${course.status === 'live' ? '#f59e0b' : '#10b981'};">
                    ${course.status === 'live' ? 'Unpublish (Draft)' : 'Publish (Live)'}
                </button>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 300px; gap: 2rem;">
            <!-- Left: Content Editor -->
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                        <label style="color: var(--text-muted);">Course Title</label>
                        <span id="title-char-count" style="font-size: 0.75rem; color: var(--text-muted);">${course.title.length}/50</span>
                    </div>
                    <input type="text" id="edit-title" value="${course.title}" maxlength="60" style="width: 100%; padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; box-sizing: border-box;">
                </div>
                
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                        <label style="color: var(--text-muted);">Short Description</label>
                        <span id="desc-char-count" style="font-size: 0.75rem; color: var(--text-muted);">${(course.description || '').length}/140</span>
                    </div>
                    <textarea id="edit-desc" rows="3" maxlength="200" style="width: 100%; padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; box-sizing: border-box;">${course.description || ''}</textarea>
                </div>

                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <label style="color: var(--text-muted); margin: 0;">Course Modules</label>
                        <button id="add-module" class="btn-secondary" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;">+ Add Module</button>
                    </div>
                    
                    <div id="modules-container" style="display: flex; flex-direction: column; gap: 1rem;">
                        ${modules.map((mod, mIdx) => `
                            <div class="glass" style="padding: 1rem; border: 1px solid var(--glass-border); border-radius: var(--radius-md);">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; align-items: center;">
                                    <input type="text" class="mod-title" data-idx="${mIdx}" value="${mod.title}" placeholder="Module Title" style="background: transparent; border: none; color: white; font-weight: bold; width: 60%;">
                                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                                      ${mod.slides_url ? '<span style="font-size: 0.7rem; background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 6px; border-radius: 4px;">Slides Ready</span>' : ''}
                                      <button class="remove-mod btn-danger" data-idx="${mIdx}" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">Remove</button>
                                    </div>
                                </div>
                                <div style="padding-left: 1rem; border-left: 2px solid var(--glass-border); display: flex; flex-direction: column; gap: 0.5rem;">
                                    ${mod.lessons.map((lesson, lIdx) => `
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="text" class="lesson-title" data-midx="${mIdx}" data-lidx="${lIdx}" value="${lesson.title}" style="flex: 1; background: rgba(0,0,0,0.2); border: none; padding: 0.25rem 0.5rem; border-radius: 4px; color: white;">
                                            ${lesson.audio_url ? '<span style="font-size: 1.2rem;" title="Audio Ready">🎵</span>' : ''}
                                            ${lesson.quiz ? '<span style="font-size: 1.2rem;" title="Quiz Ready">📝</span>' : ''}
                                            <button class="edit-content-btn btn-ghost" data-midx="${mIdx}" data-lidx="${lIdx}" style="font-size: 0.8rem; border: 1px solid var(--glass-border);">Edit</button>
                                            <button class="remove-lesson btn-danger" data-midx="${mIdx}" data-lidx="${lIdx}" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">×</button>
                                        </div>
                                    `).join('')}
                                    <button class="add-lesson btn-ghost" data-midx="${mIdx}" style="text-align: left; font-size: 0.8rem; padding: 0.25rem 0;">+ Add Lesson</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Right: Metadata & Actions -->
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
               <div id="thumb-container" class="glass" style="padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
                   <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                       <label style="color: var(--text-muted); margin: 0; font-size: 0.9rem;">Course Image</label>
                       <button id="toggle-thumb-url" style="background: none; border: none; color: var(--primary); font-size: 0.7rem; cursor: pointer; padding: 0;">Edit URL</button>
                   </div>
                   
                   <div id="thumb-url-wrapper" style="display: none; margin-bottom: 1rem;">
                       <input type="text" id="edit-thumb" value="${course.thumbnail_url || ''}" style="width: 100%; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; font-size: 0.8rem;">
                   </div>

                   <div id="thumb-preview" style="height: 160px; background: #111; border-radius: var(--radius-sm); overflow: hidden; position: relative; border: 1px solid rgba(255,255,255,0.05);">
                       ${course.thumbnail_url
                ? `<img src="${course.thumbnail_url}" onerror="this.src='https://placehold.co/800x600/128ecd/ffffff?text=Image+Load+Error'" style="width: 100%; height: 100%; object-fit: cover;">`
                : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 0.8rem;">No Thumbnail</div>`
            }
                       <div id="thumb-re-gen" style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); padding: 0.5rem; text-align: center; cursor: pointer; transition: all 0.2s; opacity: 0;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
                           <span style="font-size: 0.75rem; color: white; font-weight: bold;">Regenerate with AI</span>
                       </div>
                   </div>
               </div>
               
               <button id="save-changes" class="btn-primary" style="width: 100%;">Save Changes</button>
            </div>
        </div>
      </div>

       <!-- Content Editor Modal -->
       <div id="editor-modal" class="glass" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 2rem; border-radius: var(--radius-lg); z-index: 1000; width: 90vw; max-width: 1200px; height: 85vh; display: flex; flex-direction: column; box-shadow: 0 50px 100px rgba(0,0,0,0.7);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="margin: 0;">Edit Lesson Details</h3>
                <div style="display: flex; gap: 1rem;">
                    <button id="cancel-edit-content" class="btn-ghost">Cancel</button>
                    <button id="save-content-btn" class="btn-primary">Done</button>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; flex: 1; overflow: hidden;">
                <!-- Content Area -->
                <div style="display: flex; flex-direction: column; overflow: hidden;">
                    <label style="color: var(--text-muted); margin-bottom: 0.5rem;">Markdown Content</label>
                    <textarea id="lesson-content-area" style="flex: 1; width: 100%; padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; font-family: monospace; resize: none; box-sizing: border-box;"></textarea>
                </div>

                <!-- Resources Area -->
                <div style="display: flex; flex-direction: column; border-left: 1px solid var(--glass-border); padding-left: 2rem; overflow: hidden;">
                    <label style="color: var(--text-muted); margin-bottom: 0.5rem;">Lesson Resources</label>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0; margin-bottom: 1rem;">Add links to documents, external sites, or reference materials.</p>
                    
                    <div id="resources-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;">
                        <!-- Resources rendered here -->
                    </div>

                    <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: var(--radius-md);">
                        <label style="font-size: 0.8rem; color: var(--text-muted);">Add New Resource</label>
                        <input type="text" id="res-title" placeholder="Title (e.g. Employee Handbook)" style="width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; border-radius: 4px;">
                        <input type="text" id="res-url" placeholder="URL (https://...)" style="width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; border-radius: 4px;">
                        <button id="add-resource-btn" class="btn-secondary" style="width: 100%; font-size: 0.8rem;">+ Add Resource</button>
                    </div>
                </div>
            </div>
       </div>
       <div id="editor-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 999; backdrop-filter: blur(5px);"></div>
    `
        document.getElementById('editor-modal').style.display = 'none'
        attachEvents()
    }

    const attachEvents = () => {
        // Back
        document.getElementById('back-btn').addEventListener('click', () => {
            import('../main').then(m => m.renderMainLayout(user))
        })

        // Toggle Status
        document.getElementById('toggle-status').addEventListener('click', async () => {
            const newStatus = course.status === 'live' ? 'draft' : 'live'
            try {
                const updated = await updateCourse(course.id, { status: newStatus })
                course.status = newStatus
                render()
            } catch (e) {
                alert('Failed to update status')
            }
        })

        // Thumbnail URL Toggle
        const thumbUrlWrapper = document.getElementById('thumb-url-wrapper');
        document.getElementById('toggle-thumb-url').addEventListener('click', () => {
            const isHidden = thumbUrlWrapper.style.display === 'none';
            thumbUrlWrapper.style.display = isHidden ? 'block' : 'none';
            document.getElementById('toggle-thumb-url').innerText = isHidden ? 'Hide URL' : 'Edit URL';
        });

        // Thumbnail Regeneration (Placeholder logic for now as it requires api/images)
        document.getElementById('thumb-re-gen').addEventListener('click', async () => {
            if (confirm('Regenerate image using AI? This will create a new thumbnail based on the course title.')) {
                try {
                    const genBtn = document.getElementById('thumb-re-gen');
                    genBtn.innerText = 'Generating...';
                    genBtn.style.opacity = '1';

                    const { generateThumbnail } = await import('../api/images');
                    const newUrl = await generateThumbnail(course.title);

                    if (newUrl) {
                        document.getElementById('edit-thumb').value = newUrl;
                        const img = document.querySelector('#thumb-preview img');
                        if (img) img.src = newUrl;
                        else document.getElementById('thumb-preview').innerHTML = `<img src="${newUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
                        alert('New thumbnail generated! Remember to click "Save Changes" to persist.');
                    }
                } catch (e) {
                    alert('Failed to regenerate thumbnail');
                } finally {
                    document.getElementById('thumb-re-gen').innerText = 'Regenerate with AI';
                    document.getElementById('thumb-re-gen').style.opacity = '0';
                }
            }
        });

        // Character Counters Logic
        const titleInput = document.getElementById('edit-title');
        const descInput = document.getElementById('edit-desc');
        const titleCount = document.getElementById('title-char-count');
        const descCount = document.getElementById('desc-char-count');

        const updateCounters = () => {
            const tLen = titleInput.value.length;
            const dLen = descInput.value.length;

            titleCount.textContent = `${tLen}/50`;
            titleCount.style.color = tLen > 50 ? '#ef4444' : 'var(--text-muted)';

            descCount.textContent = `${dLen}/140`;
            descCount.style.color = dLen > 140 ? '#ef4444' : 'var(--text-muted)';
        };

        titleInput.addEventListener('input', updateCounters);
        descInput.addEventListener('input', updateCounters);

        // Save Changes
        document.getElementById('save-changes').addEventListener('click', async () => {
            const title = titleInput.value
            const desc = descInput.value
            const thumb = document.getElementById('edit-thumb').value

            if (title.length > 50) {
                alert('Course Title must be 50 characters or fewer for a consistent look.');
                return;
            }
            if (desc.length > 140) {
                alert('Short Description should be 140 characters or fewer.');
                return;
            }

            document.getElementById('save-changes').innerText = 'Saving...'
            try {
                await updateCourse(course.id, {
                    title,
                    description: desc,
                    thumbnail_url: thumb,
                    content_json: modules,
                    updated_at: new Date()
                })
                alert('Changes saved successfully!')
            } catch (e) {
                console.error(e)
                alert('Failed to save changes')
            } finally {
                document.getElementById('save-changes').innerText = 'Save Changes'
            }
        })

        // Editing Inputs
        document.querySelectorAll('.mod-title').forEach(input => {
            input.addEventListener('input', (e) => {
                modules[e.target.dataset.idx].title = e.target.value
            })
        })

        document.querySelectorAll('.lesson-title').forEach(input => {
            input.addEventListener('input', (e) => {
                modules[e.target.dataset.midx].lessons[e.target.dataset.lidx].title = e.target.value
            })
        })

        // Modal Handling
        const modal = document.getElementById('editor-modal')
        const overlay = document.getElementById('editor-overlay')
        const textArea = document.getElementById('lesson-content-area')
        const resourcesList = document.getElementById('resources-list')
        const resTitleInput = document.getElementById('res-title')
        const resUrlInput = document.getElementById('res-url')

        let editingLesson = null
        let currentResources = []

        const renderResources = () => {
            resourcesList.innerHTML = currentResources.map((res, i) => `
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 4px;">
                    <div style="overflow: hidden; text-overflow: ellipsis;">
                        <div style="font-weight: bold; font-size: 0.9rem;">${res.title}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); opacity: 0.7;">${res.url}</div>
                    </div>
                    <button class="btn-danger remove-res" data-idx="${i}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">×</button>
                </div>
            `).join('') || '<div style="color: var(--text-muted); font-size: 0.8rem; font-style: italic;">No resources added yet.</div>'

            // Re-attach delete listeners
            document.querySelectorAll('.remove-res').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.idx)
                    currentResources.splice(idx, 1)
                    renderResources()
                })
            })
        }

        document.getElementById('add-resource-btn').addEventListener('click', () => {
            const title = resTitleInput.value.trim()
            const url = resUrlInput.value.trim()

            if (!title || !url) {
                alert('Please enter both a title and a URL')
                return
            }

            currentResources.push({ title, url })
            resTitleInput.value = ''
            resUrlInput.value = ''
            renderResources()
        })

        document.querySelectorAll('.edit-content-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mIdx = e.target.dataset.midx
                const lIdx = e.target.dataset.lidx
                editingLesson = modules[mIdx].lessons[lIdx]

                textArea.value = (editingLesson.content || '').replace(/\\n/g, '\n')
                currentResources = [...(editingLesson.resources || [])]

                renderResources()
                modal.style.display = 'flex'
                overlay.style.display = 'block'
            })
        })

        document.getElementById('cancel-edit-content').addEventListener('click', () => {
            modal.style.display = 'none'
            overlay.style.display = 'none'
        })

        document.getElementById('save-content-btn').addEventListener('click', () => {
            if (editingLesson) {
                editingLesson.content = textArea.value
                editingLesson.resources = currentResources
            }
            modal.style.display = 'none'
            overlay.style.display = 'none'
        })
    }

    render()
}
