import { generateCourseContent } from '../api/ai'
import { createCourse, getCourses, deleteCourse } from '../api/courses'
import { renderCourseEditor } from './CourseEditor'
import { renderCoursePlayer } from './CoursePlayer'
import { getCurrentUser } from '../api/auth'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const renderManagerDashboard = (user) => {
  return `
    <div style="min-height: 80vh;">
      <div id="loading-courses" style="text-align: center; display: none;">Loading courses...</div>
      <div id="course-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
        <!-- Create Course Card and Course Cards will go here -->
      </div>
    </div>

    <!--Create Course Modal-->
    <div id="create-modal" class="glass" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 2rem; border-radius: var(--radius-lg); z-index: 1000; width: 500px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
      <h3 style="margin-top: 0;">Create New Course</h3>
      <p style="color: var(--text-muted);">Enter a description and our AI will generate the course structure for you.</p>
      
      <textarea id="course-prompt" rows="4" placeholder="e.g. Health and Safety in the Warehouse..." 
        style="width: 100%; padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem;"></textarea>

      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Supporting Documents (PDF, TXT)</label>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <input type="file" id="course-files" multiple accept=".pdf,.txt,.md" style="display: none;" />
          <button id="upload-btn" class="btn-secondary" style="font-size: 0.8rem; padding: 0.5rem 1rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Attach Files
          </button>
          <span id="file-count" style="font-size: 0.8rem; color: var(--text-muted);">No files selected</span>
        </div>
        <div id="file-list" style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-muted); max-height: 100px; overflow-y: auto;"></div>
      </div>
      
      <div id="generation-log" style="display: none; height: 150px; overflow-y: auto; background: rgba(0,0,0,0.5); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem; font-family: monospace; font-size: 0.8rem; color: #10b981; border: 1px solid var(--glass-border); white-space: pre-wrap;"></div>
      
      <div style="display: flex; gap: 1rem; justify-content: flex-end;">
        <button id="cancel-create" class="btn-ghost">Cancel</button>
        <button id="confirm-create" class="btn-primary">Generate Course</button>
      </div>
    </div>
    <div id="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 999; backdrop-filter: blur(5px);"></div>
  `
}

export const initManagerEvents = async () => {
  const modal = document.getElementById('create-modal')
  const overlay = document.getElementById('modal-overlay')
  const cancelBtn = document.getElementById('cancel-create')
  const confirmBtn = document.getElementById('confirm-create')
  const promptInput = document.getElementById('course-prompt')
  const fileInput = document.getElementById('course-files')
  const uploadBtn = document.getElementById('upload-btn')
  const fileCount = document.getElementById('file-count')
  const fileList = document.getElementById('file-list')
  const courseList = document.getElementById('course-list')

  const user = await getCurrentUser()

  // Load initial courses
  loadCourses()

  async function loadCourses() {
    courseList.innerHTML = '<p>Loading...</p>'
    try {
      const courses = await getCourses('manager')
      renderCourses(courses)
    } catch (error) {
      console.error(error)
      courseList.innerHTML = '<p style="color: red">Failed to load courses</p>'
    }
  }

  function renderCourses(courses) {
    const createCardHTML = `
      <div id="create-course-card" class="glass card-hover" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; cursor: pointer; border: 2px dashed var(--glass-border); background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-lg);">
        <div style="width: 60px; height: 60px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; margin-bottom: 1rem; box-shadow: 0 0 20px rgba(18, 142, 205, 0.4);">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <h3 style="margin: 0; color: white;">Create Course</h3>
        <p style="margin: 0.5rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">AI Powered</p>
      </div>
    `

    const courseCardsHTML = courses.map((course, index) => `
      <div class="glass card-hover" style="padding: 0; overflow: hidden; border-radius: var(--radius-lg); display: flex; flex-direction: column; min-height: 300px;">
        <div style="height: 160px; background: #2a2a35; position: relative;">
          ${course.thumbnail_url
        ? `<img src="${course.thumbnail_url}" onerror="this.onerror=null; this.src='https://placehold.co/800x600/128ecd/ffffff?text=Course+Image'; console.warn('Thumbnail failed to load, falling back for:', '${course.title}');" style="width: 100%; height: 100%; object-fit: cover;">`
        : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(45deg, var(--primary), var(--aurora-2));">FSW</div>`
      }
          <div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: ${course.status === 'live' ? '#10b981' : '#f59e0b'}; color: black;">
            ${course.status.toUpperCase()}
          </div>
        </div>
        <div style="padding: 1.5rem; flex: 1; display: flex; flex-direction: column;">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 1.1rem;">${course.title}</h4>
          <p style="margin: 0 0 1rem 0; font-size: 0.9rem; color: var(--text-muted); flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${course.description || 'No description'}</p>
          <div style="display: flex; gap: 0.5rem;">
            <button id="view-btn-${index}" class="btn-secondary" style="flex: 1;">View</button>
            <button id="edit-btn-${index}" class="btn-secondary" style="flex: 1;">Edit</button>
            <button id="delete-btn-${index}" class="btn-danger">Delete</button>
          </div>
        </div>
      </div>
    `).join('')

    courseList.innerHTML = createCardHTML + courseCardsHTML

    // Bind Create Card Event
    document.getElementById('create-course-card').addEventListener('click', () => toggleModal(true))

    // Bind View and Edit Buttons
    courses.forEach((course, index) => {
      document.getElementById(`view-btn-${index}`).addEventListener('click', () => {
        renderCoursePlayer(course, user)
      })

      document.getElementById(`edit-btn-${index}`).addEventListener('click', () => {
        renderCourseEditor(course, user)
      })

      const deleteBtn = document.getElementById(`delete-btn-${index}`)
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Are you sure you want to delete "${course.title}"? This cannot be undone.`)) {
          try {
            console.log(`[Manager] Deleting course ${course.id} with role ${user.role}`)

            // UI Feedback
            const originalText = deleteBtn.innerText
            deleteBtn.innerText = 'Deleting...'
            deleteBtn.disabled = true
            deleteBtn.style.opacity = '0.7'

            const result = await deleteCourse(course.id, user.role)
            console.log('[Manager] Delete result:', result)

            // Success
            alert('Course deleted successfully')
            console.log('[Manager] Reloading courses...')
            await loadCourses()

          } catch (e) {
            console.error('[Manager] Delete Error:', e)
            alert(`Failed to delete course:\n${e.message}`)

            // Reset button if failed
            deleteBtn.innerText = 'Delete'
            deleteBtn.disabled = false
            deleteBtn.style.opacity = '1'
          }
        }
      })
    })
  }

  // File Upload Handlers
  uploadBtn?.addEventListener('click', () => fileInput.click())

  fileInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) {
      fileCount.innerText = 'No files selected'
      fileList.innerHTML = ''
      return
    }

    fileCount.innerText = `${files.length} file${files.length === 1 ? '' : 's'} selected`
    fileList.innerHTML = files.map(f => `<div>• ${f.name}</div>`).join('')
  })

  // Helper to extract text from files
  async function extractTextFromFiles(files) {
    let combinedText = ""

    for (const file of files) {
      combinedText += `\n\n--- Start of Document: ${file.name} ---\n`

      try {
        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer()
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
          let pdfText = ""

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()
            const pageText = textContent.items.map(item => item.str).join(' ')
            pdfText += `\n[Page ${i}]\n${pageText}`
          }
          combinedText += pdfText
        } else {
          // Plain text / markdown
          const text = await file.text()
          combinedText += text
        }
      } catch (err) {
        console.error(`Failed to read file ${file.name}:`, err)
        combinedText += `\n[ERROR READING FILE]\n`
      }

      combinedText += `\n--- End of Document: ${file.name} ---\n`
    }
    return combinedText
  }

  function toggleModal(show) {
    modal.style.display = show ? 'block' : 'none'
    overlay.style.display = show ? 'block' : 'none'
    if (!show) promptInput.value = ''
  }

  cancelBtn?.addEventListener('click', () => toggleModal(false))
  overlay?.addEventListener('click', () => toggleModal(false))

  confirmBtn?.addEventListener('click', async () => {
    const description = promptInput.value
    if (!description && fileInput.files.length === 0) return

    // Extract file content
    const files = Array.from(fileInput.files)
    let supportingDocs = ""

    if (files.length > 0) {
      // Show feedback while reading
      const originalBtnText = confirmBtn.innerText
      confirmBtn.innerText = 'Reading files...'
      confirmBtn.disabled = true

      supportingDocs = await extractTextFromFiles(files)

      confirmBtn.innerText = originalBtnText
      confirmBtn.disabled = false
    }

    const logContainer = document.getElementById('generation-log')

    // Reset Log UI
    if (logContainer) {
      logContainer.style.display = 'block'
      logContainer.innerHTML = '<div style="opacity: 0.7">> Initializing AI agent...</div>'
    }

    const onProgress = (msg) => {
      if (logContainer) {
        const line = document.createElement('div')
        line.innerText = `> ${msg}`
        line.style.marginBottom = '4px'
        // Highlight errors
        if (msg.includes('FAILED') || msg.includes('Error')) {
          line.style.color = '#ef4444'
        }
        logContainer.appendChild(line)
        logContainer.scrollTop = logContainer.scrollHeight
      }
    }

    try {
      confirmBtn.innerText = 'Generating...'
      confirmBtn.disabled = true

      console.log('Starting course generation for:', description)

      // 1. Generate Content with Progress Callback
      const aiData = await generateCourseContent(description, supportingDocs, onProgress)

      console.log('AI Content Generated:', aiData)
      onProgress('Saving course to database...')

      // 2. Create Course in DB
      const course = await createCourse({
        title: aiData.title,
        description: aiData.description,
        content_json: aiData.modules,
        thumbnail_url: aiData.thumbnail_url, // Strict usage of AI thumbnail
        status: 'draft'
      })
      console.log('Course Created:', course)

      onProgress('SUCCESS: Course generated and saved.')
      onProgress('Refreshing dashboard...')

      // 3. Reset and Reload (with slight delay to read success)
      setTimeout(async () => {
        toggleModal(false)
        if (logContainer) logContainer.style.display = 'none' // Reset for next time
        await loadCourses()
        alert('Course successfully generated! It is now in Draft mode.')
      }, 1500)

    } catch (error) {
      console.error('Course Generation Failed:', error)
      if (logContainer) {
        logContainer.innerHTML += `<div style="color: #ef4444; margin-top: 1rem; border-top: 1px solid #ef4444; padding-top: 0.5rem;">CRITICAL FAILURE: ${error.message}</div>`
      }
      alert(`Generation Failed:\n${error.message}\n\nCheck the log for details.`)
    } finally {
      confirmBtn.innerText = 'Generate Course'
      confirmBtn.disabled = false
      // Clear files
      fileInput.value = ''
      fileCount.innerText = 'No files selected'
      fileList.innerHTML = ''
    }
  })
}
