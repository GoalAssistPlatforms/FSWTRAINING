import { marked } from 'marked';
import { processAndUploadGuide, processAndUploadWebLink, chatWithGuides, fetchAllGuides, deleteGuide, fetchSystemTags } from '../api/guides.js';
import { getCourses, deleteCourse } from '../api/courses.js';
import { fswAlert, fswConfirm } from '../utils/dialog';

export const renderGuides = (user, stats) => {
    let statsHtml = '';

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

            <button id="manage-content-btn" class="btn-ghost" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border: 1px solid var(--glass-border); padding: 0.6rem; border-radius: var(--radius-md); font-size: 0.8rem; cursor: pointer; color: white; margin-bottom: 2rem; margin-top: 0.8rem; transition: background-color 0.2s;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                Manage Curation & Reviews
            </button>
            ` : ''}

            <!-- Software Guides -->
            <h4 onclick="const l = document.getElementById('interactive-guides-list'); l.style.display = l.style.display==='none' ? 'flex' : 'none'; this.querySelector('span').innerText = l.style.display==='none' ? '▶' : '▼';" style="cursor: pointer; color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; padding-bottom: 0.5rem;">Software Guides <span style="float: right; font-size: 0.7rem;">▶</span></h4>
            <div id="interactive-guides-list" style="display: none; flex-direction: column; gap: 0.8rem; margin-bottom: 2rem;">
                <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">Loading software guides...</div>
            </div>

            <!-- Document Guides -->
            <h4 onclick="const l = document.getElementById('guides-list'); l.style.display = l.style.display==='none' ? 'flex' : 'none'; this.querySelector('span').innerText = l.style.display==='none' ? '▶' : '▼';" style="cursor: pointer; color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; padding-bottom: 0.5rem;">Documents <span style="float: right; font-size: 0.7rem;">▶</span></h4>
            <div id="guides-list" style="display: none; flex-direction: column; gap: 0.8rem; margin-bottom: 2rem;">
                <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">Loading documents...</div>
            </div>

            <!-- Web Links -->
            <h4 onclick="const l = document.getElementById('links-list'); l.style.display = l.style.display==='none' ? 'flex' : 'none'; this.querySelector('span').innerText = l.style.display==='none' ? '▶' : '▼';" style="cursor: pointer; color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; padding-bottom: 0.5rem;">Links & Web Resources <span style="float: right; font-size: 0.7rem;">▶</span></h4>
            <div id="links-list" style="display: none; flex-direction: column; gap: 0.8rem; padding-bottom: 2rem;">
                <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">Loading links...</div>
            </div>
        </div>

        <!-- Center: Main Panel (Hides Chat / Shows Manager Dashboard) -->
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; padding: 2rem 2rem 5rem 2rem; height: 100%; box-sizing: border-box; overflow-y: auto;">

            <!-- Chat View -->
            <div id="guides-chat-view" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between;">
                <!-- Review Alert Banner (Manager Only) -->
                ${user.role === 'manager' ? `
                <div id="curation-alert-banner" class="glass fade-in" style="display: none; width: 100%; max-width: 800px; padding: 1rem; border-radius: var(--radius-md); border-left: 4px solid #ef4444; background: rgba(239, 68, 68, 0.1); align-items: center; justify-content: space-between; margin-bottom: 1rem; box-sizing: border-box; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; color: #fca5a5; font-size: 0.9rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"></path></svg>
                        <span id="curation-alert-text">Training materials require review.</span>
                    </div>
                    <button id="alert-audit-btn" class="btn-ghost" style="padding: 0.3rem 0.8rem; font-size: 0.8rem; border: 1px solid rgba(239, 68, 68, 0.4); color: white;">Audit Items</button>
                </div>
                ` : ''}

                <div id="chat-history" style="width: 100%; max-width: 800px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem; padding-bottom: 2rem; padding-top: 1rem;">
                    <div id="chat-greeting" style="text-align: left; margin-top: 3rem; margin-bottom: 2.5rem; padding-left: 1rem; display: flex; flex-direction: column; align-items: flex-start;">
                        <div style="display: flex; align-items: center; margin-bottom: 1.5rem;">
                            <img src="https://cjtevckufmaygyhnbtup.supabase.co/storage/v1/object/public/avatars/4313ce56-d8bc-4041-80e6-cb84938a8ac3_1781602741917.png" alt="Helen" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid rgba(255,255,255,0.15); box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 2; transition: transform 0.3s; cursor: pointer;" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
                            <img src="https://cjtevckufmaygyhnbtup.supabase.co/storage/v1/object/public/avatars/8ca7a52e-629b-44d5-8426-10dccf1093b8_1781603778024.png" alt="Lindsay" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid rgba(255,255,255,0.15); box-shadow: 0 8px 24px rgba(0,0,0,0.4); margin-left: -20px; z-index: 1; transition: transform 0.3s; cursor: pointer;" onmouseover="this.style.transform='scale(1.08)'; this.style.zIndex='3';" onmouseout="this.style.transform='scale(1)'; this.style.zIndex='1';">
                        </div>
                        <h1 style="font-size: 3.5rem; margin: 0; background: linear-gradient(to right, #4285f4, #d96570, #9b72cb); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800; letter-spacing: -1px;">Ask Helen & Lindsay</h1>
                        <p style="font-size: 1.2rem; color: #8a939e; margin: 0.75rem 0 0 0; line-height: 1.5; max-width: 650px;">
                            Got questions about HR, WFH policies, booking holidays, or company guides? Ask Helen & Lindsay here for instant answers based on official FSW guidelines.
                        </p>
                    </div>
                </div>

                <div style="width: 100%; max-width: 800px; position: relative; margin-top: auto; box-sizing: border-box;">
                    <input type="text" id="chat-input" placeholder="Ask Helen & Lindsay..." style="width: 100%; padding: 1.2rem 4rem 1.2rem 2rem; background: rgba(30, 31, 32, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 35px; color: white; font-size: 1.1rem; outline: none; box-sizing: border-box; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: background 0.3s, border-color 0.3s;" onfocus="this.style.background='rgba(40,41,42,0.9)'; this.style.borderColor='rgba(255,255,255,0.3)';" onblur="this.style.background='rgba(30,31,32,0.8)'; this.style.borderColor='rgba(255,255,255,0.1)';">
                    <button id="send-chat-btn" style="position: absolute; right: 8px; top: 8px; bottom: 8px; padding: 0 1rem; background: white; border: none; border-radius: 30px; color: black; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
                </div>

                <div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; margin-top: 1.5rem; width: 100%; max-width: 800px;" id="chat-suggestions">
                    <button class="suggestion-chip" style="background: rgba(30,31,32,0.6); padding: 0.8rem 1.2rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); color: white; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;"><span style="color: #4285f4">✏️</span> Summarize the WFH Policy</button>
                    <button class="suggestion-chip" style="background: rgba(30,31,32,0.6); padding: 0.8rem 1.2rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); color: white; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;"><span style="color: #fbbc04">💡</span> How do I request PTO?</button>
                    <button class="suggestion-chip" style="background: rgba(30,31,32,0.6); padding: 0.8rem 1.2rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); color: white; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;"><span style="color: #34a853">📊</span> How to create a Sales Order</button>
                </div>
            </div>

            <!-- Content Manager Panel -->
            <div id="guides-manager-view" style="display: none; width: 100%; max-width: 900px; height: 100%; flex-direction: column; gap: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 1rem; width: 100%;">
                    <div>
                        <h2 style="margin: 0; font-size: 1.8rem; color: white; display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                            Curation & Review Manager
                        </h2>
                        <p style="margin: 0.2rem 0 0 0; font-size: 0.85rem; color: var(--text-muted);">Audit, update review intervals, and snooze or prune training materials.</p>
                    </div>
                    <button id="close-manager-view-btn" class="btn-ghost" style="border: 1px solid var(--glass-border); padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"></path></svg>
                        Back to Chat
                    </button>
                </div>

                <!-- Toolbar/Filters -->
                <div class="glass" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; padding: 1rem; border-radius: var(--radius-lg); background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); gap: 1rem; width: 100%; box-sizing: border-box;">
                    <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; flex: 1;">
                        <div style="position: relative; width: 260px; flex-shrink: 0; box-sizing: border-box;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input type="text" id="curation-search" placeholder="Search materials..." style="box-sizing: border-box; width: 100%; padding: 0.6rem 1rem 0.6rem 2.5rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none;">
                        </div>
                        <select id="curation-type-filter" style="padding: 0.6rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; cursor: pointer;">
                            <option value="all">All Types</option>
                            <option value="course">Courses</option>
                            <option value="guide">Interactive Guides</option>
                            <option value="document">Documents</option>
                            <option value="link">Web Links</option>
                        </select>
                        <select id="curation-status-filter" style="padding: 0.6rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; cursor: pointer;">
                            <option value="all">All Review States</option>
                            <option value="overdue">Review Overdue</option>
                            <option value="soon">Reviewing Soon (<30d)</option>
                            <option value="ok">Up to Date</option>
                        </select>
                    </div>
                </div>

                <!-- List Grid -->
                <div id="curation-items-list" style="display: flex; flex-direction: column; gap: 1rem; width: 100%; box-sizing: border-box;">
                    <div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading curation items...</div>
                </div>
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
            <input type="text" id="upload-title" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; box-sizing: border-box; outline: none;">

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Description</label>
            <input type="text" id="upload-desc" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; box-sizing: border-box; outline: none;">

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Tags (comma separated)</label>
            <input type="text" id="upload-tags" list="upload-tags-list" placeholder="e.g. Policies, HR" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; box-sizing: border-box; outline: none;">
            <datalist id="upload-tags-list"></datalist>

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Review Cycle</label>
            <select id="upload-review-interval" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1.5rem; outline: none; box-sizing: border-box; cursor: pointer;">
                <option value="12">12 Months (Recommended)</option>
                <option value="6">6 Months</option>
                <option value="3">3 Months</option>
                <option value="0">No Review Required</option>
            </select>

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
            <textarea id="link-url" placeholder="https://..." style="width: 100%; height: 100px; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; resize: vertical; box-sizing: border-box; outline: none;"></textarea>

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Tags (comma separated)</label>
            <input type="text" id="link-tags" placeholder="e.g. Training, External" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; box-sizing: border-box; outline: none;">

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Review Cycle</label>
            <select id="link-review-interval" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1.5rem; outline: none; box-sizing: border-box; cursor: pointer;">
                <option value="12">12 Months (Recommended)</option>
                <option value="6">6 Months</option>
                <option value="3">3 Months</option>
                <option value="0">No Review Required</option>
            </select>

            <div style="display: flex; gap: 1rem; justify-content: space-between;">
                <button id="cancel-link-btn" class="btn-ghost" style="flex: 1;">Cancel</button>
                <button id="confirm-link-btn" class="btn-primary" style="flex: 1; background: #4285f4; border-color: #4285f4;">Add Link</button>
            </div>
        </div>
    </div>

    <!-- Edit Curation Item Modal -->
    <div id="edit-curation-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center;">
        <div style="background: var(--bg-dark); padding: 2rem; border-radius: var(--radius-lg); width: 400px; max-width: 90%; border: 1px solid var(--glass-border);">
            <h3 style="margin-top: 0; color: white;" id="edit-curation-title-header">Edit Item Details</h3>

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Title</label>
            <input type="text" id="edit-curation-title" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; box-sizing: border-box; outline: none;">

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Description / Notes</label>
            <input type="text" id="edit-curation-desc" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; box-sizing: border-box; outline: none;">

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Tags (comma separated)</label>
            <input type="text" id="edit-curation-tags" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; box-sizing: border-box; outline: none;">

            <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Review Cycle</label>
            <select id="edit-curation-review-interval" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1.5rem; outline: none; box-sizing: border-box; cursor: pointer;">
                <option value="12">12 Months (Recommended)</option>
                <option value="6">6 Months</option>
                <option value="3">3 Months</option>
                <option value="0">No Review Required</option>
            </select>

            <div style="display: flex; gap: 1rem; justify-content: space-between;">
                <button id="cancel-edit-curation-btn" class="btn-ghost" style="flex: 1;">Cancel</button>
                <button id="confirm-edit-curation-btn" class="btn-primary" style="flex: 1;">Save Changes</button>
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
            const interactiveGuides = courses.filter(c =>
                c.content_json?.is_system_simulation === true ||
                c.content_json?.type === 'video_walkthrough'
            );
            const interactiveGuidesList = document.getElementById('interactive-guides-list');

            if (!interactiveGuides || interactiveGuides.length === 0) {
                interactiveGuidesList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">No software guides available.</div>`;
            } else {
                interactiveGuidesList.innerHTML = interactiveGuides.map(g => {
                    let content = g.content_json;
                    if (typeof content === 'string') {
                        try { content = JSON.parse(content); } catch (error) {}
                    }

                    const renderStatus = content?.renderStatus || 'notRequired';
                    let statusBadges = g.status === 'draft'
                        ? `<span style="font-size: 0.65rem; color: #3b82f6; border: 1px solid #3b82f6; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 0.5rem; vertical-align: middle;">DRAFT</span>`
                        : `<span style="font-size: 0.65rem; color: #10b981; border: 1px solid #10b981; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 0.5rem; vertical-align: middle;">LIVE</span>`;

                    if (renderStatus === 'queued') {
                        statusBadges += `<span style="font-size: 0.65rem; color: #9ca3af; border: 1px solid #9ca3af; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 0.5rem; vertical-align: middle;">QUEUED</span>`;
                    } else if (renderStatus === 'processing') {
                        statusBadges += `<span style="font-size: 0.65rem; color: #f59e0b; border: 1px solid #f59e0b; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 0.5rem; vertical-align: middle;">RENDERING</span>`;
                    } else if (renderStatus === 'failed') {
                        statusBadges += `<span style="font-size: 0.65rem; color: #ef4444; border: 1px solid #ef4444; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 0.5rem; vertical-align: middle;">FAILED</span>`;
                    } else if (renderStatus === 'stale') {
                        statusBadges += `<span style="font-size: 0.65rem; color: #f59e0b; border: 1px solid #f59e0b; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 0.5rem; vertical-align: middle;">OUTDATED</span>`;
                    }

                    return `
                    <div class="guide-card clickable-interactive-card card-hover" data-course='${JSON.stringify(g).replace(/'/g, "&#39;")}' style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); padding: 1rem; border-radius: 8px; display: flex; align-items: flex-start; justify-content: space-between; cursor: pointer;">
                       <div>
                           <h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; color: white;">${g.title}${statusBadges}</h4>
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
                `;
                }).join('');

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

            const reviewInterval = parseInt(document.getElementById('upload-review-interval')?.value || '12');

            try {
                await processAndUploadGuide(pendingFile, title, desc, tags, reviewInterval, (progressMsg) => {
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

                const reviewInterval = parseInt(document.getElementById('link-review-interval')?.value || '12');

                try {
                    for (let i = 0; i < urlsToProcess.length; i++) {
                        const isBatch = urlsToProcess.length > 1;
                        if (isBatch) progressDiv.innerText = `Processing link ${i+1}/${urlsToProcess.length}...`;

                        await processAndUploadWebLink(urlsToProcess[i], tags, reviewInterval, (progressMsg) => {
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

        // Convert markdown for AI response
        const formattedContent = marked.parse(content);

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

    // ==========================================
    // Curation and Review Manager Implementation
    // ==========================================
    if (user.role === 'manager') {
        const manageBtn = document.getElementById('manage-content-btn');
        const backToChatBtn = document.getElementById('close-manager-view-btn');
        const chatView = document.getElementById('guides-chat-view');
        const managerView = document.getElementById('guides-manager-view');
        const curationSearch = document.getElementById('curation-search');
        const curationTypeFilter = document.getElementById('curation-type-filter');
        const curationStatusFilter = document.getElementById('curation-status-filter');
        const curationItemsList = document.getElementById('curation-items-list');

        const editModal = document.getElementById('edit-curation-modal');
        const editTitleInput = document.getElementById('edit-curation-title');
        const editDescInput = document.getElementById('edit-curation-desc');
        const editTagsInput = document.getElementById('edit-curation-tags');
        const editIntervalSelect = document.getElementById('edit-curation-review-interval');
        const cancelEditBtn = document.getElementById('cancel-edit-curation-btn');
        const confirmEditBtn = document.getElementById('confirm-edit-curation-btn');

        let allCurationItems = [];
        let currentlyEditingItem = null;

        // Toggle Curation View
        const showCurationView = async () => {
            chatView.style.display = 'none';
            managerView.style.display = 'flex';
            if (manageBtn) {
                manageBtn.classList.add('btn-primary');
                manageBtn.classList.remove('btn-ghost');
            }
            await loadCurationItems();
        };

        const showChatView = () => {
            managerView.style.display = 'none';
            chatView.style.display = 'flex';
            if (manageBtn) {
                manageBtn.classList.add('btn-ghost');
                manageBtn.classList.remove('btn-primary');
            }
        };

        if (manageBtn) {
            manageBtn.addEventListener('click', showCurationView);
        }
        if (backToChatBtn) {
            backToChatBtn.addEventListener('click', showChatView);
        }

        // Fetch and load both courses and guides for curation
        const loadCurationItems = async () => {
            try {
                curationItemsList.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading curation items...</div>';

                const [guides, courses] = await Promise.all([
                    fetchAllGuides(),
                    getCourses('manager')
                ]);

                allCurationItems = [];

                // Format guides
                guides.forEach(g => {
                    const isLink = g.file_url && !g.file_url.includes('/storage/');
                    allCurationItems.push({
                        id: g.id,
                        title: g.title,
                        description: g.description,
                        tags: g.tags || [],
                        type: isLink ? 'link' : 'document',
                        file_url: g.file_url,
                        created_at: g.created_at,
                        next_review_date: g.next_review_date,
                        review_interval_months: g.review_interval_months
                    });
                });

                // Format courses / system guides
                courses.forEach(c => {
                    let isGuide = false;
                    try {
                        const content = typeof c.content_json === 'string' ? JSON.parse(c.content_json) : c.content_json;
                        isGuide = content?.is_system_simulation === true || content?.type === 'video_walkthrough';
                    } catch(e) {}

                    allCurationItems.push({
                        id: c.id,
                        title: c.title,
                        description: c.description,
                        tags: c.tags || [],
                        type: isGuide ? 'guide' : 'course',
                        created_at: c.created_at,
                        next_review_date: c.next_review_date,
                        review_interval_months: c.review_interval_months
                    });
                });

                applyCurationFilters();
                updateAlertBanner();

            } catch (err) {
                console.error("Curation loading failed", err);
                curationItemsList.innerHTML = `<div style="text-align: center; padding: 2rem; color: #ef4444;">Error loading items: ${err.message}</div>`;
            }
        };

        const updateAlertBanner = () => {
            const now = new Date();
            const overdueItems = allCurationItems.filter(item => item.next_review_date && new Date(item.next_review_date) < now);
            const banner = document.getElementById('curation-alert-banner');
            const alertText = document.getElementById('curation-alert-text');

            if (banner && alertText) {
                if (overdueItems.length > 0) {
                    banner.style.display = 'flex';
                    alertText.innerHTML = `⚠️ <strong>${overdueItems.length} training item${overdueItems.length > 1 ? 's' : ''} require${overdueItems.length === 1 ? 's' : ''} review</strong> (out of date)`;
                } else {
                    banner.style.display = 'none';
                }
            }
        };

        const auditBtn = document.getElementById('alert-audit-btn');
        if (auditBtn) {
            auditBtn.addEventListener('click', () => {
                showCurationView();
                if (curationStatusFilter) {
                    curationStatusFilter.value = 'overdue';
                    applyCurationFilters();
                }
            });
        }

        const applyCurationFilters = () => {
            const query = curationSearch.value.toLowerCase().trim();
            const typeFilter = curationTypeFilter.value;
            const statusFilter = curationStatusFilter.value;
            const now = new Date();

            const filtered = allCurationItems.filter(item => {
                // Search match
                const matchQuery = item.title.toLowerCase().includes(query) ||
                                   (item.description && item.description.toLowerCase().includes(query)) ||
                                   item.tags.some(t => t.toLowerCase().includes(query));
                if (!matchQuery) return false;

                // Type match
                if (typeFilter !== 'all' && item.type !== typeFilter) return false;

                // Status match
                if (statusFilter === 'overdue') {
                    return item.next_review_date && new Date(item.next_review_date) < now;
                } else if (statusFilter === 'soon') {
                    if (!item.next_review_date) return false;
                    const diffTime = new Date(item.next_review_date) - now;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays >= 0 && diffDays <= 30;
                } else if (statusFilter === 'ok') {
                    return !item.next_review_date || new Date(item.next_review_date) >= now;
                }

                return true;
            });

            renderCurationGrid(filtered);
        };

        curationSearch.addEventListener('input', applyCurationFilters);
        curationTypeFilter.addEventListener('change', applyCurationFilters);
        curationStatusFilter.addEventListener('change', applyCurationFilters);

        const renderCurationGrid = (items) => {
            if (items.length === 0) {
                curationItemsList.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted); background: rgba(255,255,255,0.01); border-radius: var(--radius-lg); border: 1px dashed var(--glass-border);">No matching training materials found.</div>';
                return;
            }

            const now = new Date();

            curationItemsList.innerHTML = items.map(item => {
                let iconBg = 'rgba(66, 133, 244, 0.1)';
                let iconColor = '#4285f4';
                let iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>'; // Book
                let typeName = 'Course';

                if (item.type === 'guide') {
                    iconBg = 'rgba(16, 185, 129, 0.1)';
                    iconColor = '#10b981';
                    iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>'; // Monitor
                    typeName = 'Interactive Guide';
                } else if (item.type === 'document') {
                    iconBg = 'rgba(239, 68, 68, 0.1)';
                    iconColor = '#ef4444';
                    iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'; // PDF file
                    typeName = 'PDF Document';
                } else if (item.type === 'link') {
                    iconBg = 'rgba(245, 158, 11, 0.1)';
                    iconColor = '#f59e0b';
                    iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>'; // Link
                    typeName = 'Web Link';
                }

                // Review Status badge
                let statusBadge = `<span style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">Up to Date</span>`;
                let isOverdue = false;
                let isSoon = false;
                let dateColor = 'white';

                if (item.next_review_date) {
                    const reviewDate = new Date(item.next_review_date);
                    if (reviewDate < now) {
                        statusBadge = `<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">Review Overdue</span>`;
                        isOverdue = true;
                        dateColor = '#ef4444';
                    } else {
                        const diffTime = reviewDate - now;
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        if (diffDays <= 30) {
                            statusBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">Review Soon</span>`;
                            isSoon = true;
                            dateColor = '#f59e0b';
                        }
                    }
                }

                const reviewDateText = item.next_review_date ? new Date(item.next_review_date).toLocaleDateString() : 'Never';

                return `
                <div class="glass curation-card" style="padding: 1.2rem; border-radius: var(--radius-lg); border: 1px solid var(--glass-border); display: flex; flex-direction: column; gap: 1rem; box-sizing: border-box; background: rgba(0,0,0,0.15);">
                    <!-- Top Row: Icon, Title, Type, Status Badge -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                        <div style="display: flex; gap: 0.8rem; align-items: center;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; background: ${iconBg}; display: flex; align-items: center; justify-content: center; color: ${iconColor}; font-size: 1.2rem;">
                                ${iconSvg}
                            </div>
                            <div>
                                <div style="font-weight: bold; font-size: 1rem; color: white;">${item.title}</div>
                                <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; gap: 0.5rem; align-items: center; margin-top: 0.2rem;">
                                    <span style="background: rgba(255,255,255,0.05); padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 500; font-size: 0.7rem; text-transform: uppercase;">${typeName}</span>
                                    &bull;
                                    <span>Added: ${new Date(item.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem;">
                            ${statusBadge}
                        </div>
                    </div>

                    <!-- Middle Row: Next Review Details -->
                    <div style="background: rgba(0,0,0,0.25); padding: 0.8rem 1rem; border-radius: var(--radius-md); font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
                        <div style="color: var(--text-muted);">
                            Next Scheduled Review: <span style="color: ${dateColor}; font-weight: 600;">${reviewDateText}</span>
                            ${item.review_interval_months ? ` <span style="font-size: 0.75rem;">(every ${item.review_interval_months} months)</span>` : ''}
                        </div>
                        ${isOverdue ? `<span style="color: #f87171; font-weight: 500; font-size: 0.75rem; display: flex; align-items: center; gap: 0.2rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Out of Date</span>` : ''}
                    </div>

                    <!-- Bottom Row: Unified Actions -->
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; gap: 0.5rem;">
                            ${isOverdue || isSoon ? `
                            <button class="btn-primary snooze-curation-btn" data-id="${item.id}" data-type="${item.type}" data-interval="${item.review_interval_months || 12}" style="padding: 0.4rem 1rem; font-size: 0.8rem; background: #10b981; border-color: #10b981; cursor: pointer; color: white;">
                                Snooze (Extend ${item.review_interval_months || 12}m)
                            </button>
                            ` : ''}
                            <button class="btn-ghost edit-curation-btn" data-id="${item.id}" data-type="${item.type}" data-title="${encodeURIComponent(item.title)}" data-desc="${encodeURIComponent(item.description || '')}" data-tags="${encodeURIComponent(item.tags ? item.tags.join(', ') : '')}" data-interval="${item.review_interval_months || 12}" style="padding: 0.4rem 1rem; font-size: 0.8rem; border: 1px solid var(--glass-border); cursor: pointer; color: white;">
                                Edit Details
                            </button>
                        </div>
                        <button class="btn-ghost delete-curation-btn" data-id="${item.id}" data-type="${item.type}" data-title="${encodeURIComponent(item.title)}" style="padding: 0.4rem 1rem; font-size: 0.8rem; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); cursor: pointer;">
                            Delete
                        </button>
                    </div>
                </div>
                `;
            }).join('');

            // Attach listeners to snooze, edit, delete
            curationItemsList.querySelectorAll('.snooze-curation-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.dataset.id;
                    const type = btn.dataset.type;
                    const interval = btn.dataset.interval || 12;

                    try {
                        btn.disabled = true;
                        btn.innerText = 'Snoozing...';
                        const { snoozeContentReview } = await import('../api/guides.js');
                        await snoozeContentReview(type, id, interval);
                        await loadCurationItems();
                        await loadGuides(); // Reload sidebar accordion
                        await fswAlert('Content review successfully postponed!');
                    } catch (err) {
                        btn.disabled = false;
                        btn.innerText = `Snooze (Extend ${interval}m)`;
                        await fswAlert('Snooze failed: ' + err.message);
                    }
                });
            });

            curationItemsList.querySelectorAll('.edit-curation-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    currentlyEditingItem = {
                        id: btn.dataset.id,
                        type: btn.dataset.type
                    };

                    document.getElementById('edit-curation-title-header').innerText = `Edit ${btn.dataset.type.toUpperCase()}`;
                    editTitleInput.value = decodeURIComponent(btn.dataset.title);
                    editDescInput.value = decodeURIComponent(btn.dataset.desc);
                    editTagsInput.value = decodeURIComponent(btn.dataset.tags);
                    editIntervalSelect.value = btn.dataset.interval || '12';

                    editModal.style.display = 'flex';
                });
            });

            curationItemsList.querySelectorAll('.delete-curation-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const type = btn.dataset.type;
                    const title = decodeURIComponent(btn.dataset.title);

                    const confirmDel = await fswConfirm(`Are you sure you want to delete this ${type}: "${title}"? This cannot be undone.`);
                    if (!confirmDel) return;

                    try {
                        btn.disabled = true;
                        if (type === 'course' || type === 'guide') {
                            const { deleteCourse } = await import('../api/courses.js');
                            await deleteCourse(id, 'manager');
                        } else {
                            const { deleteGuide } = await import('../api/guides.js');
                            await deleteGuide(id);
                        }
                        await loadCurationItems();
                        await loadGuides(); // Reload sidebar accordion
                        await fswAlert('Item deleted successfully.');
                    } catch (err) {
                        btn.disabled = false;
                        await fswAlert('Delete failed: ' + err.message);
                    }
                });
            });
        };

        // Edit Modal Events
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                editModal.style.display = 'none';
                currentlyEditingItem = null;
            });
        }

        if (confirmEditBtn) {
            confirmEditBtn.addEventListener('click', async () => {
                if (!currentlyEditingItem) return;

                const id = currentlyEditingItem.id;
                const type = currentlyEditingItem.type;
                const title = editTitleInput.value.trim();
                const desc = editDescInput.value.trim();
                const tags = editTagsInput.value.split(',').map(t => t.trim()).filter(t => t);
                const interval = parseInt(editIntervalSelect.value);

                try {
                    confirmEditBtn.disabled = true;
                    confirmEditBtn.innerText = 'Saving...';

                    if (type === 'course' || type === 'guide') {
                        const { updateCourse } = await import('../api/courses.js');
                        await updateCourse(id, {
                            title,
                            description: desc,
                            tags,
                            review_interval_months: interval
                        });
                    } else {
                        const { updateGuideMetadata } = await import('../api/guides.js');
                        await updateGuideMetadata(id, {
                            title,
                            description: desc,
                            tags,
                            review_interval_months: interval
                        });
                    }

                    editModal.style.display = 'none';
                    await loadCurationItems();
                    await loadGuides(); // Reload sidebar accordion
                    await fswAlert('Item details updated successfully!');
                } catch (err) {
                    await fswAlert('Update failed: ' + err.message);
                } finally {
                    confirmEditBtn.disabled = false;
                    confirmEditBtn.innerText = 'Save Changes';
                    currentlyEditingItem = null;
                }
            });
        }

        // Initial setup to verify status and show banner
        setTimeout(async () => {
            try {
                // Fetch alert banner details
                const [guides, courses] = await Promise.all([
                    fetchAllGuides(),
                    getCourses('manager')
                ]);
                const now = new Date();
                let overdueCount = 0;

                guides.forEach(g => {
                    if (g.next_review_date && new Date(g.next_review_date) < now) overdueCount++;
                });
                courses.forEach(c => {
                    if (c.next_review_date && new Date(c.next_review_date) < now) overdueCount++;
                });

                const banner = document.getElementById('curation-alert-banner');
                const alertText = document.getElementById('curation-alert-text');
                if (banner && alertText && overdueCount > 0) {
                    banner.style.display = 'flex';
                    alertText.innerHTML = `⚠️ <strong>${overdueCount} training item${overdueCount > 1 ? 's' : ''} require${overdueCount === 1 ? 's' : ''} review</strong> (out of date)`;
                }
            } catch(e) {
                console.error("Alert initial check error", e);
            }
        }, 1000);
    }
}
