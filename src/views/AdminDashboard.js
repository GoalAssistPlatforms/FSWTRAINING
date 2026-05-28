import { getPlatformSettings, updatePlatformSettings } from '../api/admin.js';
import { getAllFeedback, updateFeedbackStatusAndResponse, deleteFeedback } from '../api/feedback.js';
import { fswAlert, fswConfirm } from '../utils/dialog.js';

export const renderAdminDashboard = (user) => {
    return `
      <div style="padding: 2rem; max-width: 900px; margin: 0 auto; min-height: 80vh; display: flex; flex-direction: column; gap: 1.5rem;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h1 style="margin: 0; color: var(--primary); font-weight: 800; font-size: 2rem;">Admin Control Center</h1>
            <p style="color: var(--text-muted); margin-top: 0.25rem;">Configure quotas, resolve user reports, and review platform feedback.</p>
          </div>
        </div>

        <!-- Top Navigation Tabs -->
        <div style="display: flex; gap: 0.5rem; background: rgba(255,255,255,0.02); padding: 5px; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.05); width: 100%; box-sizing: border-box;">
            <button id="admin-tab-settings" class="btn-primary" style="flex: 1; padding: 0.8rem; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">⚙️ Platform Settings</button>
            <button id="admin-tab-feedback" class="btn-ghost" style="flex: 1; padding: 0.8rem; border: 1px solid transparent; border-radius: 6px; font-weight: bold; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: white;">💬 User Feedback & Bugs</button>
        </div>

        <!-- View 1: Settings Content -->
        <div id="admin-view-settings" style="display: block;">
            <div class="glass" style="padding: 2rem; border-radius: var(--radius-lg);">
              <form id="admin-settings-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
                
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <label style="font-weight: 600; color: var(--text-muted);">Maximum Total Users</label>
                    <input type="number" id="setting-max-users" class="input-base" min="1" required placeholder="e.g. 50" />
                    <small style="color: var(--text-muted); font-size: 0.8rem;">Absolute cap on how many active user profiles can exist at one time.</small>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <label style="font-weight: 600; color: var(--text-muted);">Subscription Start Date</label>
                    <input type="date" id="setting-start-date" class="input-base" required />
                    <small style="color: var(--text-muted); font-size: 0.8rem;">The initial date the subscription started. This is used to calculate the current billing period.</small>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <label style="font-weight: 600; color: var(--text-muted);">Renewal Period (Months)</label>
                    <input type="number" id="setting-renewal-months" class="input-base" min="1" required placeholder="e.g. 12" />
                    <small style="color: var(--text-muted); font-size: 0.8rem;">How often the quotas refresh automatically.</small>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <label style="font-weight: 600; color: var(--text-muted);">Max Courses Per Period</label>
                    <input type="number" id="setting-max-courses" class="input-base" min="1" required placeholder="e.g. 12" />
                    <small style="color: var(--text-muted); font-size: 0.8rem;">Limit on how many courses can be produced within the current billing period.</small>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <label style="font-weight: 600; color: var(--text-muted);">Max Interactive Guides Per Period</label>
                    <input type="number" id="setting-max-guides" class="input-base" min="1" required placeholder="e.g. 12" />
                    <small style="color: var(--text-muted); font-size: 0.8rem;">Limit on how many interactive guides can be produced within the current billing period.</small>
                </div>
      
                <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
                  <button type="submit" class="btn-primary" id="save-settings-btn">Save Settings</button>
                </div>
              </form>
            </div>
        </div>

        <!-- View 2: Feedback Management Content -->
        <div id="admin-view-feedback" style="display: none; flex-direction: column; gap: 1.5rem;">
            
            <!-- Quick Metrics Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                <div class="glass" style="padding: 1.25rem; border-radius: 8px; border-left: 4px solid #10b981;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Positive / Testimonials</div>
                    <div id="metric-feedback-positive" style="font-size: 1.8rem; font-weight: bold; color: white; margin-top: 0.25rem;">0</div>
                </div>
                <div class="glass" style="padding: 1.25rem; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Improvements</div>
                    <div id="metric-feedback-improvement" style="font-size: 1.8rem; font-weight: bold; color: white; margin-top: 0.25rem;">0</div>
                </div>
                <div class="glass" style="padding: 1.25rem; border-radius: 8px; border-left: 4px solid #ef4444; box-shadow: inset 0 0 10px rgba(239,68,68,0.05);">
                    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Urgent Errors</div>
                    <div id="metric-feedback-urgent" style="font-size: 1.8rem; font-weight: bold; color: #ef4444; text-shadow: 0 0 5px rgba(239,68,68,0.3); margin-top: 0.25rem;">0</div>
                </div>
            </div>

            <!-- Submissions List -->
            <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); min-height: 200px;">
                <h3 style="margin-top: 0; color: white; margin-bottom: 1.2rem; display: flex; align-items: center; justify-content: space-between;">
                    <span>📌 Feedback Submissions</span>
                    <button id="refresh-feedback-btn" class="btn-ghost" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; color: var(--primary);">🔄 Refresh</button>
                </h3>
                <div id="admin-feedback-list" style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <!-- Populated dynamically -->
                </div>
            </div>
        </div>

      </div>

      <!-- Screenshot Lightbox Modal -->
      <div id="admin-lightbox-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 10100; justify-content: center; align-items: center; cursor: pointer;">
          <img id="admin-lightbox-img" style="max-width: 90%; max-height: 90%; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
          <div style="position: absolute; top: 20px; right: 20px; color: white; font-size: 2rem;">&times;</div>
      </div>
    `;
};

export const initAdminEvents = async () => {
    // Platform Settings Form fields
    const form = document.getElementById('admin-settings-form');
    const maxUsersInput = document.getElementById('setting-max-users');
    const startDateInput = document.getElementById('setting-start-date');
    const renewalMonthsInput = document.getElementById('setting-renewal-months');
    const maxCoursesInput = document.getElementById('setting-max-courses');
    const maxGuidesInput = document.getElementById('setting-max-guides');
    const saveBtn = document.getElementById('save-settings-btn');

    // Tab Navigation elements
    const tabSettings = document.getElementById('admin-tab-settings');
    const tabFeedback = document.getElementById('admin-tab-feedback');
    const viewSettings = document.getElementById('admin-view-settings');
    const viewFeedback = document.getElementById('admin-view-feedback');

    // Feedback uploader / viewer list
    const feedbackList = document.getElementById('admin-feedback-list');
    const refreshBtn = document.getElementById('refresh-feedback-btn');

    // Lightbox modal elements
    const lightboxModal = document.getElementById('admin-lightbox-modal');
    const lightboxImg = document.getElementById('admin-lightbox-img');

    // Active tab state
    let activeTab = 'settings';

    // Toggle Tabs
    const showTab = (tab) => {
        activeTab = tab;
        if (tab === 'settings') {
            tabSettings.className = 'btn-primary';
            tabSettings.style.border = 'none';
            tabSettings.style.color = '';

            tabFeedback.className = 'btn-ghost';
            tabFeedback.style.border = '1px solid transparent';
            tabFeedback.style.color = 'white';

            viewSettings.style.display = 'block';
            viewFeedback.style.display = 'none';
        } else {
            tabFeedback.className = 'btn-primary';
            tabFeedback.style.border = 'none';
            tabFeedback.style.color = '';

            tabSettings.className = 'btn-ghost';
            tabSettings.style.border = '1px solid transparent';
            tabSettings.style.color = 'white';

            viewSettings.style.display = 'none';
            viewFeedback.style.display = 'flex';
            
            loadAdminFeedback();
        }
    };

    tabSettings?.addEventListener('click', () => showTab('settings'));
    tabFeedback?.addEventListener('click', () => showTab('feedback'));
    refreshBtn?.addEventListener('click', loadAdminFeedback);

    // Setup Lightbox clicks
    lightboxModal?.addEventListener('click', () => {
        lightboxModal.style.display = 'none';
        lightboxImg.src = '';
    });

    // Populate Platform settings on load
    if (form) {
        try {
            const settings = await getPlatformSettings();
            
            maxUsersInput.value = settings.max_users || 10;
            renewalMonthsInput.value = settings.renewal_period_months || 12;
            maxCoursesInput.value = settings.max_courses_per_period || 12;
            maxGuidesInput.value = settings.max_guides_per_period || 12;

            if (settings.subscription_start_date) {
                const dateObj = new Date(settings.subscription_start_date);
                const yyyy = dateObj.getFullYear();
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dd = String(dateObj.getDate()).padStart(2, '0');
                startDateInput.value = `${yyyy}-${mm}-${dd}`;
            }
        } catch (error) {
            console.error('Failed to load settings', error);
            fswAlert('Could not load current platform settings.');
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const originalText = saveBtn.innerText;
            saveBtn.innerText = 'Saving...';
            saveBtn.disabled = true;

            try {
                const dateVal = startDateInput.value;
                const isoDate = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();

                await updatePlatformSettings({
                    max_users: parseInt(maxUsersInput.value, 10),
                    subscription_start_date: isoDate,
                    renewal_period_months: parseInt(renewalMonthsInput.value, 10),
                    max_courses_per_period: parseInt(maxCoursesInput.value, 10),
                    max_guides_per_period: parseInt(maxGuidesInput.value, 10)
                });

                await fswAlert('Platform settings saved successfully!');
            } catch (error) {
                console.error('Failed to save settings', error);
                fswAlert('Failed to save settings: ' + (error.message || 'Unknown error'));
            } finally {
                saveBtn.innerText = originalText;
                saveBtn.disabled = false;
            }
        });
    }

    // Load Feedback Submissions
    async function loadAdminFeedback() {
        if (!feedbackList) return;
        feedbackList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 3rem;">Loading feedback list...</div>';
        
        try {
            const feedbacks = await getAllFeedback();

            // Populate metrics counters
            const counts = { positive: 0, improvement: 0, urgent: 0 };
            feedbacks.forEach(f => {
                if (f.type === 'positive') counts.positive++;
                if (f.type === 'negative') counts.improvement++;
                if (f.type === 'urgent') counts.urgent++;
            });

            document.getElementById('metric-feedback-positive').innerText = counts.positive;
            document.getElementById('metric-feedback-improvement').innerText = counts.improvement;
            document.getElementById('metric-feedback-urgent').innerText = counts.urgent;

            if (feedbacks.length === 0) {
                feedbackList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 3rem;">No feedback submissions yet.</div>';
                return;
            }

            feedbackList.innerHTML = feedbacks.map(f => {
                const author = f.profiles || {};
                const name = author.full_name || author.email || 'Anonymous';
                const email = author.full_name ? author.email : '';
                const roleBadge = author.role ? author.role.toUpperCase() : 'USER';
                const dept = author.department ? ` • ${author.department}` : '';

                const isPositive = f.type === 'positive';
                const isUrgent = f.type === 'urgent';
                let typeBadge = '💡 Improvement';
                let typeColor = '#3b82f6';
                if (isPositive) { typeBadge = '⭐ Positive'; typeColor = '#10b981'; }
                if (isUrgent) { typeBadge = '🚨 Urgent Error'; typeColor = '#ef4444'; }

                const formattedDate = new Date(f.created_at).toLocaleString();

                // Calculate response speed
                let speedHtml = '';
                if (f.responded_at) {
                    const durationMs = new Date(f.responded_at) - new Date(f.created_at);
                    const totalMinutes = Math.floor(durationMs / 60000);
                    const hours = Math.floor(totalMinutes / 60);
                    const days = Math.floor(hours / 24);

                    let durationText = '';
                    let speedColor = '#10b981'; // Fast = Green (under 24 hours)

                    if (totalMinutes > 4320) {
                        // More than 3 days (Slow = Red)
                        durationText = `${days} day${days > 1 ? 's' : ''}`;
                        speedColor = '#ef4444'; 
                    } else if (totalMinutes > 1440) {
                        // Between 24 and 72 hours (Medium = Amber)
                        durationText = `${days} day${days > 1 ? 's' : ''} ${hours % 24} hr${hours % 24 > 1 ? 's' : ''}`;
                        speedColor = '#f59e0b'; 
                    } else {
                        // Less than 24 hours (Fast = Green!)
                        if (hours > 0) {
                            durationText = `${hours} hr${hours > 1 ? 's' : ''} ${totalMinutes % 60} min`;
                        } else if (totalMinutes > 0) {
                            durationText = `${totalMinutes} min${totalMinutes > 1 ? 's' : ''}`;
                        } else {
                            durationText = 'Instant';
                        }
                    }

                    speedHtml = `<span style="background: ${speedColor}15; border: 1px solid ${speedColor}; color: ${speedColor}; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; margin-left: 0.5rem; display: inline-flex; align-items: center; gap: 3px; vertical-align: middle;">⚡ Speed: ${durationText}</span>`;
                }

                return `
                <div class="glass feedback-admin-card" style="padding: 1.5rem; border-radius: var(--radius-md); border-left: 4px solid ${typeColor}; background: rgba(255,255,255,0.01); display: flex; flex-direction: column; gap: 1rem;">
                    
                    <!-- Top uploader info and metadata -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
                        <div>
                            <strong style="color: white; font-size: 1rem;">${name}</strong>
                            ${email ? `<span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">(${email})</span>` : ''}
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; display: flex; align-items: center; flex-wrap: wrap; gap: 0.3rem;">
                                <span style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.65rem;">${roleBadge}</span>
                                <span>${dept} • Submitted ${formattedDate}</span>
                                ${speedHtml}
                            </div>
                        </div>
                        <span style="font-size: 0.8rem; padding: 3px 10px; border-radius: 4px; background: ${typeColor}20; border: 1px solid ${typeColor}; color: ${typeColor}; font-weight: bold;">${typeBadge}</span>
                    </div>

                    <!-- Feedback message content -->
                    <div style="color: #e2e8f0; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; font-family: inherit;">"${f.content}"</div>

                    <!-- Attached image thumbnail -->
                    ${f.screenshot_url ? `
                        <div style="margin-top: 0.25rem;">
                            <label style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.5rem; text-transform: uppercase; font-weight: bold;">Attached Screenshot (click to view):</label>
                            <img src="${f.screenshot_url}" class="admin-feedback-thumbnail" style="width: 120px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); cursor: zoom-in; transition: border-color 0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.15)'">
                        </div>
                    ` : ''}

                    <!-- Management Actions Row -->
                    <div style="display: flex; flex-direction: column; gap: 1rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 1rem; margin-top: 0.5rem;">
                        <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
                            <div style="display: flex; flex-direction: column; gap: 0.25rem; min-width: 150px;">
                                <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold;">Resolution Status</label>
                                <select class="feedback-status-select" data-id="${f.id}" style="background: rgba(0,0,0,0.5); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 0.5rem; border-radius: 4px; outline: none; font-weight: bold;">
                                    <option value="pending" ${f.status === 'pending' ? 'selected' : ''}>⏳ Pending Review</option>
                                    <option value="under-review" ${f.status === 'under-review' ? 'selected' : ''}>🔍 Under Review</option>
                                    <option value="acting-on" ${f.status === 'acting-on' ? 'selected' : ''}>🛠️ Acting On / Fixing</option>
                                    <option value="resolved" ${f.status === 'resolved' ? 'selected' : ''}>✓ Resolved</option>
                                    <option value="archived" ${f.status === 'archived' ? 'selected' : ''}>📦 Archived</option>
                                </select>
                            </div>
                            <button class="btn-ghost delete-feedback-btn" data-id="${f.id}" style="margin-left: auto; align-self: flex-end; padding: 0.5rem 1rem; color: #ef4444; border: 1px solid rgba(239,68,68,0.2); border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem;" onmouseover="this.style.background='rgba(239,68,68,0.05)'" onmouseout="this.style.background='transparent'">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                Delete
                            </button>
                        </div>

                        <!-- Response Area -->
                        <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;">
                            
                            ${f.admin_response && f.admin_response.trim() !== '' ? `
                                <!-- Locked-in Published Response State -->
                                <div id="response-static-${f.id}" style="display: flex; flex-direction: column; gap: 0.4rem; width: 100%;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold;">Published Admin Response</label>
                                        <span style="font-size: 0.7rem; color: #10b981; font-weight: bold; background: rgba(16, 185, 129, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.3); display: inline-flex; align-items: center; gap: 2px;">
                                            ✓ Response Live
                                        </span>
                                    </div>
                                    <div style="background: rgba(16, 185, 129, 0.03); border-left: 3px solid #10b981; padding: 0.8rem 1.2rem; border-radius: 6px; font-size: 0.9rem; color: #cbd5e1; display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; width: 100%; box-sizing: border-box;">
                                        <span style="font-style: italic; line-height: 1.4;">"${f.admin_response}"</span>
                                        <button class="btn-ghost toggle-response-edit-btn" data-id="${f.id}" style="padding: 0.2rem 0.6rem; font-size: 0.75rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: var(--text-muted); cursor: pointer; transition: all 0.2s; white-space: nowrap;" onmouseover="this.style.borderColor='var(--primary)'; this.style.color='white';" onmouseout="this.style.borderColor='rgba(255,255,255,0.15)'; this.style.color='var(--text-muted)';">✏️ Edit</button>
                                    </div>
                                </div>
                            ` : ''}

                            <!-- Editable Input State -->
                            <div id="response-editor-${f.id}" style="${f.admin_response && f.admin_response.trim() !== '' ? 'display: none;' : 'display: flex;'} flex-direction: column; gap: 0.4rem; width: 100%;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold;">Write Admin Response (Visible to Users)</label>
                                    ${f.admin_response && f.admin_response.trim() !== '' ? `
                                        <button class="btn-ghost cancel-response-edit-btn" data-id="${f.id}" style="padding: 0.15rem 0.5rem; font-size: 0.75rem; color: #ef4444; border: none; cursor: pointer; font-weight: bold;">Cancel</button>
                                    ` : ''}
                                </div>
                                <div style="display: flex; gap: 0.5rem; align-items: flex-end; width: 100%;">
                                    <textarea class="feedback-response-textarea" data-id="${f.id}" placeholder="Type your response to the user here..." style="flex: 1; height: 52px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 0.5rem 0.75rem; color: white; outline: none; font-family: inherit; font-size: 0.85rem; resize: vertical; line-height: 1.4;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'">${f.admin_response || ''}</textarea>
                                    <button class="btn-primary save-feedback-btn" data-id="${f.id}" style="padding: 0.6rem 1rem; border-radius: 4px; font-size: 0.8rem; font-weight: bold; height: 38px;">Save</button>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
                `;
            }).join('');

            // Attach Thumbnail click listener for Lightbox
            document.querySelectorAll('.admin-feedback-thumbnail').forEach(thumb => {
                thumb.addEventListener('click', (e) => {
                    lightboxImg.src = e.target.src;
                    lightboxModal.style.display = 'flex';
                });
            });

            // Attach toggle response edit click listeners
            document.querySelectorAll('.toggle-response-edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    const staticEl = document.getElementById(`response-static-${id}`);
                    const editorEl = document.getElementById(`response-editor-${id}`);
                    if (staticEl && editorEl) {
                        staticEl.style.display = 'none';
                        editorEl.style.display = 'flex';
                    }
                });
            });

            // Attach cancel response edit click listeners
            document.querySelectorAll('.cancel-response-edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    const staticEl = document.getElementById(`response-static-${id}`);
                    const editorEl = document.getElementById(`response-editor-${id}`);
                    if (staticEl && editorEl) {
                        staticEl.style.display = 'flex';
                        editorEl.style.display = 'none';
                        const textarea = document.querySelector(`.feedback-response-textarea[data-id="${id}"]`);
                        if (textarea) {
                            const span = staticEl.querySelector('span[style*="font-style: italic"]');
                            if (span) {
                                let originalText = span.innerText;
                                if (originalText.startsWith('"') && originalText.endsWith('"')) {
                                    originalText = originalText.slice(1, -1);
                                }
                                textarea.value = originalText;
                            }
                        }
                    }
                });
            });

            // Attach Save buttons click handlers
            document.querySelectorAll('.save-feedback-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.dataset.id;
                    const select = document.querySelector(`.feedback-status-select[data-id="${id}"]`);
                    const textarea = document.querySelector(`.feedback-response-textarea[data-id="${id}"]`);

                    const originalText = btn.innerText;
                    btn.innerText = 'Saving...';
                    btn.disabled = true;

                    try {
                        await updateFeedbackStatusAndResponse(id, select.value, textarea.value.trim());
                        await fswAlert('Feedback status and response saved successfully!');
                        loadAdminFeedback();
                    } catch (err) {
                        console.error(err);
                        fswAlert('Failed to save changes: ' + err.message);
                        btn.innerText = originalText;
                        btn.disabled = false;
                    }
                });
            });

            // Attach Delete click handlers
            document.querySelectorAll('.delete-feedback-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    if (await fswConfirm('Are you sure you want to permanently delete this feedback submission?')) {
                        try {
                            await deleteFeedback(id);
                            loadAdminFeedback();
                        } catch (err) {
                            console.error(err);
                            fswAlert('Failed to delete feedback.');
                        }
                    }
                });
            });

        } catch (e) {
            feedbackList.innerHTML = `<div style="color: #ef4444; text-align: center; padding: 3rem;">Error loading feedbacks: ${e.message}</div>`;
        }
    }
};
