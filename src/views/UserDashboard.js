import { getCourses, getUserProgress } from '../api/courses'
import { renderCoursePlayer } from './CoursePlayer'
import { downloadCertificate } from '../utils/certificateGenerator'
import { requestExtension } from '../api/notifications'
import { getCurrentUser } from '../api/auth'
import { fswAlert, fswConfirm } from '../utils/dialog'
import { getPackAssignments, markPackItemCompleted } from '../api/packs'

const getPackIcon = (title) => {
    const t = (title || '').toLowerCase();
    
    // 1. Finance / Money
    if (t.includes('finance') || t.includes('money') || t.includes('budget') || t.includes('pay') || t.includes('tax')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(16,185,129,0.3));"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H12"></path></svg>`;
    }
    // 2. Onboarding / Welcome
    if (t.includes('onboard') || t.includes('welcome') || t.includes('induction') || t.includes('new hire')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(16,185,129,0.3));"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`;
    }
    // 3. Tech / IT / Code
    if (t.includes('tech') || t.includes('code') || t.includes('system') || t.includes('software') || t.includes('it ')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(16,185,129,0.3));"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;
    }
    // 4. Sales / Marketing
    if (t.includes('sales') || t.includes('market') || t.includes('growth')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(16,185,129,0.3));"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
    }
    // 5. HR / Management / People
    if (t.includes('hr') || t.includes('people') || t.includes('culture') || t.includes('manager') || t.includes('team')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(16,185,129,0.3));"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
    }
    // 6. Safety / Health / Legal / Compliance / Policy
    if (t.includes('safety') || t.includes('policy') || t.includes('health') || t.includes('legal') || t.includes('compliance')) {
        return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(16,185,129,0.3));"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
    }
    
    // Default folder
    return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 8px rgba(16,185,129,0.3));"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
};

export const renderUserDashboard = (user) => {
    return `
    <div style="min-height: 80vh;">
        <div style="display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem; align-items: center;">
            <button id="tab-user-courses" class="btn-primary">My Courses</button>
            <button id="tab-user-guides" class="btn-ghost" style="border: 1px solid var(--glass-border);">Guides & Policies</button>
        </div>

        <div id="view-user-courses">
            <!-- Courses Section -->
            <div id="user-courses-container" style="margin-bottom: 2.5rem;">
              <h2 id="user-courses-header" style="display: none; margin: 0 0 1rem 0; font-size: 1.35rem; color: white; display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> Courses
              </h2>
              <div id="user-course-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
                <div style="text-align: center; color: var(--text-muted); grid-column: 1/-1;">Loading available courses...</div>
              </div>
            </div>

            <!-- Learning Packs container (inserted dynamically) -->
            <div id="user-packs-container" style="display: none; margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--glass-border);">
              <h2 style="margin: 0 0 1rem 0; font-size: 1.35rem; display: flex; align-items: center; gap: 0.5rem; color: white; font-weight: 600;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                Learning Packs
              </h2>
              <div id="user-packs-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;"></div>
            </div>
        </div>


        <div id="view-user-guides" style="display: none;"></div>
        
        <!-- Extension Request Modal -->
        <div id="extension-modal" class="hidden" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; align-items: center; justify-content: center;">
            <div class="glass" style="padding: 2rem; border-radius: var(--radius-lg); width: 400px; max-width: 90vw;">
                <h3 style="margin-top: 0;">Request Extension</h3>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Requested Deadline Date</label>
                    <input type="date" id="ext-date" class="input-base" style="width: 100%;">
                </div>
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">Reason</label>
                    <textarea id="ext-reason" class="input-base" rows="3" style="width: 100%; resize: vertical;" placeholder="Briefly explain why you need an extension..."></textarea>
                </div>
                <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                    <button class="btn-ghost" id="ext-cancel">Cancel</button>
                    <button class="btn-primary" id="ext-submit">Submit Request</button>
                </div>
            </div>
        </div>
    </div>
  `
}

export const initUserEvents = async () => {
    const courseList = document.getElementById('user-course-list')

    const tabUserCourses = document.getElementById('tab-user-courses')
    const tabUserGuides = document.getElementById('tab-user-guides')
    const viewUserCourses = document.getElementById('view-user-courses')
    const viewUserGuides = document.getElementById('view-user-guides')

    try {
        const user = await getCurrentUser()



        tabUserCourses?.addEventListener('click', () => {
            tabUserCourses.className = 'btn-primary'
            tabUserCourses.style.border = 'none'
            tabUserGuides.className = 'btn-ghost'
            tabUserGuides.style.border = '1px solid var(--glass-border)'
            viewUserCourses.style.display = 'block'
            viewUserGuides.style.display = 'none'
        })

        tabUserGuides?.addEventListener('click', async () => {
            tabUserGuides.className = 'btn-primary'
            tabUserGuides.style.border = 'none'
            tabUserCourses.className = 'btn-ghost'
            tabUserCourses.style.border = '1px solid var(--glass-border)'
            viewUserGuides.style.display = 'block'
            viewUserCourses.style.display = 'none'

            if (!viewUserGuides.dataset.loaded) {
                const { renderGuides, initGuidesEvents } = await import('./Guides.js')
                viewUserGuides.innerHTML = renderGuides(user)
                await initGuidesEvents(user)
                viewUserGuides.dataset.loaded = 'true'
            }
        })

        const escapeHTML = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        const showPackChecklistModal = (pa, idx) => {
            const isCompleted = pa.status === 'completed';
            const isOverdue = pa.due_date && new Date(pa.due_date) < new Date() && !isCompleted;
            
            let dueText = '';
            if (pa.due_date) {
                const dueDate = new Date(pa.due_date);
                dueText = isOverdue ? `Overdue: ${dueDate.toLocaleDateString()}` : `Due: ${dueDate.toLocaleDateString()}`;
            }

            const modal = document.createElement('div');
            modal.id = `pack-checklist-modal-${idx}`;
            modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px);';
            
            const renderChecklistContent = (assignment) => {
                const isPackDone = assignment.status === 'completed';
                return `
                <div class="glass" style="background: #0b0f19; width: 600px; max-width: 90vw; border-radius: var(--radius-lg); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px rgba(0,0,0,0.5); border: 1px solid var(--glass-border); padding: 2rem; position: relative;">
                    <!-- Close button -->
                    <button id="close-checklist-modal" style="position: absolute; top: 1rem; right: 1.5rem; background: none; border: none; color: white; font-size: 1.8rem; cursor: pointer; padding: 0.5rem; line-height: 1;">&times;</button>
                    
                    <div style="margin-bottom: 1.5rem;">
                        <span style="font-size: 0.75rem; font-weight: bold; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; margin-bottom: 0.75rem;">Learning Pack</span>
                        <h2 style="margin: 0 0 0.5rem 0; color: white; font-size: 1.6rem; font-weight: 700;">${escapeHTML(assignment.pack?.title)}</h2>
                        <p style="margin: 0 0 1.25rem 0; color: var(--text-muted); font-size: 0.95rem; line-height: 1.5;">${escapeHTML(assignment.pack?.description || 'No description')}</p>
                        
                        ${dueText ? `<div style="font-size: 0.85rem; font-weight: bold; color: ${isOverdue ? '#ef4444' : '#f59e0b'}; margin-bottom: 1rem; display: flex; align-items: center; gap: 4px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            ${dueText}
                        </div>` : ''}

                        <!-- Progress Section -->
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.5rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">Overall Completion</span>
                                <span style="font-size: 1.1rem; font-weight: 800; color: ${isPackDone ? '#10b981' : '#f59e0b'};">${assignment.completionPct || 0}%</span>
                            </div>
                            <div style="height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-bottom: 0.35rem;">
                                <div style="height: 100%; width: ${assignment.completionPct || 0}%; background: ${isPackDone ? '#10b981' : 'var(--primary)'}; border-radius: 4px; transition: width 0.5s ease-out;"></div>
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${assignment.completedItems || 0} of ${assignment.totalItems || 0} tasks completed</div>
                        </div>
                    </div>

                    <!-- Checklist items container -->
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 40vh; overflow-y: auto; padding-right: 0.5rem;">
                        ${assignment.items.map((item, itemIdx) => {
                            const icon = item.item_type === 'course' ? '📚' : (item.item_type === 'guide' ? '🖱️' : (item.item_type === 'document' ? '📄' : '🔗'));
                            const itemTypeLabel = item.item_type.toUpperCase();
                            
                            let actionBtnHtml = '';
                            if (item.item_type === 'course' || item.item_type === 'guide') {
                                actionBtnHtml = `
                                    <button class="btn-primary play-pack-course-btn" 
                                        data-assignmentid="${assignment.id}" 
                                        data-courseid="${item.item_id}" 
                                        style="font-size: 0.8rem; padding: 6px 14px; margin: 0;">
                                        ${item.completed ? 'Review' : 'Start'}
                                    </button>
                                `;
                            } else if (item.item_type === 'document') {
                                actionBtnHtml = `
                                    <button class="btn-secondary read-pack-doc-btn" 
                                        data-assignmentid="${assignment.id}" 
                                        data-docid="${item.item_id}" 
                                        data-title="${escapeHTML(item.title)}"
                                        data-url="${item.file_url}" 
                                        data-completed="${item.completed}"
                                        style="font-size: 0.8rem; padding: 6px 14px; margin: 0;">
                                        ${item.completed ? 'Review Doc' : 'Read PDF'}
                                    </button>
                                `;
                            } else if (item.item_type === 'link') {
                                actionBtnHtml = `
                                    <button class="btn-ghost open-pack-link-btn" 
                                        data-assignmentid="${assignment.id}" 
                                        data-linkid="${item.item_id}" 
                                        data-url="${item.file_url}" 
                                        style="font-size: 0.8rem; padding: 6px 14px; margin: 0; border: 1px solid var(--glass-border);">
                                        Visit Link 🔗
                                    </button>
                                `;
                            }

                            return `
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.85rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: var(--radius-md);">
                                <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0;">
                                    <div style="width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: ${item.completed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)'}; color: ${item.completed ? '#10b981' : 'var(--text-muted)'}; font-size: 0.85rem; font-weight: bold; border: 1px solid ${item.completed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)'};">
                                        ${item.completed ? '✓' : itemIdx + 1}
                                    </div>
                                    <span style="font-size: 1.2rem; flex-shrink: 0;">${icon}</span>
                                    <div style="display: flex; flex-direction: column; min-width: 0;">
                                        <span style="font-weight: 500; font-size: 0.95rem; color: ${item.completed ? 'rgba(255,255,255,0.7)' : 'white'}; text-decoration: ${item.completed ? 'line-through' : 'none'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</span>
                                        <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; margin-top: 1px;">${itemTypeLabel}</span>
                                    </div>
                                </div>
                                <div style="flex-shrink: 0;">
                                    ${actionBtnHtml}
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                `;
            };

            modal.innerHTML = renderChecklistContent(pa);
            document.body.appendChild(modal);

            // Action click handlers inside modal (handles close, play, read doc, open link)
            modal.addEventListener('click', async (e) => {
                if (e.target.id === 'close-checklist-modal' || e.target.closest('#close-checklist-modal')) {
                    modal.remove();
                    return;
                }

                const playCourseBtn = e.target.closest('.play-pack-course-btn');
                if (playCourseBtn) {
                    const courseId = playCourseBtn.dataset.courseid;
                    try {
                        playCourseBtn.innerText = 'Loading...';
                        const { supabase } = await import('../api/supabase');
                        const { data: courseData } = await supabase.from('courses').select('*').eq('id', courseId).single();
                        if (courseData) {
                            renderCoursePlayer(courseData, user);
                            modal.remove(); // Close checklist modal when starting course
                        }
                    } catch (err) {
                        console.error(err);
                        await fswAlert('Failed to load course details.');
                        playCourseBtn.innerText = 'Start';
                    }
                }

                const readDocBtn = e.target.closest('.read-pack-doc-btn');
                if (readDocBtn) {
                    const assignmentId = readDocBtn.dataset.assignmentid;
                    const docId = readDocBtn.dataset.docid;
                    const url = readDocBtn.dataset.url;
                    const title = readDocBtn.dataset.title;
                    const isDocCompleted = readDocBtn.dataset.completed === 'true';

                    showPdfViewer(title, url, isDocCompleted, async () => {
                        try {
                            await markPackItemCompleted(assignmentId, 'document', docId);
                            // Refresh main dashboard data
                            await refreshDashboard();
                            // Update modal content
                            const updatedAssignments = await getPackAssignments(user.id);
                            const updatedPa = updatedAssignments.find(a => a.id === assignmentId);
                            if (updatedPa) {
                                modal.innerHTML = renderChecklistContent(updatedPa);
                            }
                        } catch (err) {
                            console.error('Failed to mark document complete:', err);
                        }
                    });
                }

                const openLinkBtn = e.target.closest('.open-pack-link-btn');
                if (openLinkBtn) {
                    const assignmentId = openLinkBtn.dataset.assignmentid;
                    const linkId = openLinkBtn.dataset.linkid;
                    const url = openLinkBtn.dataset.url;

                    window.open(url, '_blank');
                    try {
                        await markPackItemCompleted(assignmentId, 'link', linkId);
                        await refreshDashboard();
                        const updatedAssignments = await getPackAssignments(user.id);
                        const updatedPa = updatedAssignments.find(a => a.id === assignmentId);
                        if (updatedPa) {
                            modal.innerHTML = renderChecklistContent(updatedPa);
                        }
                    } catch (err) {
                        console.error('Failed to complete link view:', err);
                    }
                }
            });
        };

        const refreshDashboard = async () => {
            const [allCourses, userProgress, packAssignments] = await Promise.all([
                getCourses('user'),
                getUserProgress(user.id),
                getPackAssignments(user.id)
            ]);

            // Render Packs
            const userPacksContainer = document.getElementById('user-packs-container');
            const userPacksList = document.getElementById('user-packs-list');
            const userCoursesHeader = document.getElementById('user-courses-header');

            if (packAssignments && packAssignments.length > 0) {
                userPacksContainer.style.display = 'block';
                userCoursesHeader.style.display = 'block';
                
                userPacksList.innerHTML = packAssignments.map((pa, idx) => {
                    const isCompleted = pa.status === 'completed';
                    const isOverdue = pa.due_date && new Date(pa.due_date) < new Date() && !isCompleted;
                    
                    let badgeHtml = '';
                    if (isCompleted) {
                        badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: #10b981; color: black; z-index: 10;">COMPLETED</div>`;
                    } else if (isOverdue) {
                        const dueDate = new Date(pa.due_date);
                        badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: #ef4444; color: white; border: 1px solid #ef4444; z-index: 10;">OVERDUE: ${dueDate.toLocaleDateString()}</div>`;
                    } else if (pa.due_date) {
                        const dueDate = new Date(pa.due_date);
                        badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: #f59e0b; color: black; border: 1px solid #f59e0b; z-index: 10;">DUE: ${dueDate.toLocaleDateString()}</div>`;
                    } else {
                        badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: rgba(0,0,0,0.6); color: white; border: 1px solid var(--glass-border); z-index: 10;">PACK</div>`;
                    }

                    // Count pack items
                    const items = pa.items || [];
                    const coursesCount = items.filter(i => i.item_type === 'course').length;
                    const guidesCount = items.filter(i => i.item_type === 'guide').length;
                    const docsCount = items.filter(i => i.item_type === 'document').length;
                    const linksCount = items.filter(i => i.item_type === 'link').length;

                    const summaryParts = [];
                    if (coursesCount > 0) summaryParts.push(`${coursesCount} Course${coursesCount > 1 ? 's' : ''}`);
                    if (guidesCount > 0) summaryParts.push(`${guidesCount} Guide${guidesCount > 1 ? 's' : ''}`);
                    if (docsCount > 0) summaryParts.push(`${docsCount} Document${docsCount > 1 ? 's' : ''}`);
                    if (linksCount > 0) summaryParts.push(`${linksCount} Link${linksCount > 1 ? 's' : ''}`);

                    const summaryText = summaryParts.length > 0 ? summaryParts.join(', ') : 'No items';

                    return `
                    <div class="glass card-hover" style="padding: 0; overflow: hidden; border-radius: var(--radius-lg); display: flex; flex-direction: column; min-height: 380px; height: 100%; box-sizing: border-box; position: relative; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                        <div style="height: 160px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(18, 142, 205, 0.1) 100%); display: flex; align-items: center; justify-content: center; position: relative; border-bottom: 1px solid rgba(255,255,255,0.05);">
                            ${getPackIcon(pa.pack?.title)}
                            ${badgeHtml}
                            <div style="position: absolute; top: 10px; left: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: rgba(16,185,129,0.8); color: white; border: 1px solid #10b981; text-transform: uppercase; letter-spacing: 0.5px;">
                              Pack
                            </div>
                        </div>

                        <div style="padding: 1.5rem; flex: 1; display: flex; flex-direction: column;">
                            <h3 style="margin: 0 0 0.5rem 0; font-size: 1.25rem; color: white;">${escapeHTML(pa.pack?.title)}</h3>
                            <p style="margin: 0 0 1rem 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; flex: 1;">${escapeHTML(pa.pack?.description || 'No description')}</p>
                            
                            <div style="font-size: 0.8rem; color: var(--primary); font-weight: 500; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.35rem;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                                <span>${summaryText}</span>
                            </div>

                            <div style="margin-bottom: 1.5rem; margin-top: auto;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                    <span style="font-size: 0.8rem; color: var(--text-muted);">${pa.completedItems || 0} of ${pa.totalItems || 0} tasks completed</span>
                                    <span style="font-size: 0.95rem; font-weight: 800; color: ${isCompleted ? '#10b981' : '#f59e0b'};">${pa.completionPct || 0}%</span>
                                </div>
                                <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
                                    <div style="height: 100%; width: ${pa.completionPct || 0}%; background: ${isCompleted ? '#10b981' : 'var(--primary)'}; border-radius: 3px; transition: width 0.5s ease-out;"></div>
                                </div>
                            </div>

                            <div style="display: flex; gap: 0.5rem; margin-top: auto; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05);">
                                <button class="btn-primary view-checklist-modal-btn" data-idx="${idx}" style="flex: 1; margin: 0; display: flex; align-items: center; justify-content: center; gap: 6px;">
                                    View Checklist
                                </button>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');
                
                // Bind checklist modal togglers
                document.querySelectorAll('.view-checklist-modal-btn').forEach(el => {
                    el.addEventListener('click', (e) => {
                        e.preventDefault();
                        const idx = parseInt(e.currentTarget.dataset.idx, 10);
                        const pa = packAssignments[idx];
                        if (pa) {
                            showPackChecklistModal(pa, idx);
                        }
                    });
                });
            } else {
                userPacksContainer.style.display = 'none';
                userCoursesHeader.style.display = 'none';
            }

            // Filter out Interactive Guides (System Simulations & Walkthroughs) from the main courses tab
            const courses = allCourses.filter(c => {
                let content = c.content_json;
                if (typeof content === 'string') {
                    try { content = JSON.parse(content); } catch (e) {}
                }
                return content?.is_system_simulation !== true && content?.type !== 'video_walkthrough';
            });

            const progressMap = {}
            if (userProgress) {
                userProgress.forEach(p => { progressMap[p.course_id] = p })
            }

            if (courses.length === 0) {
                courseList.innerHTML = `
                    <div class="glass" style="grid-column: 1/-1; padding: 3rem; text-align: center; border: 2px dashed var(--glass-border); color: var(--text-muted);">
                        No live courses available at the moment. Please check back later.
                    </div>
                `
                return
            }

            courseList.innerHTML = courses.map((course, index) => {
                const progress = progressMap[course.id]
                const isCompleted = progress && progress.status === 'completed'
                const isExpired = progress && progress.expires_at && new Date(progress.expires_at) < new Date()
                
                let badgeHtml = ''
                if (isExpired) {
                    badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: #ef4444; color: white;">EXPIRED</div>`
                } else if (isCompleted) {
                    badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: #10b981; color: black;">COMPLETED</div>`
                } else if (progress && progress.status === 'in-progress') {
                    badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: #f59e0b; color: black;">IN PROGRESS</div>`
                } else if (progress && progress.status === 'assigned') {
                    if (progress.due_date) {
                        const now = new Date()
                        const dueDate = new Date(progress.due_date)
                        
                        now.setHours(0,0,0,0)
                        const compareDate = new Date(dueDate)
                        compareDate.setHours(0,0,0,0)
                        
                        const timeDiff = compareDate.getTime() - now.getTime()
                        const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24))
                        
                        let color = '#10b981'
                        if (daysRemaining <= 0) {
                            color = '#ef4444'
                        } else if (daysRemaining <= 3) {
                            color = '#f59e0b'
                        }
                        
                        const isOverdue = daysRemaining < 0
                        const dateStr = dueDate.toLocaleDateString()
                        const bgColor = isOverdue ? color : 'rgba(0,0,0,0.7)'
                        const textColor = isOverdue ? 'white' : color
                        const text = isOverdue ? `OVERDUE: ${dateStr}` : `DUE: ${dateStr}`
                        
                        badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: ${bgColor}; color: ${textColor}; border: 1px solid ${color}; z-index: 10;">${text}</div>`
                    } else {
                        badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: rgba(0,0,0,0.6); color: white; border: 1px solid var(--glass-border); z-index: 10;">ASSIGNED</div>`
                    }
                }
                
                const isLocked = !progress;
                if (isLocked) {
                     badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: rgba(0,0,0,0.8); color: var(--text-muted); border: 1px solid var(--glass-border); z-index: 10; display: flex; align-items: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> LOCKED</div>`
                }

                return `
                <div id="course-card-${index}" class="glass card-hover" style="padding: 0; overflow: hidden; border-radius: var(--radius-lg); cursor: ${isLocked ? 'not-allowed' : 'pointer'}; display: flex; flex-direction: column; opacity: ${isLocked ? '0.7' : '1'}; filter: ${isLocked ? 'grayscale(0.5)' : 'none'};">
                    <div style="height: 160px; position: relative; border-bottom: ${isExpired ? '4px solid #ef4444' : 'none'};">
                        ${badgeHtml}
                        ${isLocked ? `<div style="position: absolute; inset: 0; background: rgba(0,0,0,0.6); z-index: 5; display: flex; align-items: center; justify-content: center;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></div>` : ''}
                        ${course.thumbnail_url
                            ? `<img src="${course.thumbnail_url}" onerror="this.onerror=null; this.src='https://placehold.co/800x600/128ecd/ffffff?text=Course+Image';" style="width: 100%; height: 100%; object-fit: cover;">`
                            : `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, var(--primary), var(--aurora-1));"></div>`
                        }
                    </div>
                    <div style="padding: 1.5rem; display: flex; flex-direction: column; flex: 1;">
                        <h3 style="margin: 0 0 0.5rem 0; font-size: 1.2rem; color: ${isExpired ? '#ef4444' : 'white'};">${course.title}</h3>
                        <p style="margin: 0 0 1.5rem 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1;">${course.description}</p>
                        
                        ${progress && progress.due_date && !isCompleted && !isExpired ? `
                            <div style="margin-bottom: 1rem; text-align: right;">
                                 <button class="btn-ghost extension-btn" data-assignment-id="${progress.id}" style="padding: 4px 8px; font-size: 0.75rem; color: var(--text-muted);">Request Extension</button>
                            </div>
                        ` : ''}
                        
                        <div style="display: flex; gap: 0.5rem; margin-top: auto;">
                            <button class="${isLocked ? 'btn-ghost' : (isExpired ? 'btn-secondary' : 'btn-primary')}" style="flex: 1; ${isLocked ? 'opacity: 0.5; cursor: not-allowed;' : ''}" ${isExpired ? 'title="You must resit this course."' : ''}>${isLocked ? 'Locked' : (isExpired ? 'Resit Course' : (isCompleted ? 'Review Course' : 'Start Course'))}</button>
                            ${isCompleted && progress.certificate_id && !isExpired ? `
                                <button id="dl-cert-${index}" class="btn-secondary" style="padding: 0 1rem; color: #0ea5e9; border-color: rgba(14, 165, 233, 0.3);" title="Download Certificate">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
                `
            }).join('')

            // Re-bind courses events
            courses.forEach((course, index) => {
                const card = document.getElementById(`course-card-${index}`)
                const dlBtn = document.getElementById(`dl-cert-${index}`)
                
                card?.addEventListener('click', async (e) => {
                    if (dlBtn && dlBtn.contains(e.target)) return;
                    if (e.target.classList.contains('extension-btn')) return;
                    
                    const progress = progressMap[course.id]
                    const isLocked = !progress;
                    if (isLocked) {
                        await fswAlert('This course is locked. Please contact your manager to get it assigned to you.');
                        return;
                    }

                    const isExpired = progress && progress.expires_at && new Date(progress.expires_at) < new Date()
                    const isCompleted = progress && progress.status === 'completed'
                    
                    if (isExpired) {
                        if (!await fswConfirm('Your certification for this course has expired. You must resit the course and complete the knowledge checks again. Proceed?')) {
                            return;
                        }
                    }
                    const isCourseComplete = isCompleted && !isExpired;
                    renderCoursePlayer(course, user, { isCourseComplete, progress })
                })

                if (dlBtn) {
                    dlBtn.addEventListener('click', async (e) => {
                        e.stopPropagation()
                        const progress = progressMap[course.id]
                        dlBtn.style.opacity = '0.5'
                        try {
                            await downloadCertificate(
                                user.full_name || user.email, 
                                course.title, 
                                progress.completed_at, 
                                progress.expires_at, 
                                progress.certificate_id
                            )
                        } catch(err) {
                            await fswAlert('Failed to download certificate.')
                        } finally {
                            dlBtn.style.opacity = '1'
                        }
                    })
                }
            })

            // Rebind extension buttons
            document.querySelectorAll('.extension-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    currentExtAssignmentId = e.target.getAttribute('data-assignment-id')
                    extModal.style.display = 'flex'
                })
            })
        }

        function showPdfViewer(title, fileUrl, isCompleted, onComplete) {
            const modal = document.createElement('div')
            modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px);'
            
            const buttonHtml = isCompleted 
                ? `<span style="color: #10b981; font-weight: bold; font-size: 0.9rem; display: flex; align-items: center; gap: 4px;">✓ Completed</span>`
                : `<button id="confirm-pdf-read" class="btn-primary" style="font-size: 0.85rem; padding: 6px 12px; margin: 0;">Mark as Completed ✓</button>`;

            modal.innerHTML = `
              <div style="background: #0b0f19; width: 90%; height: 90%; border-radius: var(--radius-lg); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px rgba(0,0,0,0.5); border: 1px solid var(--glass-border);">
                  <div style="padding: 1rem 1.5rem; background: rgba(255,255,255,0.03); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); gap: 1.5rem;">
                      <div style="display: flex; align-items: center; gap: 1rem; min-width: 0; flex: 1;">
                          <h3 style="margin: 0; color: white; font-size: 1.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(title)}</h3>
                          <div id="pdf-complete-status-container">${buttonHtml}</div>
                      </div>
                      <button id="close-user-pdf-modal" style="background: none; border: none; color: white; font-size: 1.8rem; cursor: pointer; padding: 0 0.5rem; line-height: 1;">&times;</button>
                  </div>
                  <iframe src="${fileUrl}" style="flex: 1; width: 100%; border: none;"></iframe>
              </div>
            `
            
            document.body.appendChild(modal)
            
            const closeBtn = document.getElementById('close-user-pdf-modal');
            closeBtn.addEventListener('click', () => {
                modal.remove();
            });

            const confirmBtn = document.getElementById('confirm-pdf-read');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', async () => {
                    confirmBtn.innerText = 'Completing...';
                    confirmBtn.disabled = true;
                    if (onComplete) {
                        await onComplete();
                    }
                    const container = document.getElementById('pdf-complete-status-container');
                    if (container) {
                        container.innerHTML = `<span style="color: #10b981; font-weight: bold; font-size: 0.9rem; display: flex; align-items: center; gap: 4px;">✓ Completed</span>`;
                    }
                });
            }
        }

        // Checklist modal handles all internal pack item clicks, so no separate click bindings needed here on user-packs-list.

        // Run initial data load
        await refreshDashboard();


        // Extension Modal Logic
        const extModal = document.getElementById('extension-modal')
        const extCancel = document.getElementById('ext-cancel')
        const extSubmit = document.getElementById('ext-submit')
        let currentExtAssignmentId = null

        document.querySelectorAll('.extension-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentExtAssignmentId = e.target.getAttribute('data-assignment-id')
                extModal.style.display = 'flex'
            })
        })

        extCancel?.addEventListener('click', () => {
            extModal.style.display = 'none'
            currentExtAssignmentId = null
            document.getElementById('ext-date').value = ''
            document.getElementById('ext-reason').value = ''
        })

        extSubmit?.addEventListener('click', async () => {
             const dateVal = document.getElementById('ext-date').value
             const reasonVal = document.getElementById('ext-reason').value
             if (!dateVal || !reasonVal) {
                 await fswAlert('Please provide both a date and a reason.')
                 return
             }
             extSubmit.textContent = 'Submitting...'
             extSubmit.disabled = true
             try {
                 await requestExtension(currentExtAssignmentId, dateVal, reasonVal)
                 await fswAlert('Extension requested successfully!')
                 extModal.style.display = 'none'
             } catch (err) {
                 await fswAlert(err.message || 'Failed to request extension')
             } finally {
                 extSubmit.textContent = 'Submit Request'
                 extSubmit.disabled = false
                 currentExtAssignmentId = null
             }
        })

    } catch (error) {
        console.error('API Error:', error)
        courseList.innerHTML = `
            <div class="glass" style="padding: 2rem; border: 1px solid #ef4444; color: #ef4444; border-radius: var(--radius-md); text-align: center; grid-column: 1/-1;">
                <h3>Failed to load courses</h3>
                <p>Error: ${error.message}</p>
                <p>Please check your network connection or try logging in again.</p>
            </div>
        `
    }

    // Auto-routing based on query parameter
    if (window.location.search.includes('tab=guides')) {
        setTimeout(() => {
            document.getElementById('tab-user-guides')?.click()
            window.history.replaceState({}, '', '/')
        }, 50)
    }
}
