import { getCourses, getUserProgress } from '../api/courses'
import { renderCoursePlayer } from './CoursePlayer'
import { downloadCertificate } from '../utils/certificateGenerator'
import { requestExtension } from '../api/notifications'
import { getCurrentUser } from '../api/auth'
import { fswAlert, fswConfirm } from '../utils/dialog'
import { getPackAssignments, markPackItemCompleted } from '../api/packs'


export const renderUserDashboard = (user) => {
    return `
    <div style="min-height: 80vh;">
        <div style="display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem; align-items: center;">
            <button id="tab-user-courses" class="btn-primary">My Courses</button>
            <button id="tab-user-guides" class="btn-ghost" style="border: 1px solid var(--glass-border);">Guides & Policies</button>
        </div>

        <div id="view-user-courses">
            <!-- Learning Packs container (inserted dynamically) -->
            <div id="user-packs-container" style="display: none; margin-bottom: 2.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--glass-border);">
              <h2 style="margin: 0 0 1.5rem 0; font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem; color: white;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2 2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                My Learning Packs
              </h2>
              <div id="user-packs-list" style="display: flex; flex-direction: column; gap: 1.5rem;"></div>
            </div>

            <!-- Individual Courses Header -->
            <h2 id="user-courses-header" style="display: none; margin: 0 0 1.5rem 0; font-size: 1.5rem; color: white;">Individual Courses</h2>

            <div id="user-course-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
              <div style="text-align: center; color: var(--text-muted); grid-column: 1/-1;">Loading available courses...</div>
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
                    
                    let dueBadge = '';
                    if (pa.due_date) {
                        const dueDate = new Date(pa.due_date);
                        dueBadge = `<span style="font-size: 0.8rem; padding: 4px 8px; border-radius: 4px; background: ${isOverdue ? '#ef4444' : 'rgba(0,0,0,0.5)'}; color: ${isOverdue ? 'white' : '#f59e0b'}; border: 1px solid ${isOverdue ? '#ef4444' : 'rgba(245,158,11,0.3)'}; margin-left: 0.5rem; font-weight: bold;">
                            ${isOverdue ? 'OVERDUE: ' : 'DUE: '}${dueDate.toLocaleDateString()}
                        </span>`;
                    }

                    return `
                    <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); border-left: 6px solid ${isCompleted ? '#10b981' : (isOverdue ? '#ef4444' : 'var(--primary)')}; box-shadow: 0 10px 30px rgba(0,0,0,0.3); position: relative;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
                            <div>
                                <h3 style="margin: 0 0 0.5rem 0; font-size: 1.3rem; color: white; display: flex; align-items: center; gap: 0.5rem;">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary); filter: drop-shadow(0 0 4px rgba(18,142,205,0.4)); margin-right: 0.25rem; vertical-align: middle;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2 2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                    ${escapeHTML(pa.pack?.title)}
                                    ${dueBadge}
                                </h3>
                                <p style="margin: 0; color: var(--text-muted); font-size: 0.95rem; line-height: 1.5;">${escapeHTML(pa.pack?.description || 'No description')}</p>
                            </div>
                            <div style="text-align: right; min-width: 120px;">
                                <span style="font-size: 1.5rem; font-weight: 800; color: ${isCompleted ? '#10b981' : '#f59e0b'};">${pa.completionPct || 0}%</span>
                                <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold; margin-top: 2px;">Completed</div>
                            </div>
                        </div>

                        <div style="margin-bottom: 1.5rem;">
                            <div style="height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem;">
                                <div style="height: 100%; width: ${pa.completionPct || 0}%; background: ${isCompleted ? '#10b981' : 'var(--primary)'}; border-radius: 4px; transition: width 0.5s ease-out;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
                                <span>${pa.completedItems || 0} of ${pa.totalItems || 0} tasks completed</span>
                                <a href="javascript:void(0)" class="toggle-user-pack" data-idx="${idx}" style="color: var(--primary); text-decoration: none; font-weight: bold; display: flex; align-items: center; gap: 4px;">
                                    View Checklist <span class="arrow-indicator-${idx}">▼</span>
                                </a>
                            </div>
                        </div>

                        <!-- Checklist items container (collapsible) -->
                        <div id="user-checklist-${idx}" style="display: none; flex-direction: column; gap: 0.75rem; padding-top: 1rem; border-top: 1px dashed rgba(255,255,255,0.1); margin-top: 0.5rem;">
                            ${pa.items.map((item, itemIdx) => {
                                const icon = item.item_type === 'course' ? '📚' : (item.item_type === 'guide' ? '🖱️' : (item.item_type === 'document' ? '📄' : '🔗'));
                                const itemTypeLabel = item.item_type.toUpperCase();
                                
                                let actionBtnHtml = '';
                                if (item.item_type === 'course' || item.item_type === 'guide') {
                                    actionBtnHtml = `
                                        <button class="btn-primary play-pack-course-btn" 
                                            data-assignmentid="${pa.id}" 
                                            data-courseid="${item.item_id}" 
                                            style="font-size: 0.8rem; padding: 4px 12px; margin: 0;">
                                            ${item.completed ? 'Review' : 'Start'}
                                        </button>
                                    `;
                                } else if (item.item_type === 'document') {
                                    actionBtnHtml = `
                                        <button class="btn-secondary read-pack-doc-btn" 
                                            data-assignmentid="${pa.id}" 
                                            data-docid="${item.item_id}" 
                                            data-title="${escapeHTML(item.title)}"
                                            data-url="${item.file_url}" 
                                            data-completed="${item.completed}"
                                            style="font-size: 0.8rem; padding: 4px 12px; margin: 0;">
                                            ${item.completed ? 'Review Doc' : 'Read PDF'}
                                        </button>
                                    `;
                                } else if (item.item_type === 'link') {
                                    actionBtnHtml = `
                                        <button class="btn-ghost open-pack-link-btn" 
                                            data-assignmentid="${pa.id}" 
                                            data-linkid="${item.item_id}" 
                                            data-url="${item.file_url}" 
                                            style="font-size: 0.8rem; padding: 4px 12px; margin: 0; border: 1px solid var(--glass-border);">
                                            Visit Resource 🔗
                                        </button>
                                    `;
                                }

                                return `
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: var(--radius-sm);">
                                    <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0;">
                                        <div style="width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${item.completed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)'}; color: ${item.completed ? '#10b981' : 'var(--text-muted)'}; font-size: 0.85rem; font-weight: bold; border: 1px solid ${item.completed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)'};">
                                            ${item.completed ? '✓' : itemIdx + 1}
                                        </div>
                                        <span style="font-size: 1.1rem;">${icon}</span>
                                        <div style="display: flex; flex-direction: column; min-width: 0;">
                                            <span style="font-weight: 500; color: ${item.completed ? 'rgba(255,255,255,0.7)' : 'white'}; text-decoration: ${item.completed ? 'line-through' : 'none'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(item.title)}</span>
                                            <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">${itemTypeLabel}</span>
                                        </div>
                                    </div>
                                    <div>
                                        ${actionBtnHtml}
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    `;
                }).join('');
                
                // Bind checklist togglers
                document.querySelectorAll('.toggle-user-pack').forEach(el => {
                    el.addEventListener('click', (e) => {
                        e.preventDefault();
                        const idx = e.currentTarget.dataset.idx;
                        const checklist = document.getElementById(`user-checklist-${idx}`);
                        const arrow = document.querySelector(`.arrow-indicator-${idx}`);
                        if (checklist) {
                            const isHidden = checklist.style.display === 'none';
                            checklist.style.display = isHidden ? 'flex' : 'none';
                            if (arrow) arrow.innerText = isHidden ? '▲' : '▼';
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

        // Bind clicks on pack items
        document.getElementById('user-packs-list')?.addEventListener('click', async (e) => {
            const playCourseBtn = e.target.closest('.play-pack-course-btn');
            if (playCourseBtn) {
                const courseId = playCourseBtn.dataset.courseid;
                try {
                    playCourseBtn.innerText = 'Loading...';
                    const { supabase } = await import('../api/supabase');
                    const { data: courseData } = await supabase.from('courses').select('*').eq('id', courseId).single();
                    if (courseData) {
                        renderCoursePlayer(courseData, user);
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
                const isCompleted = readDocBtn.dataset.completed === 'true';

                showPdfViewer(title, url, isCompleted, async () => {
                    try {
                        await markPackItemCompleted(assignmentId, 'document', docId);
                        refreshDashboard();
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
                    refreshDashboard();
                } catch (err) {
                    console.error('Failed to complete link view:', err);
                }
            }
        });

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
