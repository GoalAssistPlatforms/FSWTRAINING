import { generateCourseContent } from '../api/ai'
import { getAllFeedback } from '../api/feedback'
import { createCourse, getCourses, deleteCourse, getCourseUsageStats } from '../api/courses'
import { getTeamStats, assignCourseToUser, bulkAssignCourse, revokeAssignment, forceResitCourse, updateUserDepartment, archiveUser } from '../api/manager'
import { getTeamCompletionRates, exportTeamDataCSV } from '../api/analytics'
import { getPlatformSettings } from '../api/admin'
import { renderCourseEditor } from './CourseEditor'
import { renderCoursePlayer } from './CoursePlayer'
import { getCurrentUser } from '../api/auth'
import { downloadCertificate } from '../utils/certificateGenerator'
import { fetchPendingExtensions, resolveExtension, sendNudge } from '../api/notifications'
import { fswAlert, fswConfirm, fswPrompt } from '../utils/dialog'
import { getPacks, getPack, createPack, updatePack, deletePack, assignPack, bulkAssignPack, revokePackAssignment, getPackCompletionStats, getPackAssignments } from '../api/packs'
import { fetchAllGuides } from '../api/guides.js'
import * as pdfjsLib from 'pdfjs-dist'


// Set worker source for pdf.js
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const renderManagerDashboard = (user) => {
  return `
    <div style="min-height: 80vh;">
      <div style="display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem;">
        <button id="tab-courses" class="btn-primary">My Courses</button>
        <button id="tab-guides" class="btn-ghost" style="border: 1px solid var(--glass-border);">Guides & Policies</button>
        <button id="tab-team" class="btn-ghost" style="border: 1px solid var(--glass-border);">Team</button>
        <button id="tab-feedback" class="btn-ghost" style="border: 1px solid var(--glass-border);">Feedback</button>
      </div>

      <!-- Courses View -->
      <div id="view-courses">
        <div id="loading-courses" style="text-align: center; display: none;">Loading courses & packs...</div>
        
        <div style="margin-bottom: 2.5rem;">
          <h2 style="margin: 0 0 1rem 0; font-size: 1.35rem; color: white; display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> Courses
          </h2>
          <div id="course-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
            <!-- Create Course Card and Course Cards will go here -->
          </div>
        </div>

        <div style="margin-top: 3rem; margin-bottom: 1.5rem;">
          <h2 style="margin: 0 0 1rem 0; font-size: 1.35rem; color: white; display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> Learning Packs
          </h2>
          <div id="pack-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
            <!-- Create Pack Card and Pack Cards will go here -->
          </div>
        </div>
      </div>

      <!-- Guides View -->
      <div id="view-guides" style="display: none;"></div>


      <!-- Team View (Unified Dashboard) -->
      <div id="view-team" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <h2 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            Team Dashboard
          </h2>
        </div>

        <!-- Top Analytics Row -->
        <div id="loading-team-stats" style="text-align: center; display: none;">Loading team data...</div>
        <div id="team-metrics" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
          <!-- Metrics injected here via JS -->
        </div>

        <!-- Manager Inbox / Action Items -->
        <div id="manager-inbox-container" style="display: none; margin-bottom: 2rem;">
            <h3 style="margin-top: 0; color: #f59e0b; display: flex; align-items: center; gap: 0.5rem;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Action Items
            </h3>
            <div id="manager-inbox-list" style="display: flex; flex-direction: column; gap: 1rem;"></div>
        </div>



        <!-- Unified Control Toolbar -->
        <div class="glass" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; padding: 1rem; border-radius: var(--radius-lg); margin-bottom: 2rem; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); gap: 1rem;">
          <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
            <div style="position: relative; width: 260px; flex-shrink: 0;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" id="user-search" placeholder="Search team by email..." style="box-sizing: border-box; width: 100%; padding: 0.6rem 1rem 0.6rem 2.5rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; transition: border-color 0.2s;">
            </div>
            
            <select id="user-status-filter" style="padding: 0.6rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; margin-right: 0.5rem;">
                <option value="all">All Members</option>
                <option value="overdue">Has Overdue Training</option>
                <option value="in-progress">In Progress</option>
            </select>
            <select id="department-filter" style="padding: 0.6rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none;">
                <option value="all">All Departments</option>
            </select>
          </div>
          
          <div style="display: flex; gap: 1rem; align-items: center;">
            <button id="export-csv-btn" class="btn-ghost" style="border: 1px solid var(--glass-border); display: flex; align-items: center; gap: 0.5rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export CSV
            </button>
            <button id="bulk-assign-btn" class="btn-primary" style="display: none; display: flex; align-items: center; gap: 0.5rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
              Bulk Assign
            </button>
          </div>
        </div>

        <div id="team-list" style="display: grid; gap: 1rem;">
          <!-- Team Member Stats -->
        </div>
      </div>

      <!-- Feedback View -->
      <div id="view-feedback" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <h2 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            Feedback Dashboard
          </h2>
        </div>

        <div id="loading-feedback-stats" style="text-align: center; display: none;">Loading feedback data...</div>
        <div id="feedback-metrics" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
          <!-- Metrics injected here via JS -->
        </div>

        <div class="glass" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; padding: 1rem; border-radius: var(--radius-lg); margin-bottom: 2rem; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); gap: 1rem;">
          <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
            <div style="position: relative; width: 260px; flex-shrink: 0;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" id="feedback-search" placeholder="Search by email or name..." style="box-sizing: border-box; width: 100%; padding: 0.6rem 1rem 0.6rem 2.5rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none;">
            </div>
            <select id="feedback-type-filter" style="padding: 0.6rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none; margin-right: 0.5rem;">
                <option value="all">All Types</option>
                <option value="positive">Positive / Testimonial</option>
                <option value="negative">Product Improvement</option>
                <option value="urgent">Urgent System Error</option>
            </select>
            <select id="feedback-status-filter" style="padding: 0.6rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.2); color: white; outline: none;">
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="under-review">Under Review</option>
                <option value="acting-on">Acting On</option>
                <option value="resolved">Resolved</option>
            </select>
          </div>
          
          <div style="display: flex; gap: 1rem; align-items: center;">
            <button id="export-feedback-csv" class="btn-ghost" style="border: 1px solid var(--glass-border); display: flex; align-items: center; gap: 0.5rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export CSV
            </button>
          </div>
        </div>

        <div id="view-feedback-list" style="display: flex; flex-direction: column; gap: 1rem;">
           <div style="text-align: center; color: var(--text-muted); padding: 1rem;">Loading feedback...</div>
        </div>
      </div>
    </div>

    <!--Create Course Modal-->
    <style>
      #create-modal textarea::placeholder, #create-modal input::placeholder {
        color: rgba(255, 255, 255, 0.4);
        font-style: italic;
      }
      #create-modal input:focus, #create-modal textarea:focus {
        border-color: var(--primary) !important;
        background: rgba(0,0,0,0.5) !important;
      }
      #create-modal label {
        color: var(--text-muted);
        font-weight: 600;
        margin-bottom: 0.4rem;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: block;
      }
    </style>
    <div id="create-modal" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 2.2rem; border-radius: var(--radius-lg); z-index: 1000; width: 580px; box-shadow: 0 25px 60px rgba(0,0,0,0.65); background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(16px); box-sizing: border-box;">
      <h3 style="margin-top: 0; font-size: 1.6rem; font-weight: bold; background: linear-gradient(to right, #ffffff, #d1d5db); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Create New Course</h3>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem; line-height: 1.5; font-size: 0.9rem; margin-top: 0.25rem;">Fill out the details below and our AI will generate the course structure for you. The more detail you provide, the better the output!</p>
      
      <div style="max-height: 45vh; overflow-y: auto; padding-right: 0.75rem; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; box-sizing: border-box;">
          <div>
              <label>Course Title *</label>
              <input type="text" id="course-title" placeholder="e.g. Managing Absence" style="box-sizing: border-box; width: 100%; padding: 0.8rem 1rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; font-size: 0.95rem; outline: none; transition: border-color 0.2s, background 0.2s;" />
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem; margin: 0.15rem 0; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.06); box-sizing: border-box;">
              <input type="checkbox" id="course-allow-pretest" style="width: 1.2rem; height: 1.2rem; cursor: pointer; accent-color: var(--primary);">
              <div>
                  <label for="course-allow-pretest" style="color: white; font-size: 0.9rem; font-weight: 600; cursor: pointer; display: block; margin: 0; text-transform: none; letter-spacing: 0;">Allow Diagnostic Pre-Test</label>
                  <span style="color: var(--text-muted); font-size: 0.75rem; display: block; margin-top: 0.1rem; line-height: 1.3;">Users can skip modules they already know by passing pre-test questions.</span>
              </div>
          </div>
          <div>
              <label>Course Objective <span style="font-weight: normal; text-transform: none; font-size: 0.75rem; color: var(--text-muted); opacity: 0.85;">(*Required if no files attached)</span></label>
              <textarea id="course-objective" rows="2" placeholder="e.g. Train line managers on our absence protocols" style="box-sizing: border-box; width: 100%; padding: 0.8rem 1rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; font-size: 0.95rem; outline: none; resize: none; transition: border-color 0.2s, background 0.2s;"></textarea>
          </div>
          <div>
              <label>Target Audience</label>
              <input type="text" id="course-audience" placeholder="e.g. Newly promoted managers" style="box-sizing: border-box; width: 100%; padding: 0.8rem 1rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; font-size: 0.95rem; outline: none; transition: border-color 0.2s, background 0.2s;" />
          </div>
          <div>
              <label>Mandatory Topics</label>
              <textarea id="course-topics" rows="2" placeholder="e.g. You must cover short-term sickness, long-term sickness, and return-to-work interviews" style="box-sizing: border-box; width: 100%; padding: 0.8rem 1rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; font-size: 0.95rem; outline: none; resize: none; transition: border-color 0.2s, background 0.2s;"></textarea>
          </div>
          <div>
              <label>Scenarios / Activities</label>
              <textarea id="course-scenarios" rows="2" placeholder="e.g. Please include a roleplay scenario where an employee goes AWOL for 3 days" style="box-sizing: border-box; width: 100%; padding: 0.8rem 1rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3); color: white; font-size: 0.95rem; outline: none; resize: none; transition: border-color 0.2s, background 0.2s;"></textarea>
          </div>
      </div>

      <div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.05); box-sizing: border-box;">
        <label style="margin-bottom: 0.6rem;">Supporting Documents (PDF, TXT, MD)</label>
        <div style="display: flex; gap: 0.75rem; align-items: center;">
          <input type="file" id="course-files" multiple accept=".pdf,.txt,.md" style="display: none;" />
          <button id="upload-btn" class="btn-ghost" style="font-size: 0.8rem; padding: 0.5rem 1rem; display: inline-flex; align-items: center; gap: 0.4rem; border: 1px solid var(--glass-border); color: white; cursor: pointer; border-radius: var(--radius-md); transition: background-color 0.2s;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
      <h3 style="margin-top: 0;" id="assign-modal-title">Assign Course or Pack</h3>
      <p style="color: var(--text-muted); margin-bottom: 1rem;" id="assign-modal-desc">Select a course or learning pack to assign.</p>
      
      <!-- Type Toggle -->
      <div id="assign-type-toggle-container" style="display: flex; background: rgba(0,0,0,0.3); border-radius: var(--radius-md); padding: 4px; margin-bottom: 1.25rem; border: 1px solid var(--glass-border);">
        <button id="assign-type-course" type="button" style="flex: 1; padding: 0.5rem; border: none; border-radius: var(--radius-sm); background: var(--primary); color: white; cursor: pointer; font-weight: bold; font-size: 0.85rem; transition: all 0.2s;">Course</button>
        <button id="assign-type-pack" type="button" style="flex: 1; padding: 0.5rem; border: none; border-radius: var(--radius-sm); background: transparent; color: var(--text-muted); cursor: pointer; font-weight: bold; font-size: 0.85rem; transition: all 0.2s;">Learning Pack</button>
      </div>

      <div style="margin-bottom: 1rem;">
        <label id="assign-select-label" style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Select Course</label>
        <select id="assign-course-select" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
          <option value="">Loading courses...</option>
        </select>
      </div>

      <div id="assign-department-container" style="margin-bottom: 1rem; display: none;">
        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Target Department</label>
        <select id="assign-department-select" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
           <option value="all">Entire Team</option>
        </select>
      </div>

      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem;">Due Date (Optional)</label>
        <input type="date" id="assign-due-date" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; color-scheme: dark;">
      </div>

      <div id="assign-mandatory-container" style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
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

export const initManagerEvents = async (effectiveUser) => {
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
  const packList = document.getElementById('pack-list')


  const tabCourses = document.getElementById('tab-courses')
  const tabGuides = document.getElementById('tab-guides')
  const tabTeam = document.getElementById('tab-team')
  const tabFeedback = document.getElementById('tab-feedback')
  const viewCourses = document.getElementById('view-courses')
  const viewGuides = document.getElementById('view-guides')
  const viewTeam = document.getElementById('view-team')
  const viewFeedback = document.getElementById('view-feedback')
  const teamList = document.getElementById('team-list')
  const loadingTeam = document.getElementById('loading-team-stats')
  const teamMetrics = document.getElementById('team-metrics')
  const inboxList = document.getElementById('manager-inbox-list')
  const userSearch = document.getElementById('user-search')
  const userStatusFilter = document.getElementById('user-status-filter')
  const departmentFilter = document.getElementById('department-filter')
  const exportCsvBtn = document.getElementById('export-csv-btn')

  // Analytics Declarations (Prevents ReferenceError crashes)
  const analyticsSearch = document.getElementById('analytics-search')
  const analyticsFilter = document.getElementById('analytics-filter')
  const loadingAnalytics = document.getElementById('loading-analytics')
  const analyticsMetrics = document.getElementById('analytics-metrics')
  const analyticsTableBody = document.getElementById('analytics-table-body')

  const user = effectiveUser || await getCurrentUser()

  let currentTeamStats = [] // Store for filtering
  let currentPlatformSettings = null // Store for limit display
  let currentAllFeedback = [] // Store for filtering feedback
  let currentAnalyticsStats = [] // Store for analytics filtering
  let selectedUserIds = new Set()
  let currentPackAssignments = [] // Store pack assignments




  const updateBulkAssignBtnState = () => {
    const bulkAssignBtn = document.getElementById('bulk-assign-btn')
    if (!bulkAssignBtn) return
    if (selectedUserIds.size > 0) {
      bulkAssignBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
        Assign to Selected (${selectedUserIds.size})
      `
    } else {
      bulkAssignBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
        Bulk Assign
      `
    }
  }

  // Handle checkbox toggles for team members
  teamList?.addEventListener('change', (e) => {
    if (e.target.classList.contains('user-select-cb')) {
      const userId = e.target.dataset.userid
      if (e.target.checked) selectedUserIds.add(userId)
      else selectedUserIds.delete(userId)
      updateBulkAssignBtnState()
    }
  })

  // Event Delegation for dynamically rendered course list buttons (Courses & Packs combined)
  viewCourses?.addEventListener('click', async (e) => {
    // 1. Create Course Card Click
    if (e.target.closest('#create-course-card')) {
      toggleModal(true)
      return
    }

    // 2. Create Pack Card Click
    if (e.target.closest('#create-pack-card')) {
      openPackBuilder()
      return
    }

    // 3. View Course
    const viewBtn = e.target.closest('.view-course-btn')
    if (viewBtn) {
      e.stopPropagation()
      const courseId = viewBtn.dataset.id
      const course = localCourses.find(c => c.id === courseId)
      if (course) {
        renderCoursePlayer(course, { ...user, role: 'user' }) // Preview as normal user
      }
      return
    }

    // 4. Edit Course (Run course player with manager privileges)
    const editBtn = e.target.closest('.edit-course-btn')
    if (editBtn) {
      e.stopPropagation()
      const courseId = editBtn.dataset.id
      const course = localCourses.find(c => c.id === courseId)
      if (course) {
        renderCoursePlayer(course, user) // Open with manager edit features
      }
      return
    }

    // 5. Delete Course
    const deleteBtn = e.target.closest('.delete-course-btn')
    if (deleteBtn) {
      e.stopPropagation()
      const courseId = deleteBtn.dataset.id
      const courseTitle = deleteBtn.dataset.title
      if (await fswConfirm(`Are you sure you want to delete "${courseTitle}"? This cannot be undone.`)) {
        try {
          deleteBtn.innerText = 'Deleting...'
          deleteBtn.disabled = true
          deleteBtn.style.opacity = '0.7'

          await deleteCourse(courseId, user.role)
          await fswAlert('Course deleted successfully')
          await loadCourses()
        } catch (err) {
          console.error('[Manager] Delete Error:', err)
          await fswAlert(`Failed to delete course:\n${err.message}`)
          deleteBtn.innerText = 'Delete'
          deleteBtn.disabled = false
          deleteBtn.style.opacity = '1'
        }
      }
      return
    }

    // 6. View Pack Progress
    const progressBtn = e.target.closest('.view-pack-progress-btn')
    if (progressBtn) {
      e.stopPropagation()
      openPackProgressModal(progressBtn.dataset.id, progressBtn.dataset.title)
      return
    }

    // 7. Edit Pack
    const editPackBtn = e.target.closest('.edit-pack-btn')
    if (editPackBtn) {
      e.stopPropagation()
      openPackBuilder(editPackBtn.dataset.id)
      return
    }

    // 8. Delete Pack
    const deletePackBtn = e.target.closest('.delete-pack-btn')
    if (deletePackBtn) {
      e.stopPropagation()
      const packId = deletePackBtn.dataset.id
      if (await fswConfirm('Are you sure you want to delete this learning pack? This will also remove all assignments and progress associated with it.')) {
        try {
          deletePackBtn.innerText = 'Deleting...'
          deletePackBtn.disabled = true
          await deletePack(packId)
          await loadCourses()
        } catch (err) {
          console.error(err)
          await fswAlert('Failed to delete pack.')
          deletePackBtn.innerText = 'Delete'
          deletePackBtn.disabled = false
        }
      }
      return
    }

    // 9. Click on Course Tile Background (Edit Course Details)
    const courseTile = e.target.closest('.course-tile-btn')
    if (courseTile) {
      const courseId = courseTile.dataset.id
      const course = localCourses.find(c => c.id === courseId)
      if (course) {
        renderCourseEditor(course, user)
      }
      return
    }
  })

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
      if (await fswConfirm('Are you sure you want to revoke this course assignment?')) {
        try {
          revokeBtn.innerText = 'Revoking...'
          revokeBtn.disabled = true
          await revokeAssignment(userId, courseId)
          loadTeamStats() // refresh ui
        } catch (error) {
          console.error(error)
          await fswAlert('Failed to revoke assignment.')
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
      if (await fswConfirm('Are you sure you want to force this user to resit the course? This will completely reset their progress and previous completion date.')) {
        try {
          resitBtn.innerText = 'Resetting...'
          resitBtn.disabled = true
          await forceResitCourse(userId, courseId)
          loadTeamStats() // refresh ui
        } catch (error) {
          console.error(error)
          await fswAlert('Failed to force resit.')
          resitBtn.innerText = 'Force Resit'
          resitBtn.disabled = false
        }
      }
    }

    // 4. Download Cert
    const certBtn = e.target.closest('.download-cert-btn')
    if (certBtn) {
      const { username, coursetitle, issuedate, expirydate, certid } = certBtn.dataset
      certBtn.innerText = 'Downloading...'
      try {
        await downloadCertificate(username, coursetitle, issuedate, expirydate !== 'null' ? expirydate : null, certid)
      } catch (err) {
        await fswAlert('Could not generate PDF')
      } finally {
        certBtn.innerText = 'Download Cert'
      }
    }

    // 6. Edit Department
    if (e.target.closest('.edit-dept-btn')) {
      const btn = e.target.closest('.edit-dept-btn');
      const userId = btn.dataset.userid;
      const currentDept = btn.dataset.dept || '';
      const newDept = await fswPrompt('Enter department name:', currentDept);
      if (newDept !== null) {
        try {
          btn.innerText = '...';
          await updateUserDepartment(userId, newDept);
          loadTeamStats();
        } catch (err) {
          await fswAlert('Failed to update department.');
          btn.innerText = currentDept || '+ Add Dept';
        }
      }
    }

    // 5. Send Nudge
    const nudgeBtn = e.target.closest('.nudge-user-btn')
    if (nudgeBtn) {
        const userId = nudgeBtn.dataset.userid
        if (await fswConfirm('Send a notification nudge to this user regarding their overdue/upcoming courses?')) {
            try {
                nudgeBtn.innerText = 'Sending...'
                nudgeBtn.disabled = true
                await sendNudge(userId, null, 'Please review your assigned courses. You have deadlines approaching or overdue.')
                await fswAlert('Nudge sent successfully!')
            } catch (err) {
                await fswAlert('Failed to send nudge.')
            } finally {
                nudgeBtn.innerText = 'Nudge'
                nudgeBtn.disabled = false
            }
        }
    }

    // 7. Archive User
    const archiveBtn = e.target.closest('.delete-user-btn')
    if (archiveBtn) {
      const userId = archiveBtn.dataset.userid
      if (await fswConfirm('Are you sure you want to archive this user? They will lose access to the platform and be removed from this view, but their historical data will be retained for CSV exports.')) {
        try {
          archiveBtn.innerText = 'Archiving...'
          archiveBtn.disabled = true
          await archiveUser(userId)
          await fswAlert('User archived successfully.')
          loadTeamStats() // refresh ui
        } catch (error) {
          console.error('Archive error details:', error)
          await fswAlert('Failed to archive user: ' + (error.message || JSON.stringify(error)))
          archiveBtn.innerText = 'Archive'
          archiveBtn.disabled = false
        }
      }
    }

    // 9. Revoke Pack Assignment
    const revokePackBtn = e.target.closest('.revoke-pack-assign-btn')
    if (revokePackBtn) {
      const assignId = revokePackBtn.dataset.assignid
      if (await fswConfirm('Are you sure you want to revoke this learning pack assignment?')) {
        try {
          revokePackBtn.innerText = 'Revoking...'
          revokePackBtn.disabled = true
          await revokePackAssignment(assignId)
          loadTeamStats() // refresh ui
        } catch (error) {
          console.error(error)
          await fswAlert('Failed to revoke learning pack assignment.')
          revokePackBtn.innerText = 'Revoke'
          revokePackBtn.disabled = false
        }
      }
    }
  })


  // Inbox Delegation Handler
  inboxList?.addEventListener('click', async (e) => {
      const approveBtn = e.target.closest('.approve-ext-btn');
      const denyBtn = e.target.closest('.deny-ext-btn');
      const auditContentBtn = e.target.closest('#inbox-audit-content-btn');

      if (auditContentBtn) {
          const tabGuidesBtn = document.getElementById('tab-guides');
          if (tabGuidesBtn) {
              tabGuidesBtn.click();
              // Allow time for guides tab to render, then open the manager panel and filter
              setTimeout(() => {
                  const manageBtn = document.getElementById('manage-content-btn');
                  if (manageBtn) {
                      manageBtn.click();
                      setTimeout(() => {
                          const statusFilter = document.getElementById('curation-status-filter');
                          if (statusFilter) {
                              statusFilter.value = 'overdue';
                              statusFilter.dispatchEvent(new Event('change'));
                          }
                      }, 150);
                  }
              }, 300);
          }
          return;
      }

      if (approveBtn || denyBtn) {
          const id = (approveBtn || denyBtn).dataset.id;
          const status = approveBtn ? 'approved' : 'denied';
          const newDate = approveBtn ? approveBtn.dataset.date : null;
          const reply = await fswPrompt('Optional reply to the user:', '');
          
          if (reply !== null) {
               try {
                  const btn = (approveBtn || denyBtn);
                  const origTxt = btn.innerText;
                  btn.innerText = 'Working...';
                  btn.disabled = true;
                  
                  await resolveExtension(id, status, newDate, reply);
                  loadTeamStats(); // Reload to remove from inbox and update metrics
               } catch (err) {
                  await fswAlert("Error resolving request.");
               }
          }
      }
  });

  function updateTopMetrics(statsList) {
      if (!teamMetrics) return;
      let totalAssigned = 0;
      let totalCompleted = 0;
      let totalOverdue = 0;

      statsList.forEach(member => {
          let memberAssigned = member.totalAssigned;
          let memberCompleted = member.completed;
          let memberOverdue = 0;
          if (member.progressData) {
              member.progressData.forEach(p => {
                  if (p.due_date && new Date(p.due_date) < new Date() && p.status !== 'completed') {
                      memberOverdue++;
                  }
              })
          }

          // Incorporate packs
          const memberPacks = currentPackAssignments.filter(pa => pa.user_id === member.id);
          memberPacks.forEach(pa => {
              memberAssigned++;
              if (pa.status === 'completed') {
                  memberCompleted++;
              }
              if (pa.due_date && new Date(pa.due_date) < new Date() && pa.status !== 'completed') {
                  memberOverdue++;
              }
          });

          totalAssigned += memberAssigned;
          totalCompleted += memberCompleted;
          totalOverdue += memberOverdue;
      });
      
      const overallCompletionPercent = totalAssigned > 0 
          ? Math.round((totalCompleted / totalAssigned) * 100) 
          : 0;

      const totalMembers = window.globalTotalActiveUsersCount || statsList.length;
      const maxUsers = currentPlatformSettings ? currentPlatformSettings.max_users : 10;
      const isAtCapacity = maxUsers > 0 && totalMembers >= maxUsers;
      const percentUsed = maxUsers <= 0 ? 0 : Math.min(100, Math.round((totalMembers / maxUsers) * 100));
      const membersColor = isAtCapacity ? '#ef4444' : 'white';

      const radius = 30;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (overallCompletionPercent / 100) * circumference;

      teamMetrics.innerHTML = `
          <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: space-between; border: 1px solid rgba(16, 185, 129, 0.3); box-shadow: inset 0 0 20px rgba(16, 185, 129, 0.05);">
            <div>
              <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Overall Completion</div>
              <div style="font-size: 2rem; font-weight: bold; color: #10b981; text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);">${overallCompletionPercent}%</div>
            </div>
            <div style="position: relative; width: 70px; height: 70px;">
              <svg width="70" height="70" style="transform: rotate(-90deg);">
                <circle cx="35" cy="35" r="${radius}" fill="transparent" stroke="rgba(255,255,255,0.1)" stroke-width="6" />
                <circle cx="35" cy="35" r="${radius}" fill="transparent" stroke="#10b981" stroke-width="6" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" style="transition: stroke-dashoffset 1s ease-out; filter: drop-shadow(0 0 4px rgba(16,185,129,0.8));" />
              </svg>
            </div>
          </div>

          <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); display: flex; align-items: center; gap: 1rem; border: 1px solid rgba(18, 142, 205, 0.3); box-shadow: inset 0 0 20px rgba(18, 142, 205, 0.05); position: relative; overflow: hidden;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(18, 142, 205, 0.1); display: flex; align-items: center; justify-content: center; z-index: 1;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#128ecd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 5px rgba(18,142,205,0.8));"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div style="flex: 1; z-index: 1;">
              <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0.5rem;">
                <div>
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.1rem; text-transform: uppercase;">Team Capacity</div>
                  <div style="font-size: 1.6rem; font-weight: bold; color: ${membersColor}; display: flex; align-items: baseline; gap: 0.4rem;">
                    ${totalMembers} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-muted);">${maxUsers <= 0 ? 'seats (Unlimited)' : `of ${maxUsers} seats`}</span>
                  </div>
                </div>
              </div>
              <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                <div style="height: 100%; width: ${percentUsed}%; background: ${isAtCapacity ? '#ef4444' : '#128ecd'}; border-radius: 3px; transition: width 0.5s ease-out;"></div>
              </div>
            </div>
          </div>
          
          <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); display: flex; align-items: center; gap: 1rem; border: 1px solid rgba(245, 158, 11, 0.3); box-shadow: inset 0 0 20px rgba(245, 158, 11, 0.05);">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(245, 158, 11, 0.1); display: flex; align-items: center; justify-content: center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 5px rgba(245,158,11,0.8));"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            </div>
            <div>
              <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform: uppercase;">Total Assigned</div>
              <div style="font-size: 1.8rem; font-weight: bold; color: white;">${totalAssigned}</div>
            </div>
          </div>

          <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); display: flex; align-items: center; gap: 1rem; border: 1px solid rgba(239, 68, 68, 0.3); box-shadow: inset 0 0 20px rgba(239, 68, 68, 0.05);">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); display: flex; align-items: center; justify-content: center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 5px rgba(239,68,68,0.8));"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <div>
              <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform: uppercase;">Total Overdue</div>
              <div style="font-size: 1.8rem; font-weight: bold; color: #ef4444; text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);">${totalOverdue}</div>
            </div>
          </div>
      `;
  }

  const applyTeamFilters = () => {
    const query = userSearch ? userSearch.value.toLowerCase() : ''
    const statusVal = userStatusFilter ? userStatusFilter.value : 'all'
    const deptVal = departmentFilter ? departmentFilter.value : 'all'

    const filteredStats = currentTeamStats.filter(s => {
      // 1. Text Search
      if (!s.email.toLowerCase().includes(query)) return false

      if (deptVal !== 'all' && s.department !== deptVal) return false

      // 2. Status Filter
      if (statusVal === 'overdue') {
        let hasOverdue = false
        // Check standalone courses
        if (s.progressData) {
          s.progressData.forEach(p => {
             if (p.due_date && new Date(p.due_date) < new Date() && p.status !== 'completed') hasOverdue = true
          })
        }
        // Check learning packs
        const memberPacks = currentPackAssignments.filter(pa => pa.user_id === s.id);
        memberPacks.forEach(pa => {
             if (pa.due_date && new Date(pa.due_date) < new Date() && pa.status !== 'completed') hasOverdue = true
        });

        if (!hasOverdue) return false
      } else if (statusVal === 'in-progress') {
        const memberPacks = currentPackAssignments.filter(pa => pa.user_id === s.id);
        const hasInProgressPack = memberPacks.some(pa => pa.status === 'in-progress');
        if (s.inProgress === 0 && !hasInProgressPack) return false
      }
      return true
    })

    renderTeamList(filteredStats)
    updateTopMetrics(filteredStats)
  }

  userSearch?.addEventListener('input', applyTeamFilters)
  userStatusFilter?.addEventListener('change', applyTeamFilters)
  departmentFilter?.addEventListener('change', applyTeamFilters)
  
  exportCsvBtn?.addEventListener('click', async () => {
     exportCsvBtn.innerText = 'Exporting...'
     await exportTeamDataCSV()
     exportCsvBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Export CSV'
  })

  // Tab switching logic
  const resetTabs = () => {
    [tabCourses, tabGuides, tabTeam, tabFeedback].forEach(t => {
      if(t) { t.className = 'btn-ghost'; t.style.border = '1px solid var(--glass-border)' }
    });
    [viewCourses, viewGuides, viewTeam, viewFeedback].forEach(v => {
      if(v) v.style.display = 'none'
    });
  }

  tabCourses?.addEventListener('click', () => {
    resetTabs()
    tabCourses.className = 'btn-primary'
    tabCourses.style.border = 'none'
    viewCourses.style.display = 'block'
  })

  tabGuides?.addEventListener('click', async () => {
    resetTabs()
    tabGuides.className = 'btn-primary'
    tabGuides.style.border = 'none'
    viewGuides.style.display = 'block'

    
    if (!viewGuides.dataset.loaded) {
       const { renderGuides, initGuidesEvents } = await import('./Guides.js')
       const { getGuideUsageStats } = await import('../api/guides.js')
       let guideStats = null;
       try { guideStats = await getGuideUsageStats(); } catch(e) {}
       viewGuides.innerHTML = renderGuides(user, guideStats)
       await initGuidesEvents(user)
       viewGuides.dataset.loaded = 'true'
    }
  })

  tabTeam?.addEventListener('click', () => {
    resetTabs()
    tabTeam.className = 'btn-primary'
    tabTeam.style.border = 'none'
    viewTeam.style.display = 'block'
    loadTeamStats()
  })

  tabFeedback?.addEventListener('click', () => {
    resetTabs()
    tabFeedback.className = 'btn-primary'
    tabFeedback.style.border = 'none'
    viewFeedback.style.display = 'block'
    loadFeedbackDashboard()
  })

  async function loadTeamStats() {
    if (!loadingTeam) return;
    loadingTeam.style.display = 'block'
    if (teamMetrics) teamMetrics.innerHTML = ''
    if (teamList) teamList.innerHTML = ''

    try {
      const { getTotalActiveUsersCount } = await import('../api/manager.js')
      // Use the analytics API to get the high-level rolled up stats AND the granular ones
      const [rates, pendingExtensions, platformSettings, totalActive, packAssignments, guides, courses] = await Promise.all([
         getTeamCompletionRates(),
         fetchPendingExtensions(),
         getPlatformSettings(),
         getTotalActiveUsersCount(),
         getPackAssignments(),
         fetchAllGuides(),
         getCourses('manager')
      ]);
      
      currentPackAssignments = packAssignments || [];

      
      window.globalTotalActiveUsersCount = totalActive;
      currentPlatformSettings = platformSettings;
      loadingTeam.style.display = 'none'

      if (!rates || !rates.memberStats || rates.memberStats.length === 0) {
        teamList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No users found in the system.</p>'
        return
      }

      currentTeamStats = rates.memberStats
      
      const totalMembers = rates.memberStats.length

      // Populate Department Filter
      if (departmentFilter) {
          const currentDeptVal = departmentFilter.value;
          const depts = new Set(rates.memberStats.map(s => s.department).filter(Boolean));
          departmentFilter.innerHTML = `<option value="all">All Departments</option>` + 
            Array.from(depts).map(d => `<option value="${d}">${d}</option>`).join('');
          
          if (depts.has(currentDeptVal)) departmentFilter.value = currentDeptVal;
      }

      // Render extensions & content review alerts in inbox
      const inboxCont = document.getElementById('manager-inbox-container');
      if (inboxCont && inboxList) {
          const now = new Date();
          let overdueCount = 0;
          if (guides && Array.isArray(guides)) {
              guides.forEach(g => {
                  if (g.next_review_date && new Date(g.next_review_date) < now) overdueCount++;
              });
          }
          if (courses && Array.isArray(courses)) {
              courses.forEach(c => {
                  if (c.next_review_date && new Date(c.next_review_date) < now) overdueCount++;
              });
          }

          const hasExtensions = pendingExtensions && pendingExtensions.length > 0;
          const hasOverdueContent = overdueCount > 0;

          if (hasExtensions || hasOverdueContent) {
              inboxCont.style.display = 'block';
              
              let html = '';
              if (hasOverdueContent) {
                  html += `
                  <div class="glass" style="padding: 1rem; border-radius: var(--radius-md); border-left: 4px solid #ef4444; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; box-sizing: border-box;">
                      <div>
                          <div style="font-weight: bold; color: #fca5a5; display: flex; align-items: center; gap: 0.4rem;">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"></path></svg>
                              Content Review Alert
                          </div>
                          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">${overdueCount} training item${overdueCount > 1 ? 's are' : ' is'} out of date and require${overdueCount === 1 ? 's' : ''} review.</div>
                      </div>
                      <button id="inbox-audit-content-btn" class="btn-primary" style="padding: 0.4rem 1rem; font-size: 0.8rem; background: #ef4444; border-color: #ef4444; cursor: pointer; color: white;">Audit Content</button>
                  </div>
                  `;
              }

              if (hasExtensions) {
                  html += pendingExtensions.map(ext => `
                      <div class="glass" style="padding: 1rem; border-radius: var(--radius-md); border-left: 4px solid #f59e0b; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; box-sizing: border-box;">
                          <div>
                              <div style="font-weight: bold;">${ext.user?.email || 'A user'} requested an extension</div>
                              <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">Course: ${ext.course_assignment?.course?.title} (Originally due: ${new Date(ext.course_assignment?.due_date).toLocaleDateString()})</div>
                              <div style="background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 4px; font-size: 0.9rem; font-style: italic;">"${ext.reason_text}"</div>
                              <div style="font-size: 0.85rem; margin-top: 0.5rem; color: #10b981;">Requested new date: ${new Date(ext.requested_date).toLocaleDateString()}</div>
                          </div>
                          <div style="display: flex; gap: 0.5rem; flex-direction: column;">
                              <button class="btn-primary approve-ext-btn" data-id="${ext.id}" data-date="${ext.requested_date}" style="padding: 0.4rem 1rem; font-size: 0.8rem;">Approve</button>
                              <button class="btn-ghost deny-ext-btn" data-id="${ext.id}" style="padding: 0.4rem 1rem; font-size: 0.8rem; color: #ef4444;">Deny</button>
                          </div>
                      </div>
                  `).join('');
              }

              inboxList.innerHTML = html;
          } else {
              inboxCont.style.display = 'none';
          }
      }

      // Show bulk assign if members exist
      const bulkAssignBtn = document.getElementById('bulk-assign-btn')
      if (bulkAssignBtn) bulkAssignBtn.style.display = totalMembers > 0 ? 'flex' : 'none'

      applyTeamFilters()

    } catch (error) {
      console.error('Error loading team stats:', error)
      loadingTeam.style.display = 'none'
      teamList.innerHTML = `<p style="color: red; text-align: center;">Failed to load team data:<br/><pre style="text-align:left; font-size: 10px; color: pink;">${error.stack || error.message || JSON.stringify(error)}</pre></p>`
    }
  }

  const escapeHTML = (str) => {
      if (!str) return '';
      return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
  };

  function renderTeamList(filteredStats) {
      if (!teamList) return

      if (filteredStats.length === 0) {
        teamList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem; background: rgba(0,0,0,0.2); border-radius: var(--radius-lg);">No members match the current filters.</p>'
        return
      }

      teamList.innerHTML = filteredStats.map((member) => {
        const memberPacks = currentPackAssignments.filter(pa => pa.user_id === member.id);
        
        let standaloneOverdue = 0;
        if (member.progressData) {
            member.progressData.forEach(p => {
                if (p.due_date && new Date(p.due_date) < new Date() && p.status !== 'completed') {
                    standaloneOverdue++;
                }
            })
        }

        let packsOverdue = 0;
        memberPacks.forEach(pa => {
            if (pa.due_date && new Date(pa.due_date) < new Date() && pa.status !== 'completed') {
                packsOverdue++;
            }
        });

        // Combined standalone courses + packs
        const totalAssignedCombined = member.totalAssigned + memberPacks.length;
        const totalCompletedCombined = member.completed + memberPacks.filter(pa => pa.status === 'completed').length;
        const totalInProgressCombined = member.inProgress + memberPacks.filter(pa => pa.status === 'in-progress').length;
        const totalOverdueCombined = standaloneOverdue + packsOverdue;

        const completionPct = totalAssignedCombined > 0 
            ? Math.round((totalCompletedCombined / totalAssignedCombined) * 100) 
            : 0;

        return `
        <div class="glass" style="padding: 1rem 1.25rem; border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: 0.75rem; border-left: 4px solid ${completionPct === 100 ? '#10b981' : (totalOverdueCombined > 0 ? '#ef4444' : 'var(--glass-border)')};">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div style="flex: 1; display: flex; gap: 0.75rem; align-items: center; min-width: 280px;">
              <div style="display: flex; align-items: center;">
                <input type="checkbox" class="user-select-cb" data-userid="${member.id}" ${selectedUserIds.has(member.id) ? 'checked' : ''} style="width: 1.2rem; height: 1.2rem; cursor: pointer; accent-color: var(--primary);">
              </div>
              <img src="${member.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.full_name || member.email) + '&background=random'}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid var(--glass-border);">
              <div style="flex: 1; min-width: 0;">
                <h4 style="margin: 0; display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; font-size: 1.05rem;">
                  <span>${escapeHTML(member.full_name || member.email)}</span>
                  ${member.full_name ? `<span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">(${escapeHTML(member.email)})</span>` : ''}
                </h4>
                
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.35rem;">
                  <span style="font-size: 0.7rem; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; text-transform: uppercase; color: var(--text-muted); font-weight: 500;">${escapeHTML(member.team_role) || 'member'}</span>
                  <button class="edit-dept-btn" data-userid="${member.id}" data-dept="${escapeHTML(member.department) || ''}" style="background: ${member.department ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)'}; border: 1px solid ${member.department ? '#10b981' : 'var(--glass-border)'}; color: ${member.department ? '#10b981' : 'var(--text-muted)'}; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; cursor: pointer; transition: all 0.2s;">
                    ${escapeHTML(member.department) || '+ Dept'}
                  </button>
                  <button class="btn-ghost delete-user-btn" data-userid="${member.id}" style="display: inline-flex; align-items: center; gap: 0.25rem; color: #f59e0b; font-size: 0.7rem; padding: 2px 6px; border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 4px; background: rgba(245, 158, 11, 0.05);" title="Archive this user">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 8v13H3V8"></path><polyline points="1 3 23 3 23 8 1 8 1 3"></polyline><path d="M10 12h4"></path></svg>
                    Archive
                  </button>
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 1.5rem; text-align: center; background: rgba(0,0,0,0.15); padding: 0.5rem 1rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.02);">
              <div>
                <div style="font-size: 1.15rem; font-weight: bold; color: var(--primary);">${totalAssignedCombined}</div>
                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Assigned</div>
              </div>
              <div>
                <div style="font-size: 1.15rem; font-weight: bold; color: #f59e0b;">${totalInProgressCombined}</div>
                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Progress</div>
              </div>
              <div>
                <div style="font-size: 1.15rem; font-weight: bold; color: #10b981;">${totalCompletedCombined}</div>
                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Done</div>
              </div>
              <div>
                <div style="font-size: 1.15rem; font-weight: bold; color: #ef4444;">${totalOverdueCombined}</div>
                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Overdue</div>
              </div>
            </div>
            
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button class="btn-ghost nudge-user-btn" data-userid="${member.id}" style="display: flex; align-items: center; gap: 0.35rem; color: #f59e0b; padding: 0.4rem 0.8rem; border: 1px solid rgba(245,158,11,0.2); border-radius: var(--radius-md); font-size: 0.8rem;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                Nudge
              </button>
              <button class="btn-secondary assign-user-btn" data-userid="${member.id}" data-email="${member.email}" style="display: flex; align-items: center; gap: 0.35rem; box-shadow: 0 4px 10px rgba(18,142,205,0.15); padding: 0.4rem 0.8rem; border-radius: var(--radius-md); font-size: 0.8rem; font-weight: 600;">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Assign Training
              </button>
            </div>
          </div>
          
          ${member.progressData && member.progressData.length > 0 ? `
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05);">
              <details>
                <summary style="font-size: 0.85rem; font-weight: bold; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; outline: none; user-select: none; cursor: pointer; padding: 0.5rem 1rem; border-radius: var(--radius-md); background: rgba(0,0,0,0.2); transition: background 0.2s;">
                  <span style="display: flex; align-items: center; gap: 0.5rem;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    Course History (${member.progressData.length})
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </summary>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; cursor: default;">
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
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1); padding: 0.6rem 1rem; border-radius: var(--radius-md); border-left: 3px solid ${isExpired || isOverdue ? '#ef4444' : (p.status === 'completed' ? '#10b981' : 'transparent')};">
                      <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="font-size: 0.9rem; font-weight: ${isExpired || isOverdue ? 'bold' : 'normal'}; color: ${isExpired || isOverdue ? '#ef4444' : 'white'};">${p.courses?.title || 'Unknown Course'}</span>
                        <span style="font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background: ${statusColor}; color: ${badgeColor}; font-weight: bold; letter-spacing: 0.5px;">${statusTxt}</span>
                        ${p.due_date && !isExpired && p.status !== 'completed' ? `<span style="font-size: 0.8rem; color: ${isOverdue ? '#ef4444' : 'var(--text-muted)'}; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Due: ${new Date(p.due_date).toLocaleDateString()}</span>` : ''}
                        ${p.expires_at && p.status === 'completed' && !isExpired ? `<span style="font-size: 0.8rem; color: var(--text-muted);">Valid til: ${new Date(p.expires_at).toLocaleDateString()}</span>` : ''}
                      </div>
                      <div style="display: flex; gap: 0.5rem; align-items: center;">
                        ${p.status === 'completed' && !isExpired && p.certificate_id ? `
                          <button class="btn-ghost download-cert-btn" data-username="${member.full_name || member.email}" data-coursetitle="${p.courses?.title}" data-issuedate="${p.completed_at}" data-expirydate="${p.expires_at || 'null'}" data-certid="${p.certificate_id}" style="color: #0ea5e9; font-size: 0.75rem; padding: 0.2rem 0.5rem; border: 1px solid rgba(14,165,233,0.3);">
                            Download Cert
                          </button>
                        ` : ''}
                        ${isExpired ? `
                          <button class="btn-secondary resit-user-btn" data-userid="${member.id}" data-courseid="${p.course_id}" style="font-size: 0.75rem; padding: 0.2rem 0.6rem; border-color: #ef4444; color: #ef4444;">Force Resit</button>
                        ` : `
                          <button class="btn-ghost revoke-user-btn" data-userid="${member.id}" data-courseid="${p.course_id}" style="color: var(--text-muted); font-size: 0.75rem; padding: 0.2rem 0.5rem;">Revoke</button>
                        `}
                      </div>
                    </div>
                  `}).join('')}
                </div>
              </details>
            </div>
          ` : ''}

          ${memberPacks && memberPacks.length > 0 ? `
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05);">
              <details>
                <summary style="font-size: 0.85rem; font-weight: bold; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; outline: none; user-select: none; cursor: pointer; padding: 0.5rem 1rem; border-radius: var(--radius-md); background: rgba(0,0,0,0.2); transition: background 0.2s;">
                  <span style="display: flex; align-items: center; gap: 0.5rem;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    Learning Packs (${memberPacks.length})
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </summary>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; cursor: default;">
                  ${memberPacks.map(pa => {
                    const isCompleted = pa.status === 'completed';
                    const isOverdue = pa.due_date && new Date(pa.due_date) < new Date() && !isCompleted;
                    let statusColor = isCompleted ? '#10b981' : (pa.status === 'in-progress' ? '#f59e0b' : 'rgba(255,255,255,0.1)');
                    let statusTxt = pa.status.toUpperCase();
                    let badgeColor = isCompleted || pa.status === 'in-progress' ? 'black' : 'white';

                    if (isOverdue) {
                      statusColor = '#ef4444';
                      statusTxt = 'OVERDUE';
                      badgeColor = 'white';
                    }

                    return `
                    <div style="display: flex; flex-direction: column; background: rgba(0,0,0,0.1); padding: 0.8rem 1rem; border-radius: var(--radius-md); border-left: 3px solid ${isOverdue ? '#ef4444' : (isCompleted ? '#10b981' : 'transparent')}; gap: 0.4rem;">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                          <span style="font-size: 0.9rem; font-weight: ${isOverdue ? 'bold' : 'normal'}; color: ${isOverdue ? '#ef4444' : 'white'};">${escapeHTML(pa.pack?.title || 'Unknown Pack')}</span>
                          <span style="font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background: ${statusColor}; color: ${badgeColor}; font-weight: bold; letter-spacing: 0.5px;">${statusTxt} (${pa.completionPct || 0}%)</span>
                          ${pa.due_date && !isCompleted ? `<span style="font-size: 0.8rem; color: ${isOverdue ? '#ef4444' : 'var(--text-muted)'}; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Due: ${new Date(pa.due_date).toLocaleDateString()}</span>` : ''}
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                          <button class="btn-ghost revoke-pack-assign-btn" data-assignid="${pa.id}" style="color: #ef4444; font-size: 0.75rem; padding: 0.2rem 0.5rem;">Revoke</button>
                        </div>
                      </div>

                      <!-- Progress Bar -->
                      <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden;">
                          <div style="height: 100%; width: ${pa.completionPct || 0}%; background: ${statusColor}; border-radius: 2px;"></div>
                        </div>
                        <span style="font-size: 0.7rem; color: var(--text-muted); min-width: 60px; text-align: right;">${pa.completedItems || 0}/${pa.totalItems || 0} tasks</span>
                      </div>

                      <!-- Mini Items List -->
                      <div style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem; padding-top: 0.25rem; border-top: 1px dashed rgba(255,255,255,0.05); font-size: 0.75rem;">
                        ${pa.items.map(item => {
                          const icon = item.item_type === 'course' ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px; opacity: 0.8;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>' : (item.item_type === 'guide' ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px; opacity: 0.8;"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path><path d="M13 13l6 6"></path></svg>' : (item.item_type === 'document' ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px; opacity: 0.8;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px; opacity: 0.8;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>'));
                          return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.15rem 0;">
                              <span style="color: rgba(255,255,255,0.6);">${icon} ${escapeHTML(item.title)}</span>
                              <span style="color: ${item.completed ? '#10b981' : 'var(--text-muted)'}; font-weight: 600;">${item.completed ? 'Completed' : 'Pending'}</span>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                    `;
                  }).join('')}
                </div>
              </details>
            </div>
          ` : ''}

        </div>
      `}).join('')
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
  let currentAssignType = 'course'
  let localLiveCourses = []
  let localCourses = []

  async function populateAssignSelect() {
    const selectLabel = document.getElementById('assign-select-label')
    const mandatoryContainer = document.getElementById('assign-mandatory-container')
    
    if (currentAssignType === 'course') {
      selectLabel.innerText = 'Select Course'
      if (mandatoryContainer) mandatoryContainer.style.display = 'flex'
      
      assignCourseSelect.innerHTML = '<option value="">-- Select --</option>' + localLiveCourses.map(c => {
        const prefix = c.content_json?.is_system_simulation ? '[Guide] ' : '[Course] '
        return `<option value="${c.id}">${prefix}${c.title}</option>`
      }).join('')
    } else {
      selectLabel.innerText = 'Select Learning Pack'
      if (mandatoryContainer) mandatoryContainer.style.display = 'none'
      
      assignCourseSelect.innerHTML = '<option value="">Loading packs...</option>'
      try {
        const packs = await getPacks()
        assignCourseSelect.innerHTML = '<option value="">-- Select --</option>' + packs.map(p => {
          return `<option value="${p.id}">[Pack] ${p.title}</option>`
        }).join('')
      } catch (err) {
        console.error(err)
        assignCourseSelect.innerHTML = '<option value="">Failed to load packs</option>'
      }
    }
  }

  const typeCourseBtn = document.getElementById('assign-type-course')
  const typePackBtn = document.getElementById('assign-type-pack')

  function setAssignType(type) {
    currentAssignType = type
    if (type === 'course') {
      if (typeCourseBtn) {
        typeCourseBtn.style.background = 'var(--primary)'
        typeCourseBtn.style.color = 'white'
      }
      if (typePackBtn) {
        typePackBtn.style.background = 'transparent'
        typePackBtn.style.color = 'var(--text-muted)'
      }
    } else {
      if (typePackBtn) {
        typePackBtn.style.background = 'var(--primary)'
        typePackBtn.style.color = 'white'
      }
      if (typeCourseBtn) {
        typeCourseBtn.style.background = 'transparent'
        typeCourseBtn.style.color = 'var(--text-muted)'
      }
    }
    populateAssignSelect()
  }

  typeCourseBtn?.addEventListener('click', () => setAssignType('course'))
  typePackBtn?.addEventListener('click', () => setAssignType('pack'))

  window.openAssignModal = (userId, email) => {
    currentAssignTarget = { type: 'user', id: userId }
    assignModalTitle.innerText = `Assign to ${email}`
    
    assignCourseSelect.value = ''
    assignDueDate.value = ''
    assignMandatory.checked = false
    
    setAssignType('course')
    
    assignModal.style.display = 'block'
    overlay.style.display = 'block'
  }

  const assignDepartmentContainer = document.getElementById('assign-department-container')
  const assignDepartmentSelect = document.getElementById('assign-department-select')

  const openBulkAssignModal = () => {
    assignDepartmentContainer.style.display = 'none'
    if (selectedUserIds.size > 0) {
      currentAssignTarget = { type: 'selected', ids: Array.from(selectedUserIds) }
      assignModalTitle.innerText = `Assign to ${selectedUserIds.size} Selected Users`
    } else {
      currentAssignTarget = { type: 'bulk' }
      assignModalTitle.innerText = `Bulk Assign to Team`
      assignDepartmentContainer.style.display = 'block'
      
      const depts = new Set(currentTeamStats.map(s => s.department).filter(Boolean));
      assignDepartmentSelect.innerHTML = `<option value="all">Entire Team</option>` + 
          Array.from(depts).map(d => `<option value="${d}">${d}</option>`).join('');
      const currentDeptFilter = document.getElementById('department-filter')?.value;
      if (currentDeptFilter && currentDeptFilter !== 'all') {
         assignDepartmentSelect.value = currentDeptFilter;
      }
    }
    
    assignCourseSelect.value = ''
    assignDueDate.value = ''
    assignMandatory.checked = false
    
    setAssignType('course')
    
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
    const itemId = assignCourseSelect.value
    if (!itemId) {
      return await fswAlert(`Please select a ${currentAssignType === 'course' ? 'course' : 'learning pack'}.`)
    }
    
    const dueDate = assignDueDate.value || null
    const isMandatory = assignMandatory.checked

    try {
      confirmAssignBtn.innerText = 'Assigning...'
      confirmAssignBtn.disabled = true
      
      if (currentAssignType === 'course') {
        if (currentAssignTarget.type === 'bulk') {
          const selectedDept = assignDepartmentSelect.value;
          let targetIds = null;
          if (selectedDept !== 'all') {
              targetIds = currentTeamStats.filter(s => s.department === selectedDept).map(s => s.id);
          }
          await bulkAssignCourse(itemId, dueDate, isMandatory, targetIds)
        } else if (currentAssignTarget.type === 'selected') {
          await bulkAssignCourse(itemId, dueDate, isMandatory, currentAssignTarget.ids)
          selectedUserIds.clear() // Clear selection on successful assignment
          updateBulkAssignBtnState()
        } else {
          await assignCourseToUser(currentAssignTarget.id, itemId, dueDate, isMandatory)
        }
      } else {
        // Learning Pack Assignment
        let targetUserIds = [];
        if (currentAssignTarget.type === 'bulk') {
          const selectedDept = assignDepartmentSelect.value;
          if (selectedDept !== 'all') {
            targetUserIds = currentTeamStats.filter(s => s.department === selectedDept).map(s => s.id);
          } else {
            targetUserIds = currentTeamStats.map(s => s.id);
          }
        } else if (currentAssignTarget.type === 'selected') {
          targetUserIds = currentAssignTarget.ids;
          selectedUserIds.clear();
          updateBulkAssignBtnState();
        } else {
          targetUserIds = [currentAssignTarget.id];
        }
        
        await bulkAssignPack({ packId: itemId, userIds: targetUserIds, dueDate });
      }
      
      closeAssignModal()
      loadTeamStats()
      await fswAlert('Assignment successful!')
    } catch (e) {
      console.error(e)
      await fswAlert('Failed to assign:\n' + (e.message || JSON.stringify(e)))
    } finally {
      confirmAssignBtn.innerText = 'Assign'
      confirmAssignBtn.disabled = false
    }
  })

  // ==== END ASSIGN LOGIC ====

  // Load initial courses
  loadCourses()

  async function loadCourses() {
    courseList.innerHTML = '<p>Loading courses and packs...</p>'
    try {
      const courses = await getCourses('manager')
      let courseStats = null;
      try { courseStats = await getCourseUsageStats(); } catch(e) { console.error('Failed to load course stats', e); }
      
      const packs = await getPacks()
      
      localCourses = courses
      await renderCourses(courses, packs, courseStats)
      
      // Populate Assign Course Dropdown (Only Live courses!)
      const liveCourses = courses.filter(c => c.status === 'live')
      localLiveCourses = liveCourses
      const assignSelect = document.getElementById('assign-course-select')
      if (assignSelect) {
        assignSelect.innerHTML = '<option value="">-- Select --</option>' + liveCourses.map(c => {
          const prefix = c.content_json?.is_system_simulation ? '[Guide] ' : '[Course] '
          return `<option value="${c.id}">${prefix}${c.title}</option>`
        }).join('')
      }
      
    } catch (error) {
      console.error(error)
      courseList.innerHTML = '<p style="color: red">Failed to load courses</p>'
    }
  }

  function getPackIcon(title) {
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
  }

  async function renderCourses(courses, packs, stats) {
    let statsHtml = '<p style="margin: 0.5rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">AI Powered</p>';
    if (stats) {
        const renewalDateStr = stats.renewalDate ? stats.renewalDate.toLocaleDateString() : 'N/A';
        const totalText = stats.total <= 0 ? 'Unlimited' : stats.total;
        statsHtml += `<p style="margin: 0.5rem 0 0 0; color: var(--primary); font-size: 0.8rem; font-weight: bold;">${stats.used} / ${totalText} Used</p>`;
        statsHtml += `<p style="margin: 0; color: var(--text-muted); font-size: 0.7rem;">Renews: ${renewalDateStr}</p>`;
    }

    const createCourseCardHTML = `
      <div id="create-course-card" class="glass card-hover" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 380px; cursor: pointer; border: 2px dashed var(--glass-border); background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-lg); height: 100%; padding: 1.5rem; box-sizing: border-box;">
        <div style="width: 60px; height: 60px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; margin-bottom: 1rem; box-shadow: 0 0 20px rgba(18, 142, 205, 0.4);">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <h3 style="margin: 0; color: white;">Create Course</h3>
        ${statsHtml}
      </div>
    `

    const createPackCardHTML = `
      <div id="create-pack-card" class="glass card-hover" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 380px; cursor: pointer; border: 2px dashed var(--glass-border); background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-lg); height: 100%; padding: 1.5rem; box-sizing: border-box;">
        <div style="width: 60px; height: 60px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; margin-bottom: 1rem; box-shadow: 0 0 20px rgba(18, 142, 205, 0.4);">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <h3 style="margin: 0; color: white;">Create Learning Pack</h3>
        <p style="margin: 0.5rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">Group Materials</p>
      </div>
    `

    const displayCourses = courses.filter(c => {
        let content = c.content_json;
        if (typeof content === 'string') {
            try { content = JSON.parse(content); } catch (e) {}
        }
        return content ? (!content.is_system_simulation && content.type !== 'video_walkthrough') : true;
    })

    const courseCardsHTML = displayCourses.map((course) => `
      <div class="glass card-hover course-tile-btn" data-id="${course.id}" style="padding: 0; overflow: hidden; border-radius: var(--radius-lg); display: flex; flex-direction: column; min-height: 380px; height: 100%; cursor: pointer; box-sizing: border-box;">
        <div style="height: 160px; background: #2a2a35; position: relative;">
          ${course.thumbnail_url
            ? `<img src="${course.thumbnail_url}" onerror="this.onerror=null; this.src='https://placehold.co/800x600/128ecd/ffffff?text=Course+Image'; console.warn('Thumbnail failed to load, falling back for:', '${course.title}');" style="width: 100%; height: 100%; object-fit: cover;">`
            : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(45deg, var(--primary), var(--aurora-2));">FSW</div>`
          }
          <div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: ${course.status === 'live' ? '#10b981' : '#f59e0b'}; color: black;">
            ${course.status.toUpperCase()}
          </div>
          ${course.content_json?.is_system_simulation ? `
            <div style="position: absolute; top: 10px; left: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: rgba(0,0,0,0.8); color: white; border: 1px solid #f59e0b;">
              SIMULATOR
            </div>
          ` : ''}
        </div>
        <div style="padding: 1.5rem; flex: 1; display: flex; flex-direction: column;">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 1.1rem; color: white;">${course.title}</h4>
          <p style="margin: 0 0 1rem 0; font-size: 0.9rem; color: var(--text-muted); flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${course.description || 'No description'}</p>
          <div style="display: flex; gap: 0.5rem; margin-top: auto;">
            <button class="btn-secondary view-course-btn" data-id="${course.id}" style="flex: 1;">View</button>
            <button class="btn-secondary edit-course-btn" data-id="${course.id}" style="flex: 1;" ${course.content_json?.is_system_simulation ? 'disabled title="Simulators cannot be edited yet"' : ''}>Edit</button>
            <button class="btn-danger delete-course-btn" data-id="${course.id}" data-title="${escapeHTML(course.title)}">Delete</button>
          </div>
        </div>
      </div>
    `).join('')

    const packCardsHtml = await Promise.all(packs.map(async (pack) => {
      let items = []
      try {
        const res = await getPack(pack.id)
        items = res.items || []
      } catch (err) {
        console.error(err)
      }

      const coursesCount = items.filter(i => i.item_type === 'course').length
      const guidesCount = items.filter(i => i.item_type === 'guide').length
      const docsCount = items.filter(i => i.item_type === 'document').length
      const linksCount = items.filter(i => i.item_type === 'link').length

      const summaryParts = []
      if (coursesCount > 0) summaryParts.push(`${coursesCount} Course${coursesCount > 1 ? 's' : ''}`)
      if (guidesCount > 0) summaryParts.push(`${guidesCount} Guide${guidesCount > 1 ? 's' : ''}`)
      if (docsCount > 0) summaryParts.push(`${docsCount} Document${docsCount > 1 ? 's' : ''}`)
      if (linksCount > 0) summaryParts.push(`${linksCount} Link${linksCount > 1 ? 's' : ''}`)

      const summaryText = summaryParts.length > 0 ? summaryParts.join(', ') : 'No items added'

      return `
        <div class="glass card-hover" style="padding: 0; overflow: hidden; border-radius: var(--radius-lg); display: flex; flex-direction: column; min-height: 380px; height: 100%; box-sizing: border-box;">
          <div style="height: 160px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(18, 142, 205, 0.1) 100%); display: flex; align-items: center; justify-content: center; position: relative; border-bottom: 1px solid rgba(255,255,255,0.05);">
            ${getPackIcon(pack.title)}
            <div style="position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; background: #10b981; color: black; text-transform: uppercase; letter-spacing: 0.5px;">
              Pack
            </div>
          </div>
          
          <div style="padding: 1.5rem; flex: 1; display: flex; flex-direction: column;">
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1.25rem; color: white;">${escapeHTML(pack.title)}</h3>
            <p style="margin: 0 0 1rem 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; flex: 1;">${escapeHTML(pack.description || 'No description')}</p>
            <div style="font-size: 0.8rem; color: var(--primary); font-weight: 500; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.35rem;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
              <span>${summaryText}</span>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: auto; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05);">
              <button class="btn-secondary view-pack-progress-btn" data-id="${pack.id}" data-title="${escapeHTML(pack.title)}" style="flex: 1;">View</button>
              <button class="btn-secondary edit-pack-btn" data-id="${pack.id}" style="flex: 1;">Edit</button>
              <button class="btn-danger delete-pack-btn" data-id="${pack.id}">Delete</button>
            </div>
          </div>
        </div>
      `
    }))

    courseList.innerHTML = createCourseCardHTML + courseCardsHTML
    if (packList) {
      packList.innerHTML = createPackCardHTML + packCardsHtml.join('')
    }
  }

  // File Upload Handlers
  uploadBtn?.addEventListener('click', () => fileInput.click())

  fileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) {
      fileCount.innerText = 'No files selected'
      fileList.innerHTML = ''
      return
    }

    const allowedExtensions = ['.pdf', '.txt', '.md'];
    const invalidFiles = files.filter(f => {
      const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
      return !allowedExtensions.includes(ext);
    });

    if (invalidFiles.length > 0) {
      await fswAlert(`Unsupported file format detected: ${invalidFiles.map(f => f.name).join(', ')}.\n\nOnly PDF (.pdf), Text (.txt), and Markdown (.md) files are supported. If you have a Word Document (.docx), please save it as a PDF first, then upload it!`);
      fileInput.value = ''; // Reset
      fileCount.innerText = 'No files selected';
      fileList.innerHTML = '';
      return;
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
    if (!show) {
      if (promptInput) promptInput.value = ''
      const fields = ['course-title', 'course-objective', 'course-audience', 'course-topics', 'course-scenarios']
      fields.forEach(id => {
        const el = document.getElementById(id)
        if (el) el.value = ''
      })
      const pretestEl = document.getElementById('course-allow-pretest')
      if (pretestEl) pretestEl.checked = false
    }
  }

  cancelBtn?.addEventListener('click', () => toggleModal(false))
  overlay?.addEventListener('click', () => toggleModal(false))

  confirmBtn?.addEventListener('click', async () => {
    const title = document.getElementById('course-title')?.value.trim() || ''
    const objective = document.getElementById('course-objective')?.value.trim() || ''
    const audience = document.getElementById('course-audience')?.value.trim() || ''
    const topics = document.getElementById('course-topics')?.value.trim() || ''
    const scenarios = document.getElementById('course-scenarios')?.value.trim() || ''

    if (!title) {
        await fswAlert("Please enter a Course Title.")
        return
    }
    if (!objective && (!fileInput || fileInput.files.length === 0)) {
        await fswAlert("Please provide either a Course Objective or attach supporting documents so the AI knows what to cover.")
        return
    }

    let description = `Title: ${title}\nObjective: ${objective}`
    if (audience) description += `\nTarget Audience: ${audience}`
    if (topics) description += `\nMandatory Topics: ${topics}`
    if (scenarios) description += `\nScenarios/Activities: ${scenarios}`

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
      const allowPretest = document.getElementById('course-allow-pretest')?.checked || false;
      const course = await createCourse({
        title: aiData.title,
        description: aiData.description,
        content_json: aiData.modules,
        thumbnail_url: aiData.thumbnail_url, // Strict usage of AI thumbnail
        allow_pretest: allowPretest,
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
        await fswAlert('Course successfully generated! It is now in Draft mode.')
      }, 1500)

    } catch (error) {
      console.error('Course Generation Failed:', error)
      if (logContainer) {
        logContainer.innerHTML += `<div style="color: #ef4444; margin-top: 1rem; border-top: 1px solid #ef4444; padding-top: 0.5rem;">CRITICAL FAILURE: ${error.message}</div>`
      }
      await fswAlert(`Generation Failed:\n${error.message}\n\nCheck the log for details.`)
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
          console.error(e)
          await fswAlert('Failed to export CSV')
          exportCsvBtn.innerText = 'Export CSV'
          exportCsvBtn.disabled = false
      }
  })

  async function openPackBuilder(packId = null) {
    const originalCoursesHtml = viewCourses.innerHTML
    
    viewCourses.innerHTML = `
      <div class="glass fade-in" style="padding: 2rem; border-radius: var(--radius-lg); max-width: 900px; margin: 0 auto; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
        <h3 style="margin-top: 0; font-size: 1.5rem; color: white;" id="pack-builder-title">${packId ? 'Edit Learning Pack' : 'Create New Learning Pack'}</h3>
        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Group courses, software guides, documents, and web links into a structured journey.</p>
        
        <div style="display: flex; flex-direction: column; gap: 1.5rem; margin-bottom: 2rem;">
          <div>
            <label style="display: block; font-weight: bold; margin-bottom: 0.5rem; color: white;">Pack Title *</label>
            <input type="text" id="builder-pack-title" placeholder="e.g. New Joiner Onboarding" style="box-sizing: border-box; width: 100%; padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.4); color: white; font-size: 0.95rem;" />
          </div>
          <div>
            <label style="display: block; font-weight: bold; margin-bottom: 0.5rem; color: white;">Description</label>
            <textarea id="builder-pack-desc" rows="3" placeholder="e.g. Welcome to the team! Complete these materials in order during your first week." style="box-sizing: border-box; width: 100%; padding: 0.75rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.4); color: white; font-size: 0.95rem; resize: vertical;"></textarea>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; min-height: 400px;">
          <!-- Left Column: Available Materials -->
          <div style="display: flex; flex-direction: column; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 1rem; overflow: hidden; max-height: 500px;">
            <h4 style="margin: 0 0 1rem 0; color: white;">1. Add Learning Materials</h4>
            
            <div style="display: flex; gap: 0.5rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem; margin-bottom: 1rem;">
              <button id="btn-avail-courses" class="btn-primary" style="font-size: 0.75rem; padding: 4px 8px; flex: 1;">Courses</button>
              <button id="btn-avail-guides" class="btn-ghost" style="font-size: 0.75rem; padding: 4px 8px; flex: 1; border: 1px solid var(--glass-border);">Guides</button>
              <button id="btn-avail-docs" class="btn-ghost" style="font-size: 0.75rem; padding: 4px 8px; flex: 1; border: 1px solid var(--glass-border);">Docs</button>
              <button id="btn-avail-links" class="btn-ghost" style="font-size: 0.75rem; padding: 4px 8px; flex: 1; border: 1px solid var(--glass-border);">Links</button>
            </div>

            <div id="avail-items-list" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 0.5rem;">
              <!-- Available items list -->
            </div>
          </div>

          <!-- Right Column: Selected Pack Items -->
          <div style="display: flex; flex-direction: column; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 1rem; overflow: hidden; max-height: 500px;">
            <h4 style="margin: 0 0 1rem 0; color: white;">2. Pack Structure & Order</h4>
            
            <div id="selected-items-list" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 0.5rem; border: 1px dashed var(--glass-border); border-radius: var(--radius-sm); padding: 0.5rem;">
              <div style="text-align: center; color: var(--text-muted); font-style: italic; padding: 2rem;" id="no-selected-placeholder">No items added to this pack yet. Select items from the left.</div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: flex-end; border-top: 1px solid var(--glass-border); padding-top: 1.5rem;">
          <button id="cancel-pack-builder" class="btn-ghost" style="border: 1px solid var(--glass-border);">Cancel</button>
          <button id="save-pack-btn" class="btn-primary">Save Learning Pack</button>
        </div>
      </div>
    `

    // State for selected items
    let selectedItems = []

    // Fetch resources
    let allCourses = []
    let allGuides = []
    let allDocs = []
    let allLinks = []

    try {
      const allCoursesRaw = await getCourses('manager')
      
      allCourses = allCoursesRaw.filter(c => 
        c.content_json?.is_system_simulation !== true && c.content_json?.type !== 'video_walkthrough'
      )
      
      allGuides = allCoursesRaw.filter(c => 
        c.content_json?.is_system_simulation === true || c.content_json?.type === 'video_walkthrough'
      )

      const allGuidesRaw = await fetchAllGuides()
      allDocs = allGuidesRaw.filter(d => d.description !== 'Web Resource' && d.description !== 'YouTube Video')
      allLinks = allGuidesRaw.filter(d => d.description === 'Web Resource' || d.description === 'YouTube Video')

      if (packId) {
        const packDetails = await getPack(packId)
        document.getElementById('builder-pack-title').value = packDetails.title
        document.getElementById('builder-pack-desc').value = packDetails.description || ''
        
        for (const item of packDetails.items) {
          let title = ''
          if (item.item_type === 'course' || item.item_type === 'guide') {
            const courseObj = allCoursesRaw.find(c => c.id === item.item_id)
            title = courseObj ? courseObj.title : 'Deleted Course'
          } else {
            const docObj = allGuidesRaw.find(d => d.id === item.item_id)
            title = docObj ? docObj.title : 'Deleted Document'
          }

          selectedItems.push({
            item_type: item.item_type,
            item_id: item.item_id,
            title
          })
        }
        renderSelectedItems()
      }

    } catch (e) {
      console.error(e)
      await fswAlert('Failed to load builder resources.')
      cancelBuilder()
      return
    }

    let activeAvailTab = 'courses'
    
    const tabCoursesBtn = document.getElementById('btn-avail-courses')
    const tabGuidesBtn = document.getElementById('btn-avail-guides')
    const tabDocsBtn = document.getElementById('btn-avail-docs')
    const tabLinksBtn = document.getElementById('btn-avail-links')

    const switchAvailTab = (tab) => {
      activeAvailTab = tab
      const btns = [tabCoursesBtn, tabGuidesBtn, tabDocsBtn, tabLinksBtn]
      btns.forEach(btn => {
        if (btn) {
          btn.className = 'btn-ghost'
          btn.style.border = '1px solid var(--glass-border)'
        }
      })

      if (tab === 'courses' && tabCoursesBtn) { tabCoursesBtn.className = 'btn-primary'; tabCoursesBtn.style.border = 'none' }
      if (tab === 'guides' && tabGuidesBtn) { tabGuidesBtn.className = 'btn-primary'; tabGuidesBtn.style.border = 'none' }
      if (tab === 'docs' && tabDocsBtn) { tabDocsBtn.className = 'btn-primary'; tabDocsBtn.style.border = 'none' }
      if (tab === 'links' && tabLinksBtn) { tabLinksBtn.className = 'btn-primary'; tabLinksBtn.style.border = 'none' }

      renderAvailItems()
    }

    tabCoursesBtn?.addEventListener('click', () => switchAvailTab('courses'))
    tabGuidesBtn?.addEventListener('click', () => switchAvailTab('guides'))
    tabDocsBtn?.addEventListener('click', () => switchAvailTab('docs'))
    tabLinksBtn?.addEventListener('click', () => switchAvailTab('links'))

    function renderAvailItems() {
      const list = document.getElementById('avail-items-list')
      if (!list) return
      
      let itemsToRender = []
      if (activeAvailTab === 'courses') itemsToRender = allCourses.map(i => ({ id: i.id, title: i.title, type: 'course' }))
      if (activeAvailTab === 'guides') itemsToRender = allGuides.map(i => ({ id: i.id, title: i.title, type: 'guide' }))
      if (activeAvailTab === 'docs') itemsToRender = allDocs.map(i => ({ id: i.id, title: i.title, type: 'document' }))
      if (activeAvailTab === 'links') itemsToRender = allLinks.map(i => ({ id: i.id, title: i.title, type: 'link' }))

      if (itemsToRender.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 2rem;">No items available.</div>`
        return
      }

      list.innerHTML = itemsToRender.map(item => {
        const isSelected = selectedItems.some(si => si.item_id === item.id)
        
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem;">
            <span style="color: rgba(255,255,255,0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</span>
            <button class="btn-primary add-to-pack-btn" data-id="${item.id}" data-title="${escapeHTML(item.title)}" data-type="${item.type}" style="padding: 2px 8px; font-size: 0.75rem;" ${isSelected ? 'disabled' : ''}>
              ${isSelected ? 'Added' : '+ Add'}
            </button>
          </div>
        `
      }).join('')
    }

    document.getElementById('avail-items-list')?.addEventListener('click', (e) => {
      const addBtn = e.target.closest('.add-to-pack-btn')
      if (addBtn) {
        const id = addBtn.dataset.id
        const title = addBtn.dataset.title
        const type = addBtn.dataset.type
        
        selectedItems.push({
          item_type: type,
          item_id: id,
          title
        })

        renderSelectedItems()
        renderAvailItems()
      }
    })

    function renderSelectedItems() {
      const list = document.getElementById('selected-items-list')
      if (!list) return

      if (selectedItems.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-style: italic; padding: 2rem;" id="no-selected-placeholder">No items added to this pack yet. Select items from the left.</div>`
        return
      }

      list.innerHTML = selectedItems.map((item, index) => {
        const typeIcon = item.item_type === 'course' 
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>'
          : (item.item_type === 'guide' 
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8;"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path><path d="M13 13l6 6"></path></svg>'
            : (item.item_type === 'document' 
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>'))
        const typeName = item.item_type.toUpperCase()
        
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem; background: rgba(255,255,255,0.05); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem; width: 65%;">
              <span style="display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; color: var(--primary);">${typeIcon}</span>
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; flex-direction: column;">
                <span style="font-weight: 500; color: white;">${escapeHTML(item.title)}</span>
                <span style="font-size: 0.65rem; color: var(--text-muted);">${typeName}</span>
              </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 0.25rem;">
              <button class="btn-ghost move-item-up" data-index="${index}" style="padding: 2px 6px; font-size: 0.8rem; border: none; color: white;" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''}>▲</button>
              <button class="btn-ghost move-item-down" data-index="${index}" style="padding: 2px 6px; font-size: 0.8rem; border: none; color: white;" ${index === selectedItems.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>▼</button>
              <button class="btn-ghost remove-selected-item" data-index="${index}" style="padding: 2px 6px; font-size: 0.8rem; border: none; color: #ef4444; margin-left: 0.5rem;">✕</button>
            </div>
          </div>
        `
      }).join('')
    }

    document.getElementById('selected-items-list')?.addEventListener('click', (e) => {
      const upBtn = e.target.closest('.move-item-up')
      if (upBtn) {
        const idx = parseInt(upBtn.dataset.index)
        if (idx > 0) {
          const temp = selectedItems[idx]
          selectedItems[idx] = selectedItems[idx - 1]
          selectedItems[idx - 1] = temp
          renderSelectedItems()
          renderAvailItems()
        }
      }

      const downBtn = e.target.closest('.move-item-down')
      if (downBtn) {
        const idx = parseInt(downBtn.dataset.index)
        if (idx < selectedItems.length - 1) {
          const temp = selectedItems[idx]
          selectedItems[idx] = selectedItems[idx + 1]
          selectedItems[idx + 1] = temp
          renderSelectedItems()
          renderAvailItems()
        }
      }

      const removeBtn = e.target.closest('.remove-selected-item')
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.index)
        selectedItems.splice(idx, 1)
        renderSelectedItems()
        renderAvailItems()
      }
    })

    function cancelBuilder() {
      viewCourses.innerHTML = originalCoursesHtml
      loadCourses()
    }

    document.getElementById('cancel-pack-builder')?.addEventListener('click', () => {
      cancelBuilder()
    })

    document.getElementById('save-pack-btn')?.addEventListener('click', async () => {
      const title = document.getElementById('builder-pack-title').value.trim()
      const description = document.getElementById('builder-pack-desc').value.trim()

      if (!title) {
        await fswAlert('Please enter a pack title.')
        return
      }

      if (selectedItems.length === 0) {
        await fswAlert('Please add at least one item to the pack.')
        return
      }

      try {
        const saveBtn = document.getElementById('save-pack-btn')
        saveBtn.innerText = 'Saving...'
        saveBtn.disabled = true

        if (packId) {
          await updatePack(packId, { title, description, items: selectedItems })
        } else {
          await createPack({ title, description, items: selectedItems })
        }

        cancelBuilder()
      } catch (err) {
        console.error(err)
        await fswAlert('Failed to save learning pack.')
        const saveBtn = document.getElementById('save-pack-btn')
        saveBtn.innerText = 'Save Learning Pack'
        saveBtn.disabled = false
      }
    })

    switchAvailTab('courses')
  }



  function openPackProgressModal(packId, packTitle) {
    const modalDiv = document.createElement('div')
    modalDiv.id = 'pack-progress-modal'
    modalDiv.className = 'glass'
    modalDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 2rem; border-radius: var(--radius-lg); z-index: 9999; width: 550px; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.5); border: 1px solid var(--glass-border);'
    
    const overlay = document.createElement('div')
    overlay.id = 'pack-progress-overlay'
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9998; backdrop-filter: blur(5px);'
    
    document.body.appendChild(overlay)
    document.body.appendChild(modalDiv)

    function closeModal() {
      modalDiv.remove()
      overlay.remove()
    }

    async function loadProgressList() {
      modalDiv.innerHTML = `<h3 style="margin-top: 0; color: white;">Pack Progress</h3><p style="color: var(--primary);">Loading statistics...</p>`
      try {
        const stats = await getPackCompletionStats(packId)
        
        modalDiv.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="margin: 0; color: white;">Progress: ${escapeHTML(packTitle)}</h3>
            <button id="close-pack-progress" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">&times;</button>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;" id="progress-stats-container">
            ${stats.length === 0 ? `
              <div style="text-align: center; color: var(--text-muted); font-style: italic; padding: 2rem;">No assignments created for this pack yet.</div>
            ` : stats.map(st => {
              const userDisplay = st.user ? (st.user.full_name || st.user.email) : 'Unknown User'
              const isCompleted = st.status === 'completed'
              const isOverdue = st.due_date && new Date(st.due_date) < new Date() && !isCompleted
              
              return `
                <div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
                  <div style="flex: 1;">
                    <div style="font-weight: bold; color: white; font-size: 0.95rem;">${escapeHTML(userDisplay)}</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                      <span style="font-size: 0.75rem; color: ${isCompleted ? '#10b981' : (isOverdue ? '#ef4444' : '#f59e0b')}; font-weight: bold; text-transform: uppercase;">
                        ${isCompleted ? 'Completed' : (isOverdue ? 'Overdue' : 'In Progress')}
                      </span>
                      ${st.due_date ? `<span style="font-size: 0.75rem; color: var(--text-muted);">Due: ${new Date(st.due_date).toLocaleDateString()}</span>` : ''}
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; width: 90%;">
                      <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: ${st.completionPct}%; background: ${isCompleted ? '#10b981' : (isOverdue ? '#ef4444' : '#f59e0b')}; border-radius: 3px;"></div>
                      </div>
                      <span style="font-size: 0.8rem; font-weight: bold; color: white;">${st.completionPct}%</span>
                    </div>
                  </div>
                  
                  <div>
                    <button class="btn-ghost revoke-pack-assign-btn" data-assignid="${st.id}" style="border: 1px solid var(--glass-border); color: #ef4444; font-size: 0.75rem; padding: 4px 8px;">Revoke</button>
                  </div>
                </div>
              `
            }).join('')}
          </div>
          
          <div style="display: flex; justify-content: flex-end;">
            <button id="close-pack-progress-btn" class="btn-primary">Close</button>
          </div>
        `

        document.getElementById('close-pack-progress').addEventListener('click', closeModal)
        document.getElementById('close-pack-progress-btn').addEventListener('click', closeModal)
        
        document.getElementById('progress-stats-container').addEventListener('click', async (e) => {
          const revokeBtn = e.target.closest('.revoke-pack-assign-btn')
          if (revokeBtn) {
            const assignId = revokeBtn.dataset.assignid
            if (await fswConfirm('Are you sure you want to revoke this pack assignment? This will stop tracking progress, but individual courses will remain in the users course list.')) {
              try {
                revokeBtn.innerText = 'Revoking...'
                revokeBtn.disabled = true
                await revokePackAssignment(assignId)
                loadProgressList()
              } catch (err) {
                console.error(err)
                await fswAlert('Failed to revoke assignment.')
                revokeBtn.innerText = 'Revoke'
                revokeBtn.disabled = false
              }
            }
          }
        })

      } catch (e) {
        console.error(e)
        modalDiv.innerHTML = `<h3 style="color: red;">Error</h3><p>${e.message}</p><button id="err-close" class="btn-primary">Close</button>`
        document.getElementById('err-close').addEventListener('click', closeModal)
      }
    }

    loadProgressList()
  }

  async function loadFeedbackDashboard() {

      const feedbackMetrics = document.getElementById('feedback-metrics');
      const feedbackList = document.getElementById('view-feedback-list');
      const loadingFeedback = document.getElementById('loading-feedback-stats');
      
      if (!feedbackMetrics || !feedbackList || !loadingFeedback) return;
      
      const searchEl = document.getElementById('feedback-search');
      const typeEl = document.getElementById('feedback-type-filter');
      const statusEl = document.getElementById('feedback-status-filter');
      const exportEl = document.getElementById('export-feedback-csv');
      
      if (typeEl && !typeEl.hasAttribute('data-bound')) {
          searchEl?.addEventListener('input', renderFeedbackList);
          typeEl?.addEventListener('change', renderFeedbackList);
          statusEl?.addEventListener('change', renderFeedbackList);
          exportEl?.addEventListener('click', exportFeedbackCSV);
          typeEl.setAttribute('data-bound', 'true');
      }
      
      loadingFeedback.style.display = 'block';
      feedbackMetrics.innerHTML = '';
      feedbackList.innerHTML = '';
      
      try {
          const fetchedFeedback = await getAllFeedback().catch(() => []);
          const safeFeedback = fetchedFeedback || [];
          currentAllFeedback = [...safeFeedback].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          
          // Calculate Metrics
          const totalReceived = currentAllFeedback.length;
          const resolved = currentAllFeedback.filter(f => f.status === 'resolved');
          const pendingCount = currentAllFeedback.filter(f => f.status === 'pending').length;
          const resolutionRate = totalReceived > 0 ? Math.round((resolved.length / totalReceived) * 100) : 0;
          
          let totalMs = 0;
          let countMs = 0;
          resolved.forEach(f => {
              if (f.created_at && f.responded_at) {
                  const ms = new Date(f.responded_at).getTime() - new Date(f.created_at).getTime();
                  if (ms > 0) {
                      totalMs += ms;
                      countMs++;
                  }
              }
          });

          let avgStr = 'N/A';
          if (countMs > 0) {
              const avgMs = totalMs / countMs;
              const hours = Math.round(avgMs / (1000 * 60 * 60));
              if (hours < 1) avgStr = '< 1 hr';
              else avgStr = `~${hours} hrs`;
          }
          
          // Render Metrics
          feedbackMetrics.innerHTML = `
            <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); text-align: center;">
                <div style="font-size: 2rem; font-weight: bold; color: white;">${totalReceived}</div>
                <div style="color: var(--text-muted);">Total Received</div>
            </div>
            <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); text-align: center;">
                <div style="font-size: 2rem; font-weight: bold; color: #10b981;">${resolutionRate}%</div>
                <div style="color: var(--text-muted);">Resolution Rate</div>
            </div>
            <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); text-align: center; ${pendingCount > 0 ? 'border: 1px solid rgba(239, 68, 68, 0.3);' : ''}">
                <div style="font-size: 2rem; font-weight: bold; color: ${pendingCount > 0 ? '#ef4444' : 'white'};">${pendingCount}</div>
                <div style="color: var(--text-muted);">Pending Items</div>
            </div>
            <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); text-align: center;">
                <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;">${avgStr}</div>
                <div style="color: var(--text-muted);">Avg Response</div>
            </div>
          `;
          
          loadingFeedback.style.display = 'none';
          
          renderFeedbackList();
      } catch (e) {
          console.error("Feedback Dashboard Error:", e);
          loadingFeedback.style.display = 'none';
          feedbackList.innerHTML = `<div style="color: red; text-align: center;">Failed to load feedback: ${e.message || e}</div>`;
      }
  }

  function renderFeedbackList() {
      const feedbackList = document.getElementById('view-feedback-list');
      const searchInput = document.getElementById('feedback-search')?.value.toLowerCase() || '';
      const typeFilter = document.getElementById('feedback-type-filter')?.value || 'all';
      const statusFilter = document.getElementById('feedback-status-filter')?.value || 'all';
      
      let filtered = currentAllFeedback.filter(f => {
          if (typeFilter !== 'all' && f.type !== typeFilter) return false;
          if (statusFilter !== 'all' && f.status !== statusFilter) return false;
          if (searchInput) {
              const email = f.profiles?.email?.toLowerCase() || '';
              const name = f.profiles?.full_name?.toLowerCase() || '';
              if (!email.includes(searchInput) && !name.includes(searchInput)) return false;
          }
          return true;
      });
      
      if (filtered.length === 0) {
          feedbackList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">No feedback found matching criteria.</div>';
          return;
      }
      
      feedbackList.innerHTML = filtered.map(f => {
          let badgeColor = '#9ca3af';
          if (f.status === 'resolved') badgeColor = '#10b981';
          else if (f.status === 'acting-on') badgeColor = '#3b82f6';
          else if (f.status === 'pending') badgeColor = '#f59e0b';
          else if (f.status === 'under-review') badgeColor = '#8b5cf6';
          
          let typeStr = f.type || 'Other';
          if (f.type === 'positive') typeStr = 'Positive / Testimonial';
          else if (f.type === 'negative') typeStr = 'Product Improvement';
          else if (f.type === 'urgent') typeStr = 'Urgent System Error';

          let timeBadge = '';
          if (f.status === 'resolved' && f.created_at && f.responded_at) {
              const ms = new Date(f.responded_at).getTime() - new Date(f.created_at).getTime();
              if (ms > 0) {
                  const hrs = Math.round(ms / (1000 * 60 * 60));
                  timeBadge = `<span style="background: rgba(16,185,129,0.1); color: #10b981; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; border: 1px solid rgba(16,185,129,0.2);">Resolved in ${hrs < 1 ? '< 1 hr' : `~${hrs} hrs`}</span>`;
              }
          }

          return `
          <div class="glass" style="padding: 1rem; border-radius: var(--radius-md); border-left: 4px solid ${badgeColor};">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                  <div style="font-weight: bold; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;">
                      ${f.profiles?.full_name || f.profiles?.email || 'Unknown User'} 
                      <span style="color: var(--text-muted); font-weight: normal; font-size: 0.8rem;">(${new Date(f.created_at).toLocaleDateString()})</span>
                      <span style="background: rgba(255,255,255,0.1); font-size: 0.7rem; padding: 2px 6px; border-radius: 10px; color: var(--text-muted);">${typeStr}</span>
                  </div>
                  <div style="display: flex; gap: 0.5rem; align-items: center;">
                      ${timeBadge}
                      <span style="background: rgba(255,255,255,0.05); color: ${badgeColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; text-transform: capitalize;">${f.status}</span>
                  </div>
              </div>
              <div style="font-size: 0.9rem; margin-bottom: 0.5rem; color: #e5e7eb;">${f.content}</div>
              ${f.admin_response ? `<div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: var(--radius-sm); border-left: 2px solid var(--primary); font-size: 0.85rem;"><strong style="color: var(--primary);">Admin Response:</strong> ${f.admin_response}</div>` : ''}
          </div>
          `;
      }).join('');
  }
  
  function exportFeedbackCSV() {
      let csv = 'ID,User,Email,Date,Type,Status,Feedback,Admin Response,Response Time (hrs)\\n';
      currentAllFeedback.forEach(f => {
          const user = `"${(f.profiles?.full_name || 'Unknown').replace(/"/g, '""')}"`;
          const email = `"${(f.profiles?.email || '').replace(/"/g, '""')}"`;
          const date = `"${new Date(f.created_at).toLocaleString().replace(/"/g, '""')}"`;
          
          let typeStr = f.type || 'Other';
          if (f.type === 'positive') typeStr = 'Positive / Testimonial';
          else if (f.type === 'negative') typeStr = 'Product Improvement';
          else if (f.type === 'urgent') typeStr = 'Urgent System Error';
          typeStr = `"${typeStr}"`;
          
          const status = `"${f.status}"`;
          const content = `"${(f.content || '').replace(/"/g, '""')}"`;
          const response = `"${(f.admin_response || '').replace(/"/g, '""')}"`;
          let responseTime = '';
          if (f.created_at && f.responded_at) {
              const ms = new Date(f.responded_at).getTime() - new Date(f.created_at).getTime();
              if (ms > 0) responseTime = (ms / (1000 * 60 * 60)).toFixed(2);
          }
          csv += `${f.id},${user},${email},${date},${typeStr},${status},${content},${response},${responseTime}\\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feedback_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
  }

  // Auto-routing based on query parameter
  if (window.location.search.includes('tab=guides')) {
      setTimeout(() => {
          document.getElementById('tab-guides')?.click()
          window.history.replaceState({}, '', '/')
      }, 50)
  }
}
