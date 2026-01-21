import { getCourses } from '../api/courses'
import { renderCoursePlayer } from './CoursePlayer'
import { getCurrentUser } from '../api/auth'

export const renderUserDashboard = (user) => {
    return `
    <div style="min-height: 80vh;">


        <div id="user-course-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
          <div style="text-align: center; color: var(--text-muted); grid-column: 1/-1;">Loading available courses...</div>
        </div>
    </div>
  `
}

export const initUserEvents = async () => {
    const courseList = document.getElementById('user-course-list')
    try {
        const user = await getCurrentUser()
        const courses = await getCourses('user')
        if (courses.length === 0) {
            courseList.innerHTML = `
                <div class="glass" style="grid-column: 1/-1; padding: 3rem; text-align: center; border: 2px dashed var(--glass-border); color: var(--text-muted);">
                    No live courses available at the moment. Please check back later.
                </div>
            `
            return
        }

        // ...
        courseList.innerHTML = courses.map((course, index) => `
            <div id="course-card-${index}" class="glass card-hover" style="padding: 0; overflow: hidden; border-radius: var(--radius-lg); cursor: pointer;">
                <div style="height: 160px; position: relative;">
                     <!-- Use a reliable fallback for image errors -->
                    ${course.thumbnail_url
                ? `<img src="${course.thumbnail_url}" onerror="this.onerror=null; this.src='https://placehold.co/800x600/128ecd/ffffff?text=Course+Image'; console.warn('Thumbnail failed to load, falling back for:', '${course.title}');" style="width: 100%; height: 100%; object-fit: cover;">`
                : `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, var(--primary), var(--aurora-1));"></div>`
            }
                </div>
                <div style="padding: 1.5rem;">
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1.2rem;">${course.title}</h3>
                    <p style="margin: 0 0 1.5rem 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${course.description}</p>
                    <button class="btn-primary" style="width: 100%;">Start Course</button>
                </div>
            </div>
        `).join('')

        // Add click events after rendering
        courses.forEach((course, index) => {
            const card = document.getElementById(`course-card-${index}`)
            card.addEventListener('click', () => {
                renderCoursePlayer(course, user)
            })
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

