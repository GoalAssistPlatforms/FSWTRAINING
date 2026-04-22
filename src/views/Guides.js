import { processAndUploadGuide, processAndUploadWebLink, chatWithGuides, fetchAllGuides, deleteGuide, fetchSystemTags } from '../api/guides.js';
import { getCourses, deleteCourse } from '../api/courses.js';
import { fswAlert, fswConfirm } from '../utils/dialog';

export const renderGuides = (user, stats) => {
    let statsHtml = '';
    if (stats && user.role === 'manager') {
        const renewalDateStr = stats.renewalDate ? stats.renewalDate.toLocaleDateString() : 'N/A';
        statsHtml = `
            <div style="font-size: 0.8rem; margin-bottom: 1.5rem; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 0.8rem; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: var(--primary); font-weight: bold;">${stats.used} / ${stats.total} Guides Used</span>
                <span style="color: var(--text-muted);">Renews: ${renewalDateStr}</span>
            </div>
        `;
    }

    return `
    <div class="guides-container fade-in" style="display: grid; grid-template-columns: 320px 1fr; gap: 0; height: calc(100vh - 180px);">
        
        <!-- Left Sidebar: Document Library -->
        <div style="background: rgba(255,255,255,0.02); border-right: 1px solid rgba(255,255,255,0.05); padding: 1.5rem; overflow-y: auto; height: 100%; display: flex; flex-direction: column;">
            <div style="margin-bottom: 1.5rem;">
                <h3 style="margin: 0 0 1rem 0; font-size: 1.2rem; color: white;">Guides Explorer</h3>
                <div style="position: relative;">
                    <input type="text" id="guide-search-input" placeholder="Search guides..." style="width: 100%; padding: 0.6rem 1rem 0.6rem 2rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); border-radius: 20px; color: white; font-size: 0.8rem; outline: none; box-sizing: border-box; transition: border-color 0.3s;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </div>
            </div>

            ${user.role === 'manager' ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                <div id="upload-zone" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-md); padding: 0.8rem; text-align: center; cursor: pointer; transition: all 0.3s; display: flex; flex-direction: column; justify-content: center;">
                    <div style="font-size: 1.2rem; margin-bottom: 0.2rem;">📄</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">Upload PDF</div>
                    <input type="file" id="guide-file-input" accept=".pdf" style="display: none;">
                </div>
                
                <div id="create-interactive-guide-btn" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); padding: 0.8rem; text-align: center; cursor: pointer; transition: all 0.3s; display: flex; flex-direction: column; justify-content: center;">
                    <div style="font-size: 1.2rem; margin-bottom: 0.2rem;">🖱️</div>
                    <div style="font-size: 0.7rem; color: #10b981;">Build Guide</div>
                </div>

                <div id="add-link-btn" style="background: rgba(66, 133, 244, 0.1); border: 1px solid rgba(66, 133, 244, 0.3); border-radius: var(--radius-md); padding: 0.8rem; text-align: center; cursor: pointer; transition: all 0.3s; display: flex; flex-direction: column; justify-content: center;">
                    <div style="font-size: 1.2rem; margin-bottom: 0.2rem;">🔗</div>
                    <div style="font-size: 0.7rem; color: #4285f4;">Add Link</div>
                </div>

            </div>
            ${statsHtml}
            <div id="upload-progress" style="margin-top: 0; margin-bottom: 1rem; font-size: 0.8rem; color: var(--primary); font-weight: bold; display: none; text-align: center;"></div>
            ` : ''}

            <!-- Interactive Guides -->
            <h4 onclick="const l = document.getElementById('interactive-guides-list'); l.style.display = l.style.display==='none' ? 'flex' : 'none'; this.querySelector('span').innerText = l.style.display==='none' ? '▶' : '▼';" style="cursor: pointer; color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; padding-bottom: 0.5rem;">Interactive Software Guides <span style="float: right; font-size: 0.7rem;">▼</span></h4>
            <div id="interactive-guides-list" style="display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 2rem;">
                <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">Loading interactive guides...</div>
            </div>

            <!-- Document Guides -->
            <h4 onclick="const l = document.getElementById('guides-list'); l.style.display = l.style.display==='none' ? 'flex' : 'none'; this.querySelector('span').innerText = l.style.display==='none' ? '▶' : '▼';" style="cursor: pointer; color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; padding-bottom: 0.5rem;">Documents <span style="float: right; font-size: 0.7rem;">▼</span></h4>
            <div id="guides-list" style="display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 2rem;">
                <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">Loading documents...</div>
            </div>

            <!-- Web Links -->
            <h4 onclick="const l = document.getElementById('links-list'); l.style.display = l.style.display==='none' ? 'flex' : 'none'; this.querySelector('span').innerText = l.style.display==='none' ? '▶' : '▼';" style="cursor: pointer; color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; padding-bottom: 0.5rem;">Links & Web Resources <span style="float: right; font-size: 0.7rem;">▼</span></h4>
            <div id="links-list" style="display: flex; flex-direction: column; gap: 0.8rem; padding-bottom: 2rem;">
                <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">Loading links...</div>
            </div>
        </div>

        <!-- Center: Search & Chat (RAG AI) - Gemini Style -->
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; padding: 2rem; height: 100%;">
            
            <div id="chat-history" style="width: 100%; max-width: 800px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem; padding-bottom: 2rem; padding-top: 1rem;">
                <div id="chat-greeting" style="text-align: left; margin-top: 4rem; margin-bottom: 3rem; padding-left: 1rem;">
                    <h1 style="font-size: 3.5rem; margin: 0; background: linear-gradient(to right, #4285f4, #d96570, #9b72cb); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Hi ${user.full_name ? user.full_name.split(' ')[0] : (user.email ? user.email.split('@')[0] : 'there')},</h1>
                    <h2 style="font-size: 3.5rem; margin: 0.5rem 0 0 0; color: #444b53; line-height: 1.2;">What would you like to know?</h2>
                </div>
            </div>

            <div style="width: 100%; max-width: 800px; position: relative; margin-top: auto;">
                <input type="text" id="chat-input" placeholder="Ask FSW Assistant..." style="width: 100%; padding: 1.2rem 4rem 1.2rem 2rem; background: rgba(30, 31, 32, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 35px; color: white; font-size: 1.1rem; outline: none; box-sizing: border-box; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: background 0.3s, border-color 0.3s;" onfocus="this.style.background='rgba(40,41,42,0.9)'; this.style.borderColor='rgba(255,255,255,0.3)';" onblur="this.style.background='rgba(30,31,32,0.8)'; this.style.borderColor='rgba(255,255,255,0.1)';">
                <button id="send-chat-btn" style="position: absolute; right: 8px; top: 8px; bottom: 8px; padding: 0 1rem; background: white; border: none; border-radius: 30px; color: black; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
            </div>
            
            <div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; margin-top: 1.5rem; width: 100%; max-width: 800px;" id="chat-suggestions">
                <button class="suggestion-chip" style="background: rgba(30,31,32,0.6); padding: 0.8rem 1.2rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); color: white; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;"><span style="color: #4285f4">✏️</span> Summarize the WFH Policy</button>
                <button class="suggestion-chip" style="background: rgba(30,31,32,0.6); padding: 0.8rem 1.2rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); color: white; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;"><span style="color: #fbbc04">💡</span> How do I request PTO?</button>
                <button class="suggestion-chip" style="background: rgba(30,31,32,0.6); padding: 0.8rem 1.2rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); color: white; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;"><span style="color: #34a853">📊</span> How to create a Sales Order</button>
            </div>
        </div>
    </div>
    
    <!-- PDF Viewer Modal -->
    <div id="pdf-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;">
        <div style="background: var(--bg-dark); width: 90%; height: 90%; border-radius: var(--radius-lg); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
            <div style="padding: 1rem; background: rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <h3 style="margin: 0; color: white;">Document Viewer</h3>
                <button id="close-pdf-modal" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; padding: 0 0.5rem;">&times;</button>
            </div>
            <iframe id="pdf-iframe" style="flex: 1; width: 100%; border: none;"></iframe>
        </div>
    </div>
    
    <!-- Document Upload Modal -->
    <div id="upload-doc-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;">
        <div style="background: var(--bg-dark); padding: 2rem; border-radius: var(--radius-lg); width: 400px; max-width: 90%; border: 1px solid var(--glass-border);">
            <h3 style="margin-top: 0; color: white;">Upload Document Guide</h3>
            
            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Document Name</label>
            <input type="text" id="upload-title" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem;">
            
            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Description</label>
            <input type="text" id="upload-desc" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem;">

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Tags (comma separated)</label>
            <input type="text" id="upload-tags" list="upload-tags-list" placeholder="e.g. Policies, HR" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem;">
            <datalist id="upload-tags-list"></datalist>

            <div style="display: flex; gap: 1rem; justify-content: space-between;">
                <button id="cancel-upload-btn" class="btn-ghost" style="flex: 1;">Cancel</button>
                <button id="confirm-upload-btn" class="btn-primary" style="flex: 1;">Upload</button>
            </div>
        </div>
    </div>

    <!-- Web Link Modal -->
    <div id="add-link-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;">
        <div style="background: var(--bg-dark); padding: 2rem; border-radius: var(--radius-lg); width: 400px; max-width: 90%; border: 1px solid var(--glass-border);">
            <h3 style="margin-top: 0; color: white;">Add Web Resource</h3>
            
            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">URLs (Enter multiple links separated by commas or new lines)</label>
            <textarea id="link-url" placeholder="https://..." style="width: 100%; height: 100px; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; resize: vertical;"></textarea>
            
            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Tags (comma separated)</label>
            <input type="text" id="link-tags" placeholder="e.g. Training, External" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem;">

            <div style="display: flex; gap: 1rem; justify-content: space-between;">
                <button id="cancel-link-btn" class="btn-ghost" style="flex: 1;">Cancel</button>
                <button id="confirm-link-btn" class="btn-primary" style="flex: 1; background: #4285f4; border-color: #4285f4;">Add Link</button>
            </div>
        </div>
    </div>
    
    
    <style>
        #upload-zone:hover { border-color: var(--primary); background: rgba(255,255,255,0.05); }
        .source-link { display: inline-block; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; color: var(--primary); text-transform: uppercase; cursor: pointer; margin-top: 5px; }
        .source-link:hover { background: rgba(255,255,255,0.2); }
        .suggestion-chip { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 6px 12px; color: var(--text-muted); font-size: 0.8rem; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .suggestion-chip:hover { background: rgba(255,255,255,0.1); color: white; border-color: var(--primary); }
        #guide-search-input:focus { width: 180px; border-color: var(--primary); }
    </style>
    `
}

export const initGuidesEvents = async (user) => {
    const chatInput = document.getElementById('chat-input')
    const sendChatBtn = document.getElementById('send-chat-btn')
    const chatHistory = document.getElementById('chat-history')
    const guidesList = document.getElementById('guides-list')

    // Fetch and display guides
    const loadGuides = async () => {
        try {
            const guides = await fetchAllGuides()
            const linksList = document.getElementById('links-list')
            
            const pdfs = guides.filter(g => g.file_url && g.file_url.includes('/storage/'));
            const links = guides.filter(g => g.file_url && !g.file_url.includes('/storage/'));
            
            if (!pdfs || pdfs.length === 0) {
                guidesList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">No documents available yet.</div>`
            } else {
                guidesList.innerHTML = pdfs.map(g => `
                    <div class="guide-card clickable-doc-card card-hover" data-url="${g.file_url || ''}" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; display: flex; align-items: flex-start; justify-content: space-between; cursor: pointer;">
                       <div>
                            <h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; color: white;">${g.title}</h4>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Added ${new Date(g.created_at).toLocaleDateString()}</div>
                            ${g.tags && g.tags.length > 0 ? `<div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                ${g.tags.map(t => `<span class="guide-tag" data-tag="${t}" style="background: rgba(var(--primary-rgb), 0.2); border: 1px solid rgba(var(--primary-rgb), 0.5); padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; color: var(--primary); cursor: pointer;">${t}</span>`).join('')}
                            </div>` : ''}
                        </div>
                       <div style="display: flex; gap: 0.5rem;" onclick="event.stopPropagation()">
                           ${user.role === 'manager' ? `<button class="delete-guide-btn" data-id="${g.id}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); padding: 4px 8px; border-radius: 4px; color: white; cursor: pointer; font-size: 0.8rem;">X</button>` : ''}
                       </div>
                    </div>
                `).join('')
            }
            
            if (!links || links.length === 0) {
                linksList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">No external links available yet.</div>`
            } else {
                linksList.innerHTML = links.map(g => `
                    <div class="guide-card card-hover clickable-web-link" data-url="${g.file_url}" style="background: rgba(66, 133, 244, 0.05); border: 1px solid rgba(66, 133, 244, 0.2); padding: 1rem; border-radius: 8px; display: flex; align-items: flex-start; justify-content: space-between; cursor: pointer;">
                       <div>
                            <h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; color: white;">${g.description === 'YouTube Video' ? '▶️' : '🌐'} ${g.title}</h4>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Added ${new Date(g.created_at).toLocaleDateString()}</div>
                            ${g.tags && g.tags.length > 0 ? `<div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                ${g.tags.map(t => `<span class="guide-tag" data-tag="${t}" style="background: rgba(66, 133, 244, 0.2); border: 1px solid rgba(66, 133, 244, 0.5); padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; color: #4285f4; cursor: pointer;">${t}</span>`).join('')}
                            </div>` : ''}
                        </div>
                       <div style="display: flex; gap: 0.5rem;" onclick="event.stopPropagation()">
                           ${user.role === 'manager' ? `<button class="delete-guide-btn" data-id="${g.id}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); padding: 4px 8px; border-radius: 4px; color: white; cursor: pointer; font-size: 0.8rem;">X</button>` : ''}
                       </div>
                    </div>
                `).join('')
            }

            // Attach view listeners to the whole card
            document.querySelectorAll('.clickable-doc-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    const url = e.currentTarget.dataset.url;
                    if (url) {
                        document.getElementById('pdf-iframe').src = url;
                        document.getElementById('pdf-modal').style.display = 'flex';
                    }
                });
            });
            
            // Attach view listeners to web links
            document.querySelectorAll('.clickable-web-link').forEach(card => {
                card.addEventListener('click', (e) => {
                    const url = e.currentTarget.dataset.url;
                    if (url) {
                        window.open(url, '_blank');
                    }
                });
            });

            // Attach delete listeners
            if (user.role === 'manager') {
                document.querySelectorAll('.delete-guide-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        if (await fswConfirm('Delete this guide from the knowledge base?')) {
                            const id = e.target.dataset.id;
                            try {
                                await deleteGuide(id);
                                loadGuides();
                            } catch (err) {
                                await fswAlert("Failed to delete.");
                            }
                        }
                    })
                })
            }
        } catch (e) {
            console.error("Failed to load guides", e)
            guidesList.innerHTML = `<div style="color: #ef4444; font-size: 0.8rem;">Error loading guides</div>`
        }

        // LOAD INTERACTIVE GUIDES
        try {
            const courses = await getCourses(user.role);
            const interactiveGuides = courses.filter(c => c.content_json?.is_system_simulation === true);
            const interactiveGuidesList = document.getElementById('interactive-guides-list');
            
            if (!interactiveGuides || interactiveGuides.length === 0) {
                interactiveGuidesList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">No interactive guides available.</div>`;
            } else {
                interactiveGuidesList.innerHTML = interactiveGuides.map(g => `
                    <div class="guide-card clickable-interactive-card card-hover" data-course='${JSON.stringify(g).replace(/'/g, "&#39;")}' style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); padding: 1rem; border-radius: 8px; display: flex; align-items: flex-start; justify-content: space-between; cursor: pointer;">
                       <div>
                           <h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; color: white;">${g.title}</h4>
                           <div style="font-size: 0.75rem; color: var(--text-muted);">${g.description || 'No description'}</div>
                           ${g.tags && g.tags.length > 0 ? `<div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;" onclick="event.stopPropagation()">
                               ${g.tags.map(t => `<span class="guide-tag" data-tag="${t}" style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.5); padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; color: #10b981; cursor: pointer;">${t}</span>`).join('')}
                           </div>` : ''}
                       </div>
                       <div style="display: flex; gap: 0.5rem;" onclick="event.stopPropagation()">
                           ${user.role === 'manager' ? `<button class="edit-interactive-btn" data-course='${JSON.stringify(g).replace(/'/g, "&#39;")}' style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); padding: 4px 8px; border-radius: 4px; color: white; cursor: pointer; font-size: 0.8rem;">Edit</button>` : ''}
                           ${user.role === 'manager' ? `<button class="delete-interactive-btn" data-id="${g.id}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); padding: 4px 8px; border-radius: 4px; color: white; cursor: pointer; font-size: 0.8rem;">X</button>` : ''}
                       </div>
                    </div>
                `).join('');

                // View logic via card click
                document.querySelectorAll('.clickable-interactive-card').forEach(card => {
                    card.addEventListener('click', async (e) => {
                        const courseData = JSON.parse(e.currentTarget.dataset.course);
                        const { renderCoursePlayer } = await import('./CoursePlayer.js');
                        renderCoursePlayer(courseData, user);
                    });
                });

                // Edit/Delete logic
                if (user.role === 'manager') {
                    document.querySelectorAll('.edit-interactive-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const courseData = JSON.parse(e.target.dataset.course);
                            const { renderSystemBuilder, initSystemBuilder } = await import('./SystemBuilder.js');
                            
                            const viewGuides = document.getElementById('view-guides');
                            document.querySelector('.guides-container').style.display = 'none';
                            
                            const builderDiv = document.createElement('div');
                            builderDiv.id = 'sys-builder-container';
                            builderDiv.innerHTML = renderSystemBuilder();
                            viewGuides.appendChild(builderDiv);
                            
                            initSystemBuilder(() => {
                                builderDiv.remove();
                                document.querySelector('.guides-container').style.display = 'grid';
                                loadGuides();
                            }, courseData); // Pass existing guide!
                        });
                    });

                    document.querySelectorAll('.delete-interactive-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            if (await fswConfirm('Delete this interactive guide?')) {
                                try {
                                    await deleteCourse(e.target.dataset.id, user.role);
                                    loadGuides();
                                } catch (err) {
                                    await fswAlert("Failed to delete.");
                                }
                            }
                        });
                    });
                }
            }

            // Bind tag clicks to search
            document.querySelectorAll('.guide-tag').forEach(tag => {
                tag.addEventListener('click', (e) => {
                    const searchInput = document.getElementById('guide-search-input');
                    if (searchInput) {
                        searchInput.value = e.target.dataset.tag;
                        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            });

        } catch (e) {
            console.error("Failed to load interactive guides", e);
            const interactiveGuidesList = document.getElementById('interactive-guides-list');
            if (interactiveGuidesList) {
                interactiveGuidesList.innerHTML = `<div style="color: #ef4444; font-size: 0.8rem;">Error loading guides: ${e.message}</div>`;
            }
        }
    }

    loadGuides()

    fetchSystemTags().then(tags => {
        const list = document.getElementById('upload-tags-list');
        if (list) list.innerHTML = tags.map(t => `<option value="${t}"></option>`).join('');
    });

    // Manager Upload Logic
    if (user.role === 'manager') {
        const uploadZone = document.getElementById('upload-zone')
        const fileInput = document.getElementById('guide-file-input')
        const progressDiv = document.getElementById('upload-progress')

        const uploadModal = document.getElementById('upload-doc-modal')
        const titleInput = document.getElementById('upload-title')
        const descInput = document.getElementById('upload-desc')
        const tagsInput = document.getElementById('upload-tags')
        const cancelBtn = document.getElementById('cancel-upload-btn')
        const confirmBtn = document.getElementById('confirm-upload-btn')

        let pendingFile = null;

        uploadZone.addEventListener('click', () => fileInput.click())
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0]
            if (!file) return
            pendingFile = file;
            titleInput.value = file.name.replace(/\.[^/.]+$/, "");
            descInput.value = "PDF Document";
            tagsInput.value = "";
            uploadModal.style.display = 'flex';
        })

        cancelBtn.addEventListener('click', () => {
            uploadModal.style.display = 'none';
            pendingFile = null;
            fileInput.value = '';
        });

        confirmBtn.addEventListener('click', async () => {
            if (!pendingFile) return;
            uploadModal.style.display = 'none';
            progressDiv.style.display = 'block';

            const title = titleInput.value.trim() || pendingFile.name;
            const desc = descInput.value.trim() || 'PDF Document';
            const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
            
            try {
                await processAndUploadGuide(pendingFile, title, desc, tags, (progressMsg) => {
                    progressDiv.innerText = progressMsg
                })
                
                progressDiv.innerText = 'Upload complete!'
                setTimeout(() => progressDiv.style.display = 'none', 3000)
                loadGuides()
            } catch (err) {
                await fswAlert("Upload failed: " + err.message)
                progressDiv.style.display = 'none'
            }
            
            pendingFile = null;
            fileInput.value = '';
        })

        // Web Link upload logic
        const addLinkBtn = document.getElementById('add-link-btn')
        const linkModal = document.getElementById('add-link-modal')
        const linkUrlInput = document.getElementById('link-url')
        const linkTagsInput = document.getElementById('link-tags')
        const cancelLinkBtn = document.getElementById('cancel-link-btn')
        const confirmLinkBtn = document.getElementById('confirm-link-btn')

        if (addLinkBtn) {
            addLinkBtn.addEventListener('click', () => {
                linkUrlInput.value = '';
                linkTagsInput.value = '';
                linkModal.style.display = 'flex';
            })

            cancelLinkBtn.addEventListener('click', () => {
                linkModal.style.display = 'none';
            });

            confirmLinkBtn.addEventListener('click', async () => {
                const rawUrls = linkUrlInput.value.trim();
                if (!rawUrls) return;
                
                linkModal.style.display = 'none';
                progressDiv.style.display = 'block';

                const urlsToProcess = rawUrls.split(/[\n,]+/).map(u => u.trim()).filter(u => u.length > 5 && u.startsWith('http'));
                const tags = linkTagsInput.value.split(',').map(t => t.trim()).filter(t => t);
                
                try {
                    for (let i = 0; i < urlsToProcess.length; i++) {
                        const isBatch = urlsToProcess.length > 1;
                        if (isBatch) progressDiv.innerText = `Processing link ${i+1}/${urlsToProcess.length}...`;
                        
                        await processAndUploadWebLink(urlsToProcess[i], tags, (progressMsg) => {
                            if (!isBatch) progressDiv.innerText = progressMsg;
                        });
                    }
                    
                    progressDiv.innerText = 'All links uploaded and processed!'
                    setTimeout(() => progressDiv.style.display = 'none', 3000)
                    loadGuides()
                } catch (err) {
                    await fswAlert("Link processing failed: " + err.message)
                    progressDiv.style.display = 'none'
                }
            })
        }

        // Event listener for creating Interactive Guide
        const createInteractiveBtn = document.getElementById('create-interactive-guide-btn');
        if (createInteractiveBtn) {
            createInteractiveBtn.addEventListener('click', async () => {
                const { renderSystemBuilder, initSystemBuilder } = await import('./SystemBuilder.js');
                const viewGuides = document.getElementById('view-guides');
                
                // Hide main guides container, show builder
                document.querySelector('.guides-container').style.display = 'none';
                
                const builderDiv = document.createElement('div');
                builderDiv.id = 'sys-builder-container';
                builderDiv.innerHTML = renderSystemBuilder();
                viewGuides.appendChild(builderDiv);
                
                initSystemBuilder(() => {
                    // onClose form
                    builderDiv.remove();
                    document.querySelector('.guides-container').style.display = 'grid'; // restore
                    loadGuides(); // reload list
                });
            });
        }
    }

    // Chatbot Logic
    const appendMessage = (content, isUser = false, sources = []) => {
        const msgDiv = document.createElement('div')
        msgDiv.style.alignSelf = isUser ? 'flex-end' : 'flex-start'
        msgDiv.style.maxWidth = isUser ? '70%' : '100%'
        msgDiv.style.background = isUser ? 'rgba(40, 41, 42, 0.9)' : 'transparent'
        msgDiv.style.color = 'white'
        msgDiv.style.padding = isUser ? '1rem 1.5rem' : '1rem 0'
        msgDiv.style.borderRadius = isUser ? '20px' : '0'
        msgDiv.style.lineHeight = '1.6'
        msgDiv.style.fontSize = '1.05rem'

        // Convert simple markdown and linebreaks for AI response
        const formattedContent = content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        let sourceHtml = '';
        let embedHtml = '';
        
        if (sources && sources.length > 0) {
            // Deduplicate sources by document title
            const uniqueSources = [];
            const seenTitles = new Set();
            sources.forEach(s => {
                if (!seenTitles.has(s.document_title)) {
                    seenTitles.add(s.document_title);
                    uniqueSources.push(s);
                }
            });
            
            sourceHtml = `<div style="margin-top: 15px; display: flex; gap: 0.5rem; flex-wrap: wrap;">` + 
                         uniqueSources.map(src => {
                             if (src.is_interactive && src.courseData) {
                                 const courseDataStr = JSON.stringify(src.courseData).replace(/'/g, "&#39;");
                                 const embedId = 'sim-embed-' + Math.random().toString(36).substr(2, 9);
                                 embedHtml += `<div id="${embedId}" class="interactive-chat-embed" data-course='${courseDataStr}'></div>`;
                                 
                                 return `<span class="source-link interactive-source-link" data-course='${courseDataStr}' style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;"><span style="color: #34a853;">🖱️</span> ${src.document_title.replace('Interactive Guide: ', '')}</span>`;
                             } else {
                                 const fileUrl = src.file_url || '';
                                 const isYoutube = fileUrl.includes('youtube.com') || fileUrl.includes('youtu.be');
                                 
                                 // Build ChatGPT-style video embed if it's a YouTube source
                                 if (isYoutube) {
                                     const vidMatch = fileUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
                                     if (vidMatch) {
                                         embedHtml += `
                                            <div style="margin-top: 20px; margin-bottom: 5px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                                                <iframe width="100%" height="280" src="https://www.youtube.com/embed/${vidMatch[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                                            </div>
                                         `;
                                     }
                                 }
                                 
                                 return `<span class="source-link web-source-link" data-url="${fileUrl}" style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;"><span style="color: #fbbc04;">${isYoutube ? '▶️' : '📄'}</span> ${src.document_title}</span>`;
                             }
                         }).join(' ') +
                         `</div>`;
        }

        // Clean AI responses without sparkles
        const iconHtml = '';

        msgDiv.innerHTML = `<div style="display: flex; align-items: flex-start;">${iconHtml}<div style="flex: 1; width: 100%;">${formattedContent}${embedHtml}${sourceHtml}</div></div>`;
        
        // Render Interactive Guides Inline
        msgDiv.querySelectorAll('.interactive-chat-embed').forEach(async container => {
            const courseData = JSON.parse(container.dataset.course);
            const { renderSimulationPlayer } = await import('./components/SimulationPlayer.js');
            renderSimulationPlayer(courseData, user, container.id);
        });

        // Attach click listeners to isolated citation chips (allows fullscreen popup as well)
        msgDiv.querySelectorAll('.interactive-source-link').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const courseData = JSON.parse(e.target.dataset.course);
                const { renderCoursePlayer } = await import('./CoursePlayer.js');
                renderCoursePlayer(courseData, user);
            });
        });
        
        // Attach click listeners to external sources so they actually open
        msgDiv.querySelectorAll('.web-source-link').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.currentTarget.dataset.url;
                if (url && url !== 'undefined') {
                    if (url.includes('/storage/')) {
                        // For PDFs, load into PDF modal
                        document.getElementById('pdf-iframe').src = url;
                        document.getElementById('pdf-modal').style.display = 'flex';
                    } else {
                        window.open(url, '_blank');
                    }
                }
            });
        });

        chatHistory.appendChild(msgDiv)
        chatHistory.scrollTop = chatHistory.scrollHeight
    }

    const handleChat = async () => {
        const q = chatInput.value.trim()
        if (!q) return

        // Hide greeting and suggestions
        const greetingDiv = document.getElementById('chat-greeting');
        if (greetingDiv) greetingDiv.style.display = 'none';
        
        const suggestionsDiv = document.getElementById('chat-suggestions');
        if (suggestionsDiv) suggestionsDiv.style.display = 'none';

        appendMessage(q, true)
        chatInput.value = ''
        
        // Show loading indicator
        const loadingDiv = document.createElement('div')
        loadingDiv.innerHTML = `<span>Thinking...</span>`
        loadingDiv.style.alignSelf = 'flex-start'
        loadingDiv.style.color = 'var(--text-muted)'
        loadingDiv.style.padding = '1rem 0'
        loadingDiv.style.display = 'flex'
        loadingDiv.style.alignItems = 'center'
        loadingDiv.id = 'chat-loading'
        chatHistory.appendChild(loadingDiv)
        chatHistory.scrollTop = chatHistory.scrollHeight

        try {
            const result = await chatWithGuides(q)
            document.getElementById('chat-loading').remove()
            appendMessage(result.answer, false, result.sources)
        } catch (err) {
            console.error(err)
            document.getElementById('chat-loading').remove()
            appendMessage("I'm sorry, I'm having trouble accessing the knowledge base right now. Please try again later.", false)
        }
    }

    sendChatBtn.addEventListener('click', handleChat)
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChat()
    })

    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.innerText;
            handleChat();
        });
    });

    const searchInput = document.getElementById('guide-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const docs = document.querySelectorAll('#guides-list .guide-card');
            const interactives = document.querySelectorAll('#interactive-guides-list .guide-card');
            const links = document.querySelectorAll('#links-list .guide-card');
            
            [...docs, ...interactives, ...links].forEach(card => {
                const text = card.innerText.toLowerCase();
                card.style.display = text.includes(val) ? 'flex' : 'none';
            });
        });
    }

    // Modal close logic
    const pdfModal = document.getElementById('pdf-modal');
    const closePdfBtn = document.getElementById('close-pdf-modal');
    if (pdfModal && closePdfBtn) {
        closePdfBtn.addEventListener('click', () => {
            pdfModal.style.display = 'none';
            document.getElementById('pdf-iframe').src = '';
        });
        pdfModal.addEventListener('click', (e) => {
            if (e.target === pdfModal) {
                pdfModal.style.display = 'none';
                document.getElementById('pdf-iframe').src = '';
            }
        });
    }
}
