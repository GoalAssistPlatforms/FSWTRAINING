import { generateCourseContent } from '../api/ai'
import { createCourse, getCourses, deleteCourse } from '../api/courses'
import { getTeamStats, assignCourseToUser, bulkAssignCourse, revokeAssignment, forceResitCourse } from '../api/manager'
import { getTeamCompletionRates, exportTeamDataCSV } from '../api/analytics'
import { renderCourseEditor } from './CourseEditor'
import { renderCoursePlayer } from './CoursePlayer'
import { getCurrentUser } from '../api/auth'
import { downloadCertificate } from '../utils/certificateGenerator'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export const renderManagerDashboard = (user) => {
  return `
    <div style="min-height: 80vh;">
      <div style="display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem;">
        <button id="tab-courses" class="btn-primary">My Courses</button>
        <button id="tab-team" class="btn-ghost" style="border: 1px solid var(--glass-border);">Team Progress</button>
        <button id="tab-analytics" class="btn-ghost" style="border: 1px solid var(--glass-border);">Analytics & Reports</button>
      </div>

      <!-- Courses View -->
      <div id="view-courses">
        <div id="loading-courses" style="text-align: center; display: none;">Loading courses...</div>
        <div id="course-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
          <!-- Create Course Card and Course Cards will go here -->
        </div>
      </div>

      <!-- Team View -->
      <div id="view-team" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0;">User Management</h2>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <input type="text" id="user-search" placeholder="Search users by email..." style="width: 300px; padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none;">
          <button id="bulk-assign-btn" class="btn-primary" style="display: none;">Assign Course to Entire Team</button>
        </div>

        <div id="loading-team" style="text-align: center; display: none;">Loading team stats...</div>
        <div id="team-list" style="display: grid; gap: 1rem;">
          <!-- Team Member Stats -->
        </div>
      </div>

      <!-- Analytics View -->
      <div id="view-analytics" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0;">Team Analytics</h2>
          <button id="export-csv-btn" class="btn-secondary">Export to CSV</button>
        </div>

        <div id="loading-analytics" style="text-align: center; display: none;">Loading metrics...</div>
        
        <!-- Key Metrics Cards -->
        <div id="analytics-metrics" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
            <!-- Rendered via JS -->
        </div>

        <!-- Detailed Table -->
        <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="margin: 0;">Member Overview</h3>
            <div style="display: flex; gap: 1rem;">
                <input type="text" id="analytics-search" placeholder="Search by email..." style="padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
                <select id="analytics-filter" style="padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
                    <option value="all">All Status</option>
                    <option value="overdue">Has Overdue</option>
                </select>
            </div>
          </div>
          <div style="overflow-x: auto;">
             <table style="width: 100%; text-align: left; border-collapse: collapse;">
                <thead>
                   <tr style="border-bottom: 1px solid var(--glass-border); color: var(--text-muted);">
                      <th style="padding: 1rem 0;">Email</th>
                      <th style="padding: 1rem 0;">Assigned</th>
                      <th style="padding: 1rem 0;">Completed</th>
                      <th style="padding: 1rem 0;">In Progress</th>
                      <th style="padding: 1rem 0;">Overdue</th>
                   </tr>
                </thead>
                <tbody id="analytics-table-body">
                   <!-- Rows go here -->
                </tbody>
             </table>
          </div>
        </div>
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

    <!-- Assign Course Modal -->
    <div id="assign-modal" class="glass" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 2rem; border-radius: var(--radius-lg); z-index: 1000; width: 400px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
      <h3 style="margin-top: 0;" id="assign-modal-title">Assign Course</h3>
      <p style="color: var(--text-muted);" id="assign-modal-desc">Select a course to assign.</p>
      
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Select Course</label>
        <select id="assign-course-select" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
          <option value="">Loading courses...</option>
        </select>
      </div>

      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Due Date (Optional)</label>
        <input type="date" id="assign-due-date" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; color-scheme: dark;">
      </div>

      <div style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
        <input type="checkbox" id="assign-mandatory" style="width: 1.2rem; height: 1.2rem;">
        <label for="assign-mandatory" style="color: white; font-size: 0.9rem;">Mark as Mandatory</label>
      </div>
      
      <div style="display: flex; gap: 1rem; justify-content: flex-end;">
        <button id="cancel-assign" class="btn-ghost">Cancel</button>
        <button id="confirm-assign" class="btn-primary">Assign</button>
      </div>
    </div>
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

  const tabCourses = document.getElementById('tab-courses')
  const tabTeam = document.getElementById('tab-team')
  const tabAnalytics = document.getElementById('tab-analytics')
  const viewCourses = document.getElementById('view-courses')
  const viewTeam = document.getElementById('view-team')
  const viewAnalytics = document.getElementById('view-analytics')
  const teamList = document.getElementById('team-list')
  const loadingTeam = document.getElementById('loading-team')

  const loadingAnalytics = document.getElementById('loading-analytics')
  const analyticsMetrics = document.getElementById('analytics-metrics')
  const analyticsTableBody = document.getElementById('analytics-table-body')
  const analyticsSearch = document.getElementById('analytics-search')
  const analyticsFilter = document.getElementById('analytics-filter')
  const exportCsvBtn = document.getElementById('export-csv-btn')

  const user = await getCurrentUser()

  let currentAnalyticsStats = [] // Store for filtering

  // Event Delegation for dynamically rendered team list buttons
  teamList?.addEventListener('click', async (e) => {
    // 1. Assign Course
    const assignBtn = e.target.closest('.assign-user-btn')
    if (assignBtn && window.openAssignModal) {
      window.openAssignModal(assignBtn.dataset.userid, assignBtn.dataset.email)
    }

    // 2. Revoke Course
    const revokeBtn = e.target.closest('.revoke-user-btn')
    if (revokeBtn) {
      const userId = revokeBtn.dataset.userid
      const courseId = revokeBtn.dataset.courseid
      if (confirm('Are you sure you want to revoke this course assignment?')) {
        try {
          const originalText = revokeBtn.innerText
          revokeBtn.innerText = 'Revoking...'
          revokeBtn.disabled = true
          await revokeAssignment(userId, courseId)
          loadTeamStats() // refresh ui
        } catch (error) {
          console.error(error)
          alert('Failed to revoke assignment.')
          revokeBtn.innerText = 'Revoke'
          revokeBtn.disabled = false
        }
      }
    }

    // 3. Force Resit
    const resitBtn = e.target.closest('.resit-user-btn')
    if (resitBtn) {
      const userId = resitBtn.dataset.userid
      const courseId = resitBtn.dataset.courseid
      if (confirm('Are you sure you want to force this user to resit the course? This will completely reset their progress and previous completion date.')) {
        try {
          resitBtn.innerText = 'Resetting...'
          resitBtn.disabled = true
          await forceResitCourse(userId, courseId)
          loadTeamStats() // refresh ui
        } catch (error) {
          console.error(error)
          alert('Failed to force resit.')
          resitBtn.innerText = 'Force Resit'
          resitBtn.disabled = false
        }
      }
    }

    // 4. Download Cert
    const certBtn = e.target.closest('.download-cert-btn')
    if (certBtn) {
      const { useremail, coursetitle, issuedate, expirydate, certid } = certBtn.dataset
      certBtn.innerText = 'Downloading...'
      try {
        await downloadCertificate(useremail, coursetitle, issuedate, expirydate !== 'null' ? expirydate : null, certid)
      } catch (err) {
        alert('Could not generate PDF')
      } finally {
        certBtn.innerText = 'Download Cert'
      }
    }
  })

  document.getElementById('user-search')?.addEventListener('input', () => {
    loadTeamStats()
  })

  // Tab switching logic
  const resetTabs = () => {
    [tabCourses, tabTeam, tabAnalytics].forEach(t => {
      if(t) { t.className = 'btn-ghost'; t.style.border = '1px solid var(--glass-border)' }
    });
    [viewCourses, viewTeam, viewAnalytics].forEach(v => {
      if(v) v.style.display = 'none'
    });
  }

  tabCourses?.addEventListener('click', () => {
    resetTabs()
    tabCourses.className = 'btn-primary'
    tabCourses.style.border = 'none'
    viewCourses.style.display = 'block'
  })

  tabTeam?.addEventListener('click', () => {
    resetTabs()
    tabTeam.className = 'btn-primary'
    tabTeam.style.border = 'none'
    viewTeam.style.display = 'block'
    loadTeamStats()
  })

  tabAnalytics?.addEventListener('click', () => {
    resetTabs()
    tabAnalytics.className = 'btn-primary'
    tabAnalytics.style.border = 'none'
    viewAnalytics.style.display = 'block'
    loadAnalytics()
  })

  async function loadTeamStats() {
    if (!loadingTeam || !teamList) return;
    loadingTeam.style.display = 'block'
    teamList.innerHTML = ''
    try {
      const { team, stats } = await getTeamStats()
      loadingTeam.style.display = 'none'

      if (!stats || stats.length === 0) {
        teamList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No users found in the system.</p>'
        return
      }

      const searchInput = document.getElementById('user-search')
      const query = searchInput ? searchInput.value.toLowerCase() : ''
      const filteredStats = stats.filter(s => s.email.toLowerCase().includes(query))

      if (filteredStats.length === 0) {
        teamList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No users match your search.</p>'
        return
      }

      // Only show bulk assign if there are members
      const bulkAssignBtn = document.getElementById('bulk-assign-btn')
      if (stats && stats.length > 0) {
        bulkAssignBtn.style.display = 'block'
      } else {
        bulkAssignBtn.style.display = 'none'
      }

      teamList.innerHTML = filteredStats.map((member, idx) => {
        const completionPct = member.totalAssigned > 0 ? Math.round((member.completed / member.totalAssigned) * 100) : 0;
        
        return `
        <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1;">
              <h4 style="margin: 0 0 0.5rem 0;">${member.email}</h4>
              <span style="font-size: 0.8rem; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px;">Role: ${member.team_role || 'member'}</span>
              
              <div style="margin-top: 1.5rem; width: 80%;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
                  <span>Overall Completion</span>
                  <span>${completionPct}%</span>
                </div>
                <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                  <div style="height: 100%; width: ${completionPct}%; background: ${completionPct === 100 ? '#10b981' : 'var(--primary)'}; border-radius: 3px;"></div>
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 2rem; text-align: center; margin-right: 2rem;">
              <div>
                <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary);">${member.totalAssigned}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Assigned</div>
              </div>
              <div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #f59e0b;">${member.inProgress}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">In Progress</div>
              </div>
              <div>
                <div style="font-size: 1.5rem; font-weight: bold; color: #10b981;">${member.completed}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Completed</div>
              </div>
            </div>
            <div>
               <button class="btn-secondary assign-user-btn" data-userid="${member.id}" data-email="${member.email}">Assign Course</button>
            </div>
          </div>
          
          ${member.progressData && member.progressData.length > 0 ? `
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
              <details>
                <summary style="font-weight: bold; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; outline: none; user-select: none; cursor: pointer; padding: 0.5rem; border-radius: var(--radius-md); background: rgba(0,0,0,0.1); transition: background 0.2s;">
                  <span>Assigned Courses (${member.progressData.length})</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </summary>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; cursor: default;">
                  ${member.progressData.map(p => {
                    const isExpired = p.expires_at && new Date(p.expires_at) < new Date();
                    const isOverdue = p.due_date && new Date(p.due_date) < new Date() && p.status !== 'completed';
                    let statusColor = p.status === 'completed' ? '#10b981' : (p.status === 'in-progress' ? '#f59e0b' : 'rgba(255,255,255,0.1)');
                    let statusTxt = p.status.toUpperCase();
                    let badgeColor = p.status === 'completed' || p.status === 'in-progress' ? 'black' : 'white';

                    if (isExpired) {
                      statusColor = '#ef4444';
                      statusTxt = 'EXPIRED';
                      badgeColor = 'white';
                    } else if (isOverdue) {
                      statusColor = '#ef4444';
                      statusTxt = 'OVERDUE';
                      badgeColor = 'white';
                    }

                    return `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 0.5rem 1rem; border-radius: var(--radius-md); border-left: 3px solid ${isExpired || isOverdue ? '#ef4444' : 'transparent'};">
                      <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="font-size: 0.9rem; font-weight: ${isExpired || isOverdue ? 'bold' : 'normal'}; color: ${isExpired || isOverdue ? '#ef4444' : 'white'};">${p.courses?.title || 'Unknown Course'}</span>
                        <span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: ${statusColor}; color: ${badgeColor}; font-weight: bold;">${statusTxt}</span>
                        ${p.due_date && !isExpired && p.status !== 'completed' ? `<span style="font-size: 0.8rem; color: ${isOverdue ? '#ef4444' : 'var(--text-muted)'};">Due: ${new Date(p.due_date).toLocaleDateString()}</span>` : ''}
                        ${p.expires_at && p.status === 'completed' && !isExpired ? `<span style="font-size: 0.8rem; color: var(--text-muted);">Valid til: ${new Date(p.expires_at).toLocaleDateString()}</span>` : ''}
                      </div>
                      <div style="display: flex; gap: 0.5rem; align-items: center;">
                        ${p.status === 'completed' && !isExpired && p.certificate_id ? `
                          <button class="btn-ghost download-cert-btn" data-useremail="${member.email}" data-coursetitle="${p.courses?.title}" data-issuedate="${p.completed_at}" data-expirydate="${p.expires_at || 'null'}" data-certid="${p.certificate_id}" style="color: #0ea5e9; font-size: 0.8rem; padding: 0.2rem 0.5rem;">Download Cert</button>
                        ` : ''}
                        ${isExpired ? `
                          <button class="btn-secondary resit-user-btn" data-userid="${member.id}" data-courseid="${p.course_id}" style="font-size: 0.8rem; padding: 0.2rem 0.5rem;">Force Resit</button>
                        ` : `
                          <button class="btn-ghost revoke-user-btn" data-userid="${member.id}" data-courseid="${p.course_id}" style="color: #ef4444; font-size: 0.8rem; padding: 0.2rem 0.5rem;">Revoke</button>
                        `}
                      </div>
                    </div>
                  `}).join('')}
                </div>
              </details>
            </div>
          ` : ''}
        </div>
      `}).join('')

    } catch (error) {
      console.error('Error loading team stats:', error)
      loadingTeam.style.display = 'none'
      teamList.innerHTML = `<p style="color: red; text-align: center;">Failed to load team data:<br/><pre style="text-align:left; font-size: 10px; color: pink;">${error.stack || error.message || JSON.stringify(error)}</pre></p>`
    }
  }

  // ==== ASSIGN MODAL & REGEN LOGIC ====
  const assignModal = document.getElementById('assign-modal')
  const assignModalTitle = document.getElementById('assign-modal-title')
  const assignCourseSelect = document.getElementById('assign-course-select')
  const assignDueDate = document.getElementById('assign-due-date')
  const assignMandatory = document.getElementById('assign-mandatory')
  const confirmAssignBtn = document.getElementById('confirm-assign')
  const cancelAssignBtn = document.getElementById('cancel-assign')

  let currentAssignTarget = null

  window.openAssignModal = (userId, email) => {
    currentAssignTarget = { type: 'user', id: userId }
    assignModalTitle.innerText = `Assign Course to ${email}`
    
    assignCourseSelect.value = ''
    assignDueDate.value = ''
    assignMandatory.checked = false
    
    assignModal.style.display = 'block'
    overlay.style.display = 'block'
  }

  const openBulkAssignModal = () => {
    currentAssignTarget = { type: 'bulk' }
    assignModalTitle.innerText = `Bulk Assign to Team`
    
    assignCourseSelect.value = ''
    assignDueDate.value = ''
    assignMandatory.checked = false
    
    assignModal.style.display = 'block'
    overlay.style.display = 'block'
  }

  document.getElementById('bulk-assign-btn')?.addEventListener('click', openBulkAssignModal)

  const closeAssignModal = () => {
    assignModal.style.display = 'none'
    overlay.style.display = 'none'
    currentAssignTarget = null
  }

  cancelAssignBtn?.addEventListener('click', closeAssignModal)
  overlay?.addEventListener('click', () => {
    if (assignModal.style.display === 'block') closeAssignModal()
  })

  confirmAssignBtn?.addEventListener('click', async () => {
    const courseId = assignCourseSelect.value
    if (!courseId) return alert('Please select a course.')
    
    const dueDate = assignDueDate.value || null
    const isMandatory = assignMandatory.checked

    try {
      confirmAssignBtn.innerText = 'Assigning...'
      confirmAssignBtn.disabled = true
      
      if (currentAssignTarget.type === 'bulk') {
        await bulkAssignCourse(courseId, dueDate, isMandatory)
      } else {
        await assignCourseToUser(currentAssignTarget.id, courseId, dueDate, isMandatory)
      }
      
      closeAssignModal()
      loadTeamStats()
      alert('Assignment successful!')
    } catch (e) {
      console.error(e)
      alert('Failed to assign course:\n' + (e.message || JSON.stringify(e)))
    } finally {
      confirmAssignBtn.innerText = 'Assign'
      confirmAssignBtn.disabled = false
    }
  })

  // ==== END ASSIGN LOGIC ====

  // Load initial courses
  loadCourses()

  async function loadCourses() {
    courseList.innerHTML = '<p>Loading...</p>'
    try {
      const courses = await getCourses('manager')
      renderCourses(courses)
      
      // Populate Assign Course Dropdown (Only Live courses!)
      const liveCourses = courses.filter(c => c.status === 'live')
      const assignSelect = document.getElementById('assign-course-select')
      if (assignSelect) {
        assignSelect.innerHTML = '<option value="">-- Select a Course --</option>' + liveCourses.map(c => `<option value="${c.id}">${c.title}</option>`).join('')
      }
      
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

  // ==== ANALYTICS LOGIC ====
  async function loadAnalytics() {
    if (!loadingAnalytics || !analyticsMetrics) return
    loadingAnalytics.style.display = 'block'
    analyticsMetrics.innerHTML = ''
    analyticsTableBody.innerHTML = ''
    try {
      const data = await getTeamCompletionRates()
      loadingAnalytics.style.display = 'none'
      
      currentAnalyticsStats = data.memberStats || []

      // Render Metrics
      analyticsMetrics.innerHTML = `
        <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); text-align: center;">
            <div style="font-size: 2rem; font-weight: bold; color: var(--primary);">${data.overallCompletionPercent}%</div>
            <div style="color: var(--text-muted);">Overall Completion</div>
        </div>
        <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); text-align: center;">
            <div style="font-size: 2rem; font-weight: bold; color: white;">${data.totalAssigned}</div>
            <div style="color: var(--text-muted);">Total Assigned</div>
        </div>
        <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); text-align: center;">
            <div style="font-size: 2rem; font-weight: bold; color: #10b981;">${data.totalCompleted}</div>
            <div style="color: var(--text-muted);">Completed</div>
        </div>
        <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); text-align: center; ${data.totalOverdue > 0 ? 'border: 1px solid #ef4444;' : ''}">
            <div style="font-size: 2rem; font-weight: bold; color: ${data.totalOverdue > 0 ? '#ef4444' : '#f59e0b'};">${data.totalOverdue}</div>
            <div style="color: var(--text-muted);">Overdue</div>
        </div>
      `

      renderAnalyticsTable()

    } catch(e) {
      console.error(e)
      loadingAnalytics.style.display = 'none'
      analyticsMetrics.innerHTML = `<p style="color: red;">Failed to load analytics:<br/><pre style="font-size:10px; color: pink;">${e.stack || e.message || JSON.stringify(e)}</pre></p>`
    }
  }

  function renderAnalyticsTable() {
     const filterVal = analyticsFilter?.value || 'all'
     const searchVal = analyticsSearch?.value.toLowerCase() || ''

     const now = new Date()

     let filtered = currentAnalyticsStats.filter(m => {
        let overdueCount = 0
        if(m.progressData) {
            m.progressData.forEach(p => {
                if(p.due_date && (p.status === 'assigned' || p.status === 'in-progress') && new Date(p.due_date) < now) {
                    overdueCount++
                }
            })
        }
        m._overdueCount = overdueCount // Cache for rendering

        if(filterVal === 'overdue' && overdueCount === 0) return false
        
        if(searchVal && !m.email.toLowerCase().includes(searchVal)) return false

        return true
     })

     analyticsTableBody.innerHTML = filtered.map(m => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 1rem 0;">${m.email} <span style="font-size:0.7rem; color: var(--text-muted);">(${m.team_role || 'member'})</span></td>
            <td style="padding: 1rem 0;">${m.totalAssigned}</td>
            <td style="padding: 1rem 0; color: #10b981;">${m.completed}</td>
            <td style="padding: 1rem 0; color: #f59e0b;">${m.inProgress}</td>
            <td style="padding: 1rem 0; color: ${m._overdueCount > 0 ? '#ef4444' : 'inherit'};">${m._overdueCount}</td>
        </tr>
     `).join('')

     if(filtered.length === 0) {
         analyticsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No members match criteria.</td></tr>'
     }
  }

  analyticsSearch?.addEventListener('input', renderAnalyticsTable)
  analyticsFilter?.addEventListener('change', renderAnalyticsTable)

  exportCsvBtn?.addEventListener('click', async () => {
      try {
          const origText = exportCsvBtn.innerText
          exportCsvBtn.innerText = 'Exporting...'
          exportCsvBtn.disabled = true
          await exportTeamDataCSV()
          exportCsvBtn.innerText = origText
          exportCsvBtn.disabled = false
      } catch(e) {
          alert('Failed to export CSV')
          exportCsvBtn.innerText = 'Export to CSV'
          exportCsvBtn.disabled = false
      }
  })

}
