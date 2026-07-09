import { updateCourse } from '../api/courses'
import { supabase } from '../api/supabase'

import { fswAlert, fswConfirm } from '../utils/dialog'

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
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                        <label style="color: var(--text-muted);">Certificate Validity</label>
                    </div>
                    <select id="edit-expiry" style="width: 100%;">
                        <option value="" ${course.expiry_months ? '' : 'selected'}>Never Expires</option>
                        <option value="6" ${course.expiry_months === 6 ? 'selected' : ''}>6 Months</option>
                        <option value="12" ${course.expiry_months === 12 ? 'selected' : ''}>1 Year</option>
                        <option value="24" ${course.expiry_months === 24 ? 'selected' : ''}>2 Years</option>
                    </select>
                </div>
                <div style="margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" id="edit-pretest" ${course.allow_pretest ? 'checked' : ''} style="width: 1.2rem; height: 1.2rem; cursor: pointer;">
                    <label for="edit-pretest" style="color: white; font-size: 0.9rem; cursor: pointer; margin: 0; font-weight: bold;">Allow Diagnostic Pre-Test</label>
                </div>


            </div>

            <!-- Right: Metadata & Actions -->
            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
               <div id="thumb-container" class="glass" style="padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border);">
                   <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                       <label style="color: var(--text-muted); margin: 0; font-size: 0.9rem;">Course Image</label>
                       <button id="upload-thumb-btn" style="background: none; border: none; color: var(--primary); font-size: 0.7rem; cursor: pointer; padding: 0;">Upload Image</button>
                   </div>
                   
                   <div style="display: none;">
                       <input type="file" id="thumb-file-input" accept="image/*">
                       <input type="hidden" id="edit-thumb" value="${course.thumbnail_url || ''}">
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

    `
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
                await fswAlert('Failed to update status')
            }
        })

        // Image Upload Logic
        const uploadBtn = document.getElementById('upload-thumb-btn');
        const fileInput = document.getElementById('thumb-file-input');
        
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                uploadBtn.innerText = 'Uploading...';
                const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                
                const { data, error } = await supabase.storage
                    .from('course_assets')
                    .upload(fileName, file);

                if (error) throw error;

                const { data: publicUrlData } = supabase.storage
                    .from('course_assets')
                    .getPublicUrl(fileName);

                const newUrl = publicUrlData.publicUrl;
                
                document.getElementById('edit-thumb').value = newUrl;
                const img = document.querySelector('#thumb-preview img');
                if (img) {
                    img.src = newUrl;
                } else {
                    document.getElementById('thumb-preview').innerHTML = `<img src="${newUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
                }
            } catch (err) {
                console.error('Upload Error:', err);
                await fswAlert('Failed to upload image. Please try again.');
            } finally {
                uploadBtn.innerText = 'Upload Image';
                fileInput.value = ''; // Reset input
            }
        });

        // Thumbnail Regeneration (Placeholder logic for now as it requires api/images)
        document.getElementById('thumb-re-gen').addEventListener('click', async () => {
            if (await fswConfirm('Regenerate image using AI? This will create a new thumbnail based on the course title.')) {
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
                        await fswAlert('New thumbnail generated! Remember to click "Save Changes" to persist.');
                    }
                } catch (e) {
                    await fswAlert('Failed to regenerate thumbnail');
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
            const expiryRaw = document.getElementById('edit-expiry').value
            const expiry = expiryRaw ? parseInt(expiryRaw) : null
            const allowPretest = document.getElementById('edit-pretest')?.checked || false

            if (title.length > 50) {
                await fswAlert('Course Title must be 50 characters or fewer for a consistent look.');
                return;
            }
            if (desc.length > 140) {
                await fswAlert('Short Description should be 140 characters or fewer.');
                return;
            }

            document.getElementById('save-changes').innerText = 'Saving...'
            try {
                await updateCourse(course.id, {
                    title,
                    description: desc,
                    thumbnail_url: thumb,
                    content_json: modules,
                    expiry_months: expiry,
                    allow_pretest: allowPretest,
                    updated_at: new Date()
                })
                course.allow_pretest = allowPretest
                await fswAlert('Changes saved successfully!')
            } catch (e) {
                console.error(e)
                await fswAlert('Failed to save changes')
            } finally {
                document.getElementById('save-changes').innerText = 'Save Changes'
            }
        })


    }

    render()
}

