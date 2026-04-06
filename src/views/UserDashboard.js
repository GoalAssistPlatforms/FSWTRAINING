import { getCourses, getUserProgress } from '../api/courses'
import { renderCoursePlayer } from './CoursePlayer'
import { getCurrentUser } from '../api/auth'
import { downloadCertificate } from '../utils/certificateGenerator'

export const renderUserDashboard = (user) => {
    return `
    <div style="min-height: 80vh;">
        <div style="display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem;">
            <button id="tab-user-courses" class="btn-primary">My Courses</button>
            <button id="tab-user-guides" class="btn-ghost" style="border: 1px solid var(--glass-border);">Guides & Policies</button>
        </div>

        <div id="view-user-courses">
            <div id="user-course-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
              <div style="text-align: center; color: var(--text-muted); grid-column: 1/-1;">Loading available courses...</div>
            </div>
        </div>

        <div id="view-user-guides" style="display: none;"></div>
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

        const [courses, userProgress] = await Promise.all([
            getCourses('user'),
            getUserProgress(user.id)
        ])
        
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
                    const isOverdue = new Date(progress.due_date) < new Date()
                    const dateStr = new Date(progress.due_date).toLocaleDateString()
                    const bgColor = isOverdue ? '#ef4444' : 'rgba(0,0,0,0.7)'
                    const textColor = isOverdue ? 'white' : '#ef4444'
                    const text = isOverdue ? `OVERDUE: ${dateStr}` : `DUE: ${dateStr}`
                    badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: ${bgColor}; color: ${textColor}; border: 1px solid #ef4444; z-index: 10;">${text}</div>`
                } else {
                    badgeHtml = `<div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: rgba(0,0,0,0.6); color: white; border: 1px solid var(--glass-border); z-index: 10;">ASSIGNED</div>`
                }
            }

            return `
            <div id="course-card-${index}" class="glass card-hover" style="padding: 0; overflow: hidden; border-radius: var(--radius-lg); cursor: pointer; display: flex; flex-direction: column;">
                <div style="height: 160px; position: relative; border-bottom: ${isExpired ? '4px solid #ef4444' : 'none'};">
                    ${badgeHtml}
                    ${course.thumbnail_url
                        ? `<img src="${course.thumbnail_url}" onerror="this.onerror=null; this.src='https://placehold.co/800x600/128ecd/ffffff?text=Course+Image';" style="width: 100%; height: 100%; object-fit: cover;">`
                        : `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, var(--primary), var(--aurora-1));"></div>`
                    }
                </div>
                <div style="padding: 1.5rem; display: flex; flex-direction: column; flex: 1;">
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1.2rem; color: ${isExpired ? '#ef4444' : 'white'};">${course.title}</h3>
                    <p style="margin: 0 0 1.5rem 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1;">${course.description}</p>
                    
                    <div style="display: flex; gap: 0.5rem; margin-top: auto;">
                        <button class="${isExpired ? 'btn-secondary' : 'btn-primary'}" style="flex: 1;" ${isExpired ? 'title="You must resit this course."' : ''}>${isExpired ? 'Resit Course' : (isCompleted ? 'Review Course' : 'Start Course')}</button>
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

        // Add click events after rendering
        courses.forEach((course, index) => {
            const card = document.getElementById(`course-card-${index}`)
            const dlBtn = document.getElementById(`dl-cert-${index}`)
            
            card.addEventListener('click', (e) => {
                if (dlBtn && dlBtn.contains(e.target)) return;
                
                const progress = progressMap[course.id]
                const isExpired = progress && progress.expires_at && new Date(progress.expires_at) < new Date()
                
                if (isExpired) {
                    if (!confirm('Your certification for this course has expired. You must resit the course and complete the knowledge checks again. Proceed?')) {
                        return;
                    }
                }
                renderCoursePlayer(course, user)
            })

            if (dlBtn) {
                dlBtn.addEventListener('click', async (e) => {
                    e.stopPropagation()
                    const progress = progressMap[course.id]
                    dlBtn.style.opacity = '0.5'
                    try {
                        await downloadCertificate(
                            user.email, 
                            course.title, 
                            progress.completed_at, 
                            progress.expires_at, 
                            progress.certificate_id
                        )
                    } catch(err) {
                        alert('Failed to download certificate.')
                    } finally {
                        dlBtn.style.opacity = '1'
                    }
                })
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
}
