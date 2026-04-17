import { supabase } from '../api/supabase'
import mermaid from 'mermaid'
import { marked } from 'marked'
import Chart from 'chart.js/auto'
import { renderToneAnalyser } from './components/ToneAnalyser.js'
import { renderDojoChat } from './components/DojoChat.js'
import { renderRedline } from './components/Redline.js'
import { renderDebate } from './components/Debate.js'
import { fswAlert } from '../utils/dialog.js'
import { renderDecisionSwipe } from './components/DecisionSwipe.js'
import { renderCertificate, downloadCertificate } from './components/Certificate.js'
import { renderSimulationPlayer } from './components/SimulationPlayer.js'

// Initialize Mermaid
mermaid.initialize({ startOnLoad: false, theme: 'dark' })

// Configure marked to handle mermaid and chart code blocks
marked.use({
    gfm: true,
    breaks: true,
    renderer: {
        code({ text, lang }) {
            const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

            const renderWrapper = (type, content) => {
                const id = type + '-' + Math.random().toString(36).substr(2, 9)
                return `
                    <div class="activity-wrapper" id="wrapper-${id}">
                        <div class="activity-header">
                             <button class="activity-expand-btn" data-target="wrapper-${id}" title="Enter Fullscreen">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                                <span>Expand Activity</span>
                            </button>
                        </div>
                        <div id="${id}" class="ai-component-container" data-type="${type}" style="margin: 0;"></div>
                        <script type="application/json" id="config-${id}">${content}</script>
                    </div>
                `
            }

            if (lang === 'mermaid') {
                return `<div class="mermaid">${text}</div>`
            }
            if (lang === 'chart') {
                const id = 'chart-' + Math.random().toString(36).substr(2, 9)
                return `
                    <div class="chart-container" style="position: relative; height: 400px; width: 100%; margin: 2rem 0; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 1rem;">
                        <canvas id="${id}"></canvas>
                        <script type="application/json" id="data-${id}">${text}</script>
                    </div>`
            }
            if (lang === 'ai-tone') return renderWrapper('ai-tone', text)
            if (lang === 'ai-dojo') return renderWrapper('ai-dojo', text)
            if (lang === 'ai-redline') return renderWrapper('ai-redline', text)
            if (lang === 'ai-debate') return renderWrapper('ai-debate', text)
            if (lang === 'ai-swipe') return renderWrapper('ai-swipe', text)

            return `<pre><code class="language-${esc(lang || '')}">${esc(text)}</code></pre>`
        }
    }
})

// Global Delegation for Activity Fullscreen Toggle (Document Level for Reparenting)
// Defined once at module level to avoid duplicate listeners on re-renders
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.activity-expand-btn');
    if (!btn) return;

    const wrapperId = btn.dataset.target;
    const wrapper = document.getElementById(wrapperId);

    if (wrapper) {
        const isFullscreen = wrapper.classList.contains('fullscreen');

        // Toggle State
        if (!isFullscreen) {
            // ENTER FULLSCREEN (Reparent to Body)

            // 1. Create Placeholder to hold spot
            const placeholder = document.createElement('div');
            placeholder.id = `placeholder-${wrapperId}`;
            placeholder.style.height = wrapper.offsetHeight + 'px';
            placeholder.style.width = '100%';
            // insert placeholder before wrapper
            wrapper.parentNode.insertBefore(placeholder, wrapper);

            // 2. Move wrapper to body
            document.body.appendChild(wrapper);

            // 3. Add Classes
            wrapper.classList.add('fullscreen');
            document.body.classList.add('activity-fullscreen-active');
            document.body.style.overflow = 'hidden';

            // Update UI
            btn.classList.add('active');
            btn.querySelector('span').innerText = "Exit Fullscreen";
            btn.querySelector('svg').innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>';

        } else {
            // EXIT FULLSCREEN (Restore to Original Spot)

            const placeholder = document.getElementById(`placeholder-${wrapperId}`);
            if (placeholder) {
                // 1. Move wrapper back
                placeholder.parentNode.insertBefore(wrapper, placeholder);
                // 2. Remove placeholder
                placeholder.remove();
            } else {
                // Fallback if placeholder lost (shouldn't happen in single session if unmounted)
                // If it is unmounted, we should probably destroy it.
                console.warn("Placeholder lost", wrapperId);
                wrapper.remove(); // Safety remove
                document.body.classList.remove('activity-fullscreen-active');
            }

            // 3. Remove Classes
            wrapper.classList.remove('fullscreen');
            document.body.classList.remove('activity-fullscreen-active');
            document.body.style.overflow = '';
            // Restore cinema mode overflow if needed
            document.body.style.overflow = 'hidden';


            // Update UI
            btn.classList.remove('active');
            btn.querySelector('span').innerText = "Expand Activity";
            btn.querySelector('svg').innerHTML = '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>';
        }
    }
});

export const renderCoursePlayer = (course, user, options = {}) => {
    let currentModuleIndex = 0
    let currentLessonIndex = 0
    let highestModuleIndex = 0
    let highestLessonIndex = 0
    let isSidebarCollapsed = false

    const isCourseComplete = options.isCourseComplete || false;

    // Completion State
    let isQuizComplete = false
    let isActivityComplete = false



    // CLEANUP: Check for and remove any orphaned fullscreen activities from Body (from previous sessions)
    document.querySelectorAll('body > .activity-wrapper.fullscreen').forEach(el => {
        el.remove();
    });
    document.body.classList.remove('activity-fullscreen-active');


    // Parse content if string



    // Parse content if string
    let modules = typeof course.content_json === 'string'
        ? JSON.parse(course.content_json)
        : course.content_json

    if (modules && modules.is_system_simulation) {
        return renderSimulationPlayer(course, user);
    }

    // Inject dummy data for verification if it's the specific test case
    // For now, we'll append a test lesson to the first module if it exists
    // Modules content is ready.


    const renderContent = () => {
        const currentModule = modules[currentModuleIndex]
        if (!currentModule) return '<div>Error loading content</div>'

        const currentLesson = currentModule.lessons[currentLessonIndex]

        // 1. Parse Markdown
        // marked custom renderer handles 'chart' blocks
        let rawContent = currentLesson.content || '';
        // Fix removed: The previous global replace of \\n to \n was corrupting JSON configs by creating invalid multi-line strings.
        // if (typeof rawContent === 'string') {
        //    rawContent = rawContent.replace(/\\n/g, '\n');
        // }

        let htmlContent = rawContent
            ? marked.parse(rawContent)
            : '<div style="padding: 2rem; color: #ef4444; border: 1px solid #ef4444; border-radius: 8px; background: rgba(239, 68, 68, 0.1);">Lesson content generation failed or is missing. Please regenerate this course.</div>';

        // Fallback for video if missing


        return `
      <div class="cp-grid">
        <!-- Sidebar Navigation -->
        <aside class="cp-sidebar">
            <div style="margin-bottom: 2rem;">
                <button id="exit-course" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; transition: color 0.2s;">
                   <span style="font-size: 1.2rem;">←</span> Exit Course
                </button>
            </div>
            
            <h3 class="text-gradient-silver" style="margin: 0 0 2rem 0; font-size: 1.4rem; font-weight: 700;">${course.title}</h3>
            
            <div style="display: flex; flex-direction: column; gap: 2rem;">
                ${modules.map((mod, mIdx) => `
                    <div class="fade-in" style="animation-delay: ${mIdx * 100}ms">
                        <div style="font-weight: 700; color: ${mIdx === currentModuleIndex ? 'white' : 'var(--text-muted)'}; margin-bottom: 1rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 2px;">
                            ${mod.title}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                            ${mod.lessons.map((lesson, lIdx) => {
                                const isUnlocked = user.role === 'manager' || isCourseComplete || (mIdx < highestModuleIndex) || (mIdx === highestModuleIndex && lIdx <= highestLessonIndex);
                                return `
                                <button class="lesson-btn ${mIdx === currentModuleIndex && lIdx === currentLessonIndex ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}" 
                                    data-m="${mIdx}" data-l="${lIdx}"
                                    ${!isUnlocked ? 'disabled title="You must complete the previous lessons first."' : ''}
                                    style="${!isUnlocked ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                                    ${mIdx === currentModuleIndex && lIdx === currentLessonIndex ? '▶' : '•'}
                                    ${!isUnlocked ? '🔒 ' : ''}${lesson.title}
                                </button>
                            `}).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </aside>

        <!-- Main Cinematic Stage -->
        <main class="cp-main">
            
            <!-- Slides / Visuals Area (Top 60%) -->
            <div class="cp-visuals-area">
                <div class="video-overlay-gradient"></div>
                <!-- Overlay to capture clicks in reading mode (to restore cinema mode) -->
                <div id="visuals-overlay" style="position: absolute; inset: 0; z-index: 40; display: none; cursor: pointer;" title="Click to expand"></div>

                ${currentLesson.gamma_url ? `
                     <div id="gamma-scroller" style="width: 100%; height: 100%; position: relative;">
                        <iframe 
                            id="gamma-iframe"
                            src="${(currentLesson.gamma_url.includes('/docs/') ? currentLesson.gamma_url.replace('/docs/', '/embed/') : currentLesson.gamma_url) + '?mode=doc'}" 
                            style="width: 100%; height: 100%; border: none;"
                            allow="fullscreen; autoplay"
                            allowfullscreen>
                        </iframe>
                     </div>
                ` : currentModule.slides_url ? `
                     <iframe src="${currentModule.slides_url}" style="width: 100%; height: 100%; border: none;"></iframe>
                ` : ''}

                <!-- Sidebar Toggle (Floating in Visual Area) -->
                 <button id="sidebar-toggle" class="hover-glow" style="position: absolute; top: 2rem; left: 2rem; z-index: 50; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px);" title="Toggle Sidebar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                    </svg>
                </button>

                <!-- Reading Mode Toggle (Floating in Visual Area) -->
                <button id="reading-mode-toggle" class="hover-glow" style="position: absolute; top: 2rem; right: 2rem; z-index: 50; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px);" title="Switch to Reading Mode">
                    <span style="font-size: 1.2rem;">📖</span>
                </button>

                <!-- Edit in Gamma Button (Managers Only) -->
                ${(user.role === 'manager') ? `
                    <button id="regenerate-gamma-btn" class="hover-glow" style="position: absolute; top: 2rem; right: ${currentLesson.gamma_url ? '14rem' : '5rem'}; z-index: 50; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); color: white; padding: 0 1rem; height: 40px; border-radius: 20px; display: flex; align-items: center; gap: 0.5rem; justify-content: center; backdrop-filter: blur(10px); font-size: 0.85rem; font-weight: bold; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.3);" title="Regenerate Presentation via AI">
                        <span>🔄 Regenerate Slides</span>
                    </button>
                    ${currentLesson.gamma_url ? `
                    <button id="edit-gamma-btn" onclick="window.open('${currentLesson.gamma_url}', '_blank')" class="hover-glow" style="position: absolute; top: 2rem; right: 5rem; z-index: 50; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.5); color: white; padding: 0 1rem; height: 40px; border-radius: 20px; display: flex; align-items: center; gap: 0.5rem; justify-content: center; backdrop-filter: blur(10px); font-size: 0.85rem; font-weight: bold; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.3);" title="Edit Presentation">
                        <span>✏️ Edit Slides</span>
                    </button>
                    ` : ''}
                ` : ''}
                
                <!-- Audio Player (Repositioned to bottom right) -->
                ${currentLesson.audio_url ? `
                    <div class="audio-player-wrapper fade-in" style="position: absolute; bottom: 2rem; right: 2rem; z-index: 60;">
                        <div class="glass" style="padding: 0.75rem 1.25rem; border-radius: var(--radius-md); display: flex; align-items: center; gap: 1rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.6);">
                            <div style="display: flex; flex-direction: column;">
                                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                                    <span style="font-size: 0.65rem; letter-spacing: 2px; text-transform: uppercase; font-weight: 800; color: var(--primary);">Audio Briefing</span>
                                    ${user.role === 'manager' ? `<button id="inline-edit-audio-btn" style="background:none; border:none; color: var(--primary); font-size: 0.65rem; cursor: pointer; padding: 0; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">✏️ Edit Audio</button>` : ''}
                                </div>
                                <audio id="lesson-audio" controls src="${currentLesson.audio_url}" style="height: 30px; outline: none; filter: invert(1) brightness(2) contrast(1.2); opacity: 0.8;"></audio>
                            </div>
                        </div>
                        
                        <!-- Hidden Audio Editor -->
                        ${user.role === 'manager' ? `
                        <div id="audio-edit-mode" style="display: none; position: absolute; bottom: 110%; right: 0; width: 400px; max-width: 90vw; background: rgba(10, 10, 10, 0.95); border: 1px solid rgba(255,255,255,0.2); border-radius: var(--radius-lg); padding: 1.5rem; backdrop-filter: blur(20px); box-shadow: 0 20px 40px rgba(0,0,0,0.8);">
                            <h4 style="margin: 0 0 1rem 0; font-size: 0.9rem; color: white;">Edit Audio Script</h4>
                            <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1rem;">Changes made here will be re-synthesized into a new voiceover track.</p>
                            <textarea id="edit-audio-script" style="width: 100%; height: 200px; background: rgba(0,0,0,0.5); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 0.75rem; font-family: inherit; font-size: 0.85rem; outline: none; resize: vertical; box-sizing: border-box; line-height: 1.5;"></textarea>
                            <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem;">
                                <button id="cancel-audio-edit" class="btn-ghost" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Cancel</button>
                                <button id="save-audio-edit" class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem;">🎙️ Regenerate</button>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                ` : ''}

            </div>

            <!-- Text Content & Quiz Area (Bottom 45%) -->
            <div class="cp-content-area">
                
                <!-- Markdown Content -->
                <div class="cp-text-panel" id="text-panel" style="position: relative;">
                    ${user.role === 'manager' ? `
                    <button id="inline-edit-btn" class="hover-glow" style="position: absolute; top: 1rem; right: 1rem; z-index: 10; font-size: 0.8rem; border-radius: 4px; padding: 0.4rem 0.8rem; display: flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; cursor: pointer; backdrop-filter: blur(5px); transition: all 0.2s;">
                        <span>✏️ Edit Content</span>
                    </button>
                    ` : ''}

                    <div id="content-view-mode" class="lesson-content typography fade-in">
                        ${htmlContent}
                        
                        ${(currentLesson.resources && currentLesson.resources.length > 0) ? `
                            <div class="resources-section" style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1);">
                                <h3 style="font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 1.5rem; font-weight: 700;">Lesson Resources & Attachments</h3>
                                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
                                    ${currentLesson.resources.map(res => `
                                        <a href="${res.url}" target="_blank" rel="noopener noreferrer" class="resource-card glass" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; text-decoration: none; color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; transition: transform 0.2s, background 0.2s, border-color 0.2s; background: rgba(255,255,255,0.03);">
                                            <div style="background: rgba(255,255,255,0.1); width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                                                ${res.url.endsWith('.pdf') ? '📄' : '🔗'}
                                            </div>
                                            <div style="flex: 1; overflow: hidden;">
                                                <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${res.title}</div>
                                                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.25rem;">
                                                    <span>Open Resource</span>
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                </div>
                                            </div>
                                        </a>
                                    `).join('')}
                                </div>
                                <style>
                                    .resource-card:hover {
                                        transform: translateY(-2px);
                                        background: rgba(255,255,255,0.08) !important;
                                        border-color: rgba(255,255,255,0.2) !important;
                                    }
                                </style>
                            </div>
                        ` : ''}
                    </div>

                    <div id="content-edit-mode" style="display: none; padding-top: 3.5rem; width: 100%;" class="fade-in">
                        <textarea id="inline-editor-textarea"></textarea>
                        <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem;">
                            <button id="inline-edit-cancel" class="btn-ghost">Cancel</button>
                            <button id="inline-edit-save" class="btn-primary">Save Changes</button>
                        </div>
                    </div>
                </div>

                <!-- Interactive Quiz / Actions -->
                <div class="cp-interactive-panel">
                    <div style="flex-grow: 1;">
                         ${currentLesson.quiz ? renderQuiz(currentLesson.quiz) : `
                            <div style="height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; color: var(--text-muted); opacity: 0.5;">
                                <div style="font-size: 3rem; margin-bottom: 1rem;">📝</div>
                                <p>No knowledge check for this lesson</p>
                            </div>
                        `}
                    </div>
                    
                    <div style="margin-top: 2rem; display: flex; flex-direction: column; gap: 1rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); align-items: center;">
                        <div id="completion-status" style="font-size: 0.9rem; color: #f59e0b; display: none; gap: 0.75rem; align-items: center; background: rgba(245, 158, 11, 0.1); padding: 0.75rem 2rem; border-radius: 30px; border: 1px solid rgba(245, 158, 11, 0.2); white-space: nowrap; width: 100%; justify-content: center;">
                            <span>⚠️ Complete tasks to proceed</span>
                        </div>

                        <div style="display: flex; gap: 1rem; align-items: center; width: 100%; justify-content: space-between;">
                            <button id="prev-btn" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: white; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); visibility: ${currentModuleIndex === 0 && currentLessonIndex === 0 ? 'hidden' : 'visible'}; cursor: pointer; transition: all 0.2s;">
                                ← Previous
                            </button>
                            <button id="next-btn" class="btn-primary" style="padding: 0.75rem 2.5rem; background: white; color: black; font-weight: bold; border: none; border-radius: var(--radius-md); cursor: pointer; display: flex; align-items: center; gap: 0.5rem; transition: all 0.3s;" disabled>
                                ${isLastLesson() ? 'Complete Course' : 'Next Lesson →'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

        </main>
      </div>
      
      <!-- Intro Overlay -->
      <div id="intro-overlay">
          <video id="intro-video" autoplay playsinline class="intro-video">
              <source src="/FSWlogoanimation.mp4" type="video/mp4">
          </video>
      </div>
    `
    }

    const renderQuiz = (quiz) => {
        return `
        <div class="quiz-container fade-in" style="position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                <h3 style="color: white; font-size: 1rem; text-transform: uppercase; letter-spacing: 2px; margin: 0; color: var(--primary);">Knowledge Check</h3>
                ${user.role === 'manager' ? `
                <button id="inline-edit-quiz-btn" class="hover-glow" style="font-size: 0.8rem; border-radius: 4px; padding: 0.3rem 0.6rem; display: flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; cursor: pointer; backdrop-filter: blur(5px); transition: all 0.2s;">
                    <span>✏️ Edit Quiz</span>
                </button>
                ` : ''}
            </div>

            <div id="quiz-view-mode">
                ${quiz.map((q, i) => `
                    <div style="margin-bottom: 2.5rem;">
                        <p style="font-weight: 500; margin-bottom: 1rem; font-size: 1.1rem; color: #fff; line-height: 1.5;">${i + 1}. ${q.question}</p>
                        <div class="quiz-options-group" style="display: flex; flex-direction: column; gap: 0.75rem;">
                            ${q.options.map((opt, oIdx) => `
                                <label class="quiz-option">
                                    <input type="radio" name="q${i}" value="${oIdx}" data-correct="${q.correct_index}" data-explanation="${q.explanation || ''}">
                                    <span style="font-size: 0.95rem; color: #d1d5db;">${opt}</span>
                                </label>
                            `).join('')}
                        </div>
                        <div class="feedback" id="feedback-q${i}" style="margin-top: 1rem; font-size: 0.9rem; min-height: 1.5rem; font-weight: 500;"></div>
                    </div>
                `).join('')}
            </div>

            <div id="quiz-edit-mode" style="display: none;">
                ${quiz.map((q, i) => `
                    <div class="quiz-edit-item" data-idx="${i}" style="margin-bottom: 2.5rem; padding: 1.5rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;">
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Question ${i + 1}</label>
                            <input type="text" class="edit-q-text" value="${q.question.replace(/"/g, '&quot;')}" style="width: 100%; box-sizing: border-box; padding: 0.75rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.5); color: white; outline: none;">
                        </div>
                        <div style="margin-bottom: 1rem; padding-left: 1rem; border-left: 2px solid rgba(255,255,255,0.1);">
                            <label style="display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Answers</label>
                            ${q.options.map((opt, oIdx) => `
                                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                    <span style="font-size: 0.8rem; color: ${q.correct_index === oIdx ? '#10b981' : 'var(--text-muted)'}; font-weight: bold; width: 20px;">${String.fromCharCode(65 + oIdx)}.</span>
                                    <input type="text" class="edit-opt-text" data-qidx="${i}" data-oidx="${oIdx}" value="${opt.replace(/"/g, '&quot;')}" style="flex: 1; box-sizing: border-box; padding: 0.5rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.5); color: white; outline: none; border-left-color: ${q.correct_index === oIdx ? '#10b981' : 'rgba(255,255,255,0.2)'}; border-left-width: ${q.correct_index === oIdx ? '4px' : '1px'};">
                                </div>
                            `).join('')}
                        </div>
                        <div>
                             <label style="display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Explanation (Feedback)</label>
                             <textarea class="edit-q-exp" style="width: 100%; box-sizing: border-box; padding: 0.75rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.5); color: white; outline: none; min-height: 60px; font-family: inherit;">${(q.explanation || '').replace(/"/g, '&quot;')}</textarea>
                        </div>
                    </div>
                `).join('')}
                
                <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem;">
                    <button id="inline-edit-quiz-cancel" class="btn-ghost" style="padding: 0.5rem 1rem;">Cancel</button>
                    <button id="inline-edit-quiz-save" class="btn-primary" style="padding: 0.5rem 1rem;">Save Quiz</button>
                </div>
            </div>
        </div>
      `
    }

    function isLastLesson() {
        return currentModuleIndex === modules.length - 1 &&
            currentLessonIndex === modules[currentModuleIndex].lessons.length - 1
    }

    // Keep track of charts to destroy them before re-rendering
    let activeCharts = [];



    const mount = () => {
        activeCharts.forEach(chart => chart.destroy())
        activeCharts = []

        // Reset Completion State for new lesson
        const currentMod = modules[currentModuleIndex]
        const currentLes = currentMod.lessons[currentLessonIndex]

        // Check for Quiz
        // If no quiz, marked as complete.
        isQuizComplete = !currentLes.quiz || currentLes.quiz.length === 0;

        // Check for Activity
        // Look for special code blocks in content
        const content = currentLes.content || '';
        const hasActivity = content.includes('```ai-swipe') ||
            content.includes('```ai-dojo') ||
            content.includes('```ai-redline') ||
            content.includes('```ai-debate');

        isActivityComplete = !hasActivity;

        // Debug
        console.log('Mount Lesson:', currentLes.title);
        console.log('Has Quiz:', !isQuizComplete, 'Has Activity:', hasActivity);

        document.body.style.overflow = 'hidden'

        // Preserve sidebar state
        const grid = document.querySelector('.cp-grid')

        // Render
        const app = document.getElementById('app')
        app.innerHTML = renderContent()

        const newGrid = document.querySelector('.cp-grid')
        if (isSidebarCollapsed) {
            newGrid.classList.add('collapsed')
        }

        // Initialize in Cinema Mode (Fullscreen) and Collapsed
        newGrid.classList.add('cinema-mode')
        newGrid.classList.add('collapsed')
        isSidebarCollapsed = true


        // Render Mermaid
        setTimeout(() => {
            mermaid.run({
                nodes: document.querySelectorAll('.mermaid')
            })
        }, 100)



        // Render Charts
        setTimeout(() => {
            document.querySelectorAll('.chart-container').forEach(container => {
                try {
                    const canvas = container.querySelector('canvas')
                    const script = container.querySelector('script')
                    const config = JSON.parse(script.textContent)

                    // Verify if chart instance already exists or canvas is in use (Chart.js auto-tracks, but explicit creation needs care)
                    if (canvas.chart) {
                        canvas.chart.destroy();
                    }

                    const chartInstance = new Chart(canvas, config)
                    activeCharts.push(chartInstance)
                    // Store ref
                    canvas.chart = chartInstance;

                } catch (e) {
                    console.error('Failed to render chart:', e)
                    container.innerHTML = '<div style="color:red; padding:1rem;">Error rendering chart</div>'
                }
            })

            // Render Generic AI Components
            document.querySelectorAll('.ai-component-container').forEach(container => {
                try {
                    const id = container.id
                    const type = container.dataset.type
                    const script = document.getElementById(`config-${id}`)
                    const config = JSON.parse(script.textContent)

                    if (type === 'ai-tone') renderToneAnalyser(id, config)
                    if (type === 'ai-dojo') renderDojoChat(id, config)
                    if (type === 'ai-redline') renderRedline(id, config)
                    if (type === 'ai-debate') renderDebate(id, config)
                    if (type === 'ai-swipe') renderDecisionSwipe(id, config)

                } catch (e) {
                    console.error(`Error rendering component ${container.dataset.type}`, e)
                    container.innerHTML = `<div style="color:red; border:1px solid red; padding:1rem;">Error rendering AI Component</div>`
                }
            })

        }, 100)



        // Handle Intro Video
        const overlay = document.getElementById('intro-overlay')
        const video = document.getElementById('intro-video')
        const audio = document.getElementById('lesson-audio')

        if (overlay && video) {
            const finishIntro = () => {
                if (overlay.classList.contains('fade-out')) return

                overlay.classList.add('fade-out')
                setTimeout(() => overlay.remove(), 1000)
                if (audio) {
                    audio.play().catch(e => console.log('Audio autoplay blocked:', e))
                }
            }

            video.addEventListener('ended', finishIntro)

            // Attempt to play intro video
            video.play().catch(() => {
                // Autoplay blocked: Show manual start button
                const btn = document.createElement('button')
                btn.innerText = "Start Experience"
                btn.style.cssText = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); z-index:100; padding: 1rem 3rem; font-size:1.2rem; background:white; color:black; border:none; border-radius:50px; cursor:pointer; font-weight:bold; box-shadow:0 0 30px rgba(0,0,0,0.5);"
                btn.onclick = () => {
                    video.play()
                    btn.remove()
                }
                overlay.appendChild(btn)
            })

            // Fallback safety (only if video is actually playing)
            setTimeout(() => {
                if (!video.paused) {
                    finishIntro()
                }
            }, 6000)

        } else if (overlay) {
            // Fallback for missing video element
            setTimeout(() => {
                overlay.classList.add('fade-out')
                setTimeout(() => overlay.remove(), 1000)
                if (audio) audio.play().catch(e => console.log('Audio play error:', e))
                if (currentLesson.gamma_url) console.log('Lesson loaded')
            }, 2500)
        } else {
            // No intro (e.g. next lesson), play audio immediately
            if (audio) audio.play().catch(e => console.log('Audio play error:', e))
            if (currentLesson.gamma_url) console.log('Lesson loaded')
        }

        attachEvents()
        updateNextButtonState()
    }

    const updateNextButtonState = () => {
        const nextBtn = document.getElementById('next-btn')
        const statusEl = document.getElementById('completion-status')
        if (!nextBtn) return

        const isComplete = isQuizComplete && isActivityComplete

        if (isComplete) {
            nextBtn.disabled = false
            nextBtn.style.opacity = '1'
            nextBtn.style.filter = 'none'
            nextBtn.style.cursor = 'pointer'
            nextBtn.title = ''
            if (statusEl) statusEl.style.display = 'none'
        } else {
            nextBtn.disabled = true
            nextBtn.style.opacity = '0.5'
            nextBtn.style.filter = 'grayscale(1)'
            nextBtn.style.cursor = 'not-allowed'
            nextBtn.title = 'Please complete all activities and quizzes to proceed.'

            if (statusEl) {
                statusEl.style.display = 'flex'
                let missing = []
                if (!isActivityComplete) missing.push('Activity')
                if (!isQuizComplete) missing.push('Knowledge Check')
                statusEl.innerHTML = `<span>⚠️ Complete ${missing.join(' & ')}</span>`
            }
        }
    }

    const attachEvents = () => {
        // Inline Editor Logic
        const inlineEditBtn = document.getElementById('inline-edit-btn');
        if (inlineEditBtn) {
            const viewMode = document.getElementById('content-view-mode');
            const editMode = document.getElementById('content-edit-mode');
            const cancelBtn = document.getElementById('inline-edit-cancel');
            const saveBtn = document.getElementById('inline-edit-save');
            const textarea = document.getElementById('inline-editor-textarea');
            let easyMDEInstance = null;

            inlineEditBtn.addEventListener('click', async () => {
                viewMode.style.display = 'none';
                inlineEditBtn.style.display = 'none';
                editMode.style.display = 'block';

                if (!easyMDEInstance) {
                    const EasyMDE = (await import('easymde')).default;
                    await import('easymde/dist/easymde.min.css');
                    
                    // Inject dark mode fix for the toolbar
                    if (!document.getElementById('easymde-dark-fix')) {
                        const style = document.createElement('style');
                        style.id = 'easymde-dark-fix';
                        style.innerHTML = `
                            .editor-toolbar { background: rgba(255,255,255,0.1) !important; border: 1px solid rgba(255,255,255,0.2) !important; border-top-left-radius: 8px !important; border-top-right-radius: 8px !important; }
                            .editor-toolbar button { color: white !important; }
                            .editor-toolbar button:hover { background: rgba(255,255,255,0.2) !important; border-color: transparent !important; }
                            .editor-toolbar i.separator { border-left: 1px solid rgba(255,255,255,0.2) !important; border-right: none !important; }
                            .CodeMirror { border: 1px solid rgba(255,255,255,0.2) !important; border-bottom-left-radius: 8px !important; border-bottom-right-radius: 8px !important; background: rgba(0,0,0,0.5) !important; color: white !important; }
                            .editor-preview, .editor-preview-side { background: #111 !important; color: white !important; padding: 2rem !important; }
                            .editor-preview h2, .editor-preview-side h2 { color: white !important; border-bottom: 1px solid rgba(255,255,255,0.1) !important; }
                            .editor-preview h3, .editor-preview-side h3 { color: white !important; }
                        `;
                        document.head.appendChild(style);
                    }

                    easyMDEInstance = new EasyMDE({
                        element: textarea,
                        spellChecker: false,
                        autosave: { enabled: false },
                        toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', 'image', '|', 'preview', 'side-by-side', 'fullscreen'],
                        status: false,
                        maxHeight: "500px"
                    });
                }
                const currentLesson = modules[currentModuleIndex].lessons[currentLessonIndex];
                easyMDEInstance.value((currentLesson.content || '').replace(/\\n/g, '\n'));
                setTimeout(() => easyMDEInstance.codemirror.refresh(), 100);
            });

            cancelBtn.addEventListener('click', () => {
                editMode.style.display = 'none';
                viewMode.style.display = 'block';
                inlineEditBtn.style.display = 'flex';
            });

            saveBtn.addEventListener('click', async () => {
                const currentLesson = modules[currentModuleIndex].lessons[currentLessonIndex];
                currentLesson.content = easyMDEInstance.value();
                
                const originalText = saveBtn.innerText;
                saveBtn.innerText = 'Saving...';
                saveBtn.disabled = true;

                try {
                    const { updateCourse } = await import('../api/courses');
                    await updateCourse(course.id, {
                        content_json: modules,
                        updated_at: new Date()
                    });
                    
                    // Re-render the UI correctly to show updated HTML
                    mount(); 
                } catch(e) {
                    console.error('Failed to save inline edit:', e);
                    await fswAlert("Failed to save changes.");
                    saveBtn.innerText = originalText;
                    saveBtn.disabled = false;
                }
            });
        }

        // Inline Edit Quiz Logic
        const editQuizBtn = document.getElementById('inline-edit-quiz-btn');
        if (editQuizBtn) {
            const quizViewMode = document.getElementById('quiz-view-mode');
            const quizEditMode = document.getElementById('quiz-edit-mode');
            const saveQuizBtn = document.getElementById('inline-edit-quiz-save');
            const cancelQuizBtn = document.getElementById('inline-edit-quiz-cancel');

            editQuizBtn.addEventListener('click', () => {
                quizViewMode.style.display = 'none';
                editQuizBtn.style.display = 'none';
                quizEditMode.style.display = 'block';
            });

            cancelQuizBtn.addEventListener('click', () => {
                quizEditMode.style.display = 'none';
                quizViewMode.style.display = 'block';
                editQuizBtn.style.display = 'flex';
            });

            saveQuizBtn.addEventListener('click', async () => {
                const currentLesson = modules[currentModuleIndex].lessons[currentLessonIndex];
                if (!currentLesson.quiz) return;

                // Sync UI form back to JSON
                const quizItems = document.querySelectorAll('.quiz-edit-item');
                quizItems.forEach(item => {
                    const idx = parseInt(item.dataset.idx);
                    const qObj = currentLesson.quiz[idx];
                    
                    const qInput = item.querySelector('.edit-q-text');
                    if (qInput) qObj.question = qInput.value;

                    const expInput = item.querySelector('.edit-q-exp');
                    if (expInput) qObj.explanation = expInput.value;

                    const optInputs = item.querySelectorAll('.edit-opt-text');
                    optInputs.forEach(optInput => {
                        const oIdx = parseInt(optInput.dataset.oidx);
                        qObj.options[oIdx] = optInput.value;
                    });
                });

                const originalText = saveQuizBtn.innerText;
                saveQuizBtn.innerText = 'Saving...';
                saveQuizBtn.disabled = true;

                try {
                    const { updateCourse } = await import('../api/courses');
                    await updateCourse(course.id, {
                        content_json: modules,
                        updated_at: new Date()
                    });
                    
                    mount(); // Re-render
                } catch(e) {
                    console.error('Failed to save quiz edit:', e);
                    await fswAlert("Failed to save changes.");
                    saveQuizBtn.innerText = originalText;
                    saveQuizBtn.disabled = false;
                }
            });
        }

        // Inline Edit Audio Logic
        const editAudioBtn = document.getElementById('inline-edit-audio-btn');
        if (editAudioBtn) {
            const audioEditMode = document.getElementById('audio-edit-mode');
            const cancelAudioBtn = document.getElementById('cancel-audio-edit');
            const saveAudioBtn = document.getElementById('save-audio-edit');
            const audioScriptArea = document.getElementById('edit-audio-script');
            const currentLesson = modules[currentModuleIndex].lessons[currentLessonIndex];

            editAudioBtn.addEventListener('click', () => {
                // Pre-fill script
                if (currentLesson.audio_script) {
                    audioScriptArea.value = currentLesson.audio_script;
                } else {
                    // Fallback for legacy courses: parse from markdown content
                    const rawContent = currentLesson.content || '';
                    // Strip basic markdown (headers, bold, italics) for text-to-speech readability
                    let stripped = rawContent
                        .replace(/[#*`_]+/g, '')
                        .replace(/\\n/g, '\n')
                        .split('### Interactive Activity')[0] // remove interactives
                        .trim();
                    audioScriptArea.value = "Welcome to the lesson. " + stripped; 
                }
                audioEditMode.style.display = 'block';
            });

            cancelAudioBtn.addEventListener('click', () => {
                audioEditMode.style.display = 'none';
            });

            saveAudioBtn.addEventListener('click', async () => {
                if (!audioScriptArea.value.trim()) return;
                
                const originalText = saveAudioBtn.innerHTML;
                saveAudioBtn.innerHTML = '🎙️ Regenerating...';
                saveAudioBtn.disabled = true;

                try {
                    const newScript = audioScriptArea.value.trim();
                    const { createAudio } = await import('../api/elevenlabs');
                    
                    // Generate new audio
                    const newAudioUrl = await createAudio(newScript);
                    if (!newAudioUrl) throw new Error("Audio generation failed");

                    // Save to lesson
                    currentLesson.audio_url = newAudioUrl;
                    currentLesson.audio_script = newScript;

                    // Update DB
                    const { updateCourse } = await import('../api/courses');
                    await updateCourse(course.id, {
                        content_json: modules,
                        updated_at: new Date()
                    });
                    
                    mount(); // Re-render to load new audio
                } catch(e) {
                    console.error('Failed to regenerate audio:', e);
                    await fswAlert("Failed to regenerate audio. Check your connections or credits.");
                    saveAudioBtn.innerHTML = originalText;
                    saveAudioBtn.disabled = false;
                }
            });
        }

        // Regenerate Gamma Logic
        const regenGammaBtn = document.getElementById('regenerate-gamma-btn');
        if (regenGammaBtn) {
            regenGammaBtn.addEventListener('click', async () => {
                const { fswConfirm, fswAlert } = await import('../utils/dialog.js');
                if (await fswConfirm("Regenerate the presentation via AI? This may take up to a minute.")) {
                    regenGammaBtn.querySelector('span').innerText = '🔄 Generating...';
                    regenGammaBtn.disabled = true;
                    try {
                        const { createPresentation } = await import('../api/gamma.js');
                        const l = modules[currentModuleIndex].lessons[currentLessonIndex];
                        const input = l.presentation_input || l.audio_script || l.content;
                        const newUrl = await createPresentation(l.title, input);
                        if (newUrl) {
                            l.gamma_url = newUrl;
                            const { updateCourse } = await import('../api/courses.js');
                            await updateCourse(course.id, { content_json: modules, updated_at: new Date() });
                            mount();
                        } else {
                            throw new Error("Gamma returned null");
                        }
                    } catch (e) {
                         console.error('Failed to regenerate presentation:', e);
                         await fswAlert("Failed to regenerate presentation.");
                    } finally {
                        if (document.getElementById('regenerate-gamma-btn')) {
                            document.getElementById('regenerate-gamma-btn').querySelector('span').innerText = '🔄 Regenerate Slides';
                            document.getElementById('regenerate-gamma-btn').disabled = false;
                        }
                    }
                }
            });
        }

        document.getElementById('exit-course').addEventListener('click', () => {
            document.body.style.overflow = ''
            window.location.reload()
        })

        const toggleBtn = document.getElementById('sidebar-toggle')
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const grid = document.querySelector('.cp-grid')

                // If in Cinema Mode, clicking sidebar should exit Cinema Mode too
                if (grid.classList.contains('cinema-mode')) {
                    grid.classList.remove('cinema-mode')
                    grid.classList.add('reading-mode')
                    const overlay = document.getElementById('visuals-overlay')
                    if (overlay) overlay.style.display = 'block'
                }

                isSidebarCollapsed = !isSidebarCollapsed
                grid.classList.toggle('collapsed')
            })
        }

        const readingToggle = document.getElementById('reading-mode-toggle')
        if (readingToggle) {
            readingToggle.addEventListener('click', () => {
                const grid = document.querySelector('.cp-grid')
                grid.classList.remove('cinema-mode')
                grid.classList.add('reading-mode')
                const overlay = document.getElementById('visuals-overlay')
                if (overlay) overlay.style.display = 'block'
            })
        }

        // Fullscreen Toggle Logic
        const visualsOverlay = document.getElementById('visuals-overlay')
        if (visualsOverlay) {
            visualsOverlay.addEventListener('click', () => {
                const grid = document.querySelector('.cp-grid')
                grid.classList.add('cinema-mode')
                grid.classList.add('collapsed')
                isSidebarCollapsed = true
                grid.classList.remove('reading-mode')
                visualsOverlay.style.display = 'none'

            })
        }




        document.querySelectorAll('.lesson-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentModuleIndex = parseInt(e.target.dataset.m)
                currentLessonIndex = parseInt(e.target.dataset.l)
                mount()
            })
        })

        // Clean up any lingering listener from a previous lesson
        if (window.currentActivityListener) {
            document.removeEventListener('lesson-activity-complete', window.currentActivityListener);
        }

        // Listen for activity completion
        window.currentActivityListener = () => {
            console.log('Activity Completed!');
            isActivityComplete = true;
            updateNextButtonState();

            // Visual feedback toast
            const toast = document.createElement('div');
            toast.className = 'fade-in';
            toast.innerHTML = `<div style="background: #10b981; color: white; padding: 1rem 2rem; border-radius: 50px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); font-weight: bold; display: flex; align-items: center; gap: 0.5rem;"><span>✓</span> Activity Complete</div>`;
            toast.style.cssText = "position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); z-index: 1000;";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        };
        document.addEventListener('lesson-activity-complete', window.currentActivityListener, { once: true });


        document.querySelectorAll('.quiz-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                // Prevent multiple clicks if already answered (optional, but good UX)
                // For now, let's allow changing answers unless we want to lock it.
                // Actually, the previous logic allowed "guessing" until right.

                const input = opt.querySelector('input')
                // input.checked is handled by browser default for label click, 
                // but we also need to trigger our logic.

                const container = opt.closest('.quiz-options-group')
                const feedback = container.parentElement.querySelector('.feedback')
                const isCorrect = parseInt(input.value) === parseInt(input.dataset.correct)

                // Reset siblings
                container.querySelectorAll('.quiz-option').forEach(o => {
                    o.classList.remove('correct', 'incorrect')
                })

                if (isCorrect) {
                    opt.classList.add('correct')
                    feedback.innerHTML = `
                        <div style="color: #10b981; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">✓ Correct - Great job!</div>
                        ${input.dataset.explanation ? `<div style="font-size: 0.85rem; color: #9ca3af; padding: 0.75rem; background: rgba(16, 185, 129, 0.05); border-radius: 4px; border-left: 2px solid #10b981;">${input.dataset.explanation}</div>` : ''}
                    `
                } else {
                    opt.classList.add('incorrect')
                    feedback.innerHTML = '<span style="color: #ef4444; display: flex; align-items: center; gap: 0.5rem;">✕ Incorrect - Try again</span>'
                }

                // Check overall Quiz Completion
                const currentLesson = modules[currentModuleIndex].lessons[currentLessonIndex];
                const totalQuestions = currentLesson.quiz ? currentLesson.quiz.length : 0;
                const correctlyAnswered = document.querySelectorAll('.quiz-option.correct').length;

                if (correctlyAnswered === totalQuestions) {
                    if (!isQuizComplete) {
                        isQuizComplete = true;
                        updateNextButtonState();

                        // Show Quiz Complete Message
                        const quizContainer = document.querySelector('.quiz-container');
                        const msg = document.createElement('div');
                        msg.innerHTML = `<div style="margin-top: 2rem; padding: 1rem; background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; border-radius: 8px; color: #10b981; text-align: center; font-weight: bold;">🎉 Knowledge Check Passed!</div>`;
                        quizContainer.appendChild(msg);
                    }
                }
            })
        })


        const nextBtn = document.getElementById('next-btn')
        const prevBtn = document.getElementById('prev-btn')

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                const currentMod = modules[currentModuleIndex]
                if (currentLessonIndex > 0) {
                    currentLessonIndex--
                } else if (currentModuleIndex > 0) {
                    currentModuleIndex--
                    currentLessonIndex = modules[currentModuleIndex].lessons.length - 1
                }
                mount()
            })
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', async () => {
                if (!isQuizComplete || !isActivityComplete) return; // double check

                if (isLastLesson()) {
                    await completeCourse()
                } else {
                    const currentMod = modules[currentModuleIndex]
                    if (currentLessonIndex < currentMod.lessons.length - 1) {
                        currentLessonIndex++
                    } else if (currentModuleIndex < modules.length - 1) {
                        currentModuleIndex++
                        currentLessonIndex = 0
                    }
                    
                    if (currentModuleIndex > highestModuleIndex || (currentModuleIndex === highestModuleIndex && currentLessonIndex > highestLessonIndex)) {
                        highestModuleIndex = currentModuleIndex;
                        highestLessonIndex = currentLessonIndex;
                    }

                    mount()
                }
            })
        }

        const audioEl = document.getElementById('lesson-audio')
        if (audioEl) {
            audioEl.addEventListener('ended', () => {
                const grid = document.querySelector('.cp-grid')
                if (grid) {
                    grid.classList.remove('cinema-mode')
                    grid.classList.add('reading-mode')

                    // Show overlay to allow restoring
                    const overlay = document.getElementById('visuals-overlay')
                    if (overlay) overlay.style.display = 'block'

                    // Optional: Start auto-scrolling when reading mode activates?
                    // Let's keep it manual trigger for now to avoid annoyance.
                }
            })
        }


    }

    const completeCourse = async () => {
        const main = document.querySelector('main')
        // Use a formatted date
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

        // Render Certificate
        main.innerHTML = renderCertificate(course.title, user.full_name || user.email.split('@')[0], date) 

        // Add event listeners for the new DOM elements
        setTimeout(() => {
            const downloadBtn = document.getElementById('download-cert-btn')
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => {
                    // Find the certificate container ID (it's dynamic in the component, so we query selector it)
                    const certContainer = document.querySelector('[id^="certificate-container-"]')
                    if (certContainer) {
                        downloadCertificate(certContainer.id, `Certificate-${course.title.replace(/\s+/g, '-')}`)
                    }
                })
            }



            // Handle Activity Fullscreen Toggle - MOVED TO DELEGATION



            const returnBtn = document.getElementById('back-home-cert')
            if (returnBtn) {
                returnBtn.addEventListener('click', () => {
                    window.location.href = '/' // Direct navigation to home/dashboard
                })
            }
        }, 100)

        try {
            const certId = crypto.randomUUID();
            let expiresAt = null;
            if (course.expiry_months && course.expiry_months > 0) {
                const d = new Date();
                d.setMonth(d.getMonth() + parseInt(course.expiry_months));
                expiresAt = d.toISOString();
            }

            const { data: existing } = await supabase
                .from('user_progress')
                .select('id')
                .eq('user_id', user.id)
                .eq('course_id', course.id)
                .maybeSingle();

            if (existing) {
                await supabase.from('user_progress').update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    certificate_id: certId,
                    expires_at: expiresAt
                }).eq('id', existing.id);
            } else {
                await supabase.from('user_progress').insert({
                    user_id: user.id,
                    course_id: course.id,
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    certificate_id: certId,
                    expires_at: expiresAt
                });
            }
        } catch (e) { console.error('Error saving progress:', e) }
    }

    mount()
}
