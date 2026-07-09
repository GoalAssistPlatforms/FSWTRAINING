import { supabase } from '../api/supabase'
import mermaid from 'mermaid'
import { marked } from 'marked'
import Chart from 'chart.js/auto'
import { renderToneAnalyser } from './components/ToneAnalyser.js'
import { renderDojoChat } from './components/DojoChat.js'
import { renderRedline } from './components/Redline.js'
import { renderDebate } from './components/Debate.js'
import { fswAlert, fswConfirm } from '../utils/dialog.js'
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

export function renderCoursePlayer(course, user, options = {}) {
    window.currentCourseData = course;

    const progress = options.progress || null;
    
    let currentModuleIndex = progress?.last_module_index || 0;
    let currentLessonIndex = progress?.last_lesson_index || 0;
    let highestModuleIndex = progress?.highest_module_index || currentModuleIndex;
    let highestLessonIndex = progress?.highest_lesson_index || currentLessonIndex;
    let isSidebarCollapsed = false

    const isCourseComplete = options.isCourseComplete || false;

    // Completion State
    let isQuizComplete = false
    let isActivityComplete = false

    // Diagnostic Pre-Test Tracking
    let exemptedLessons = Array.isArray(progress?.exempted_lessons) ? progress.exempted_lessons : [];
    let pretestState = (course.allow_pretest && (!progress || progress.status === 'assigned')) ? 'intro' : 'normal';
    let showWelcomeSkipNotice = false;
    let pretestAnswers = {}; // key: globalIndex, value: selectedOptionIndex
    let pretestCurrentStep = 0;



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

    if (modules && (modules.is_system_simulation || modules.type === 'video_walkthrough')) {
        return renderSimulationPlayer(course, user);
    }

    // Compile pre-test elements
    let pretestQuestions = [];
    let capstoneActivity = null;
    let capstoneConfig = null;
    let capstoneLessonTitle = '';
    let capstoneModuleIndex = -1;
    let capstoneLessonIndex = -1;

    const compilePretest = () => {
        pretestQuestions = [];
        if (course.allow_pretest && modules && Array.isArray(modules)) {
            modules.forEach((mod, mIdx) => {
                if (mod && mod.lessons && Array.isArray(mod.lessons)) {
                    mod.lessons.forEach((les, lIdx) => {
                        if (les && les.quiz && Array.isArray(les.quiz)) {
                            les.quiz.forEach((q, qIdx) => {
                                pretestQuestions.push({
                                    ...q,
                                    mIdx,
                                    lIdx,
                                    qIdx,
                                    lessonTitle: les.title || ''
                                });
                            });
                        }
                    });
                }
            });
        }
    };

    if (course.allow_pretest && modules && Array.isArray(modules)) {
        compilePretest();

        // Find capstone activity (interactive simulation from the last lesson that has one)
        for (let m = modules.length - 1; m >= 0; m--) {
            const mod = modules[m];
            if (mod && mod.lessons && Array.isArray(mod.lessons)) {
                for (let l = mod.lessons.length - 1; l >= 0; l--) {
                    const les = mod.lessons[l];
                    if (les && les.ai_component && les.ai_component.type) {
                        capstoneActivity = les.ai_component.type;
                        capstoneConfig = les.ai_component.config;
                        capstoneLessonTitle = les.title || '';
                        capstoneModuleIndex = m;
                        capstoneLessonIndex = l;
                        break;
                    }
                }
            }
            if (capstoneActivity) break;
        }
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

        let processedContent = rawContent;
        if (typeof processedContent === 'string') {
            processedContent = processedContent.replace(
                /### Interactive Activity/g,
                '<div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.5rem;"><h3 style="color: white; font-size: 1rem; text-transform: uppercase; letter-spacing: 2px; margin: 0; color: var(--primary);">Interactive Activity</h3></div>'
            );
            
            // Auto-fix flattened code blocks that lose newlines when copy-pasted
            processedContent = processedContent.replace(/```(ai-[a-z-]+)\s*(?=\{)/g, '```$1\n');
            processedContent = processedContent.replace(/\}\s*```/g, '}\n```');
        }

        let htmlContent = processedContent
            ? marked.parse(processedContent)
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

            <div class="cp-module-list">
            
            <h3 class="text-gradient-silver" style="margin: 0 0 2rem 0; font-size: 1.4rem; font-weight: 700;">${course.title}</h3>
            
            <div style="display: flex; flex-direction: column; gap: 2rem;">
                ${modules.map((mod, mIdx) => `
                    <div class="fade-in" style="animation-delay: ${mIdx * 100}ms">
                        <div style="font-weight: 700; color: ${mIdx === currentModuleIndex ? 'white' : 'var(--text-muted)'}; margin-bottom: 1rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 2px;">
                            ${mod.title}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                            ${mod.lessons.map((lesson, lIdx) => {
                                const isExempt = exemptedLessons.some(el => el.m === mIdx && el.l === lIdx);
                                const isUnlocked = user.role === 'manager' || isCourseComplete || isExempt || (mIdx < highestModuleIndex) || (mIdx === highestModuleIndex && lIdx <= highestLessonIndex);
                                return `
                                <button class="lesson-btn ${mIdx === currentModuleIndex && lIdx === currentLessonIndex ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}" 
                                    data-m="${mIdx}" data-l="${lIdx}"
                                    ${!isUnlocked ? 'disabled title="You must complete the previous lessons first."' : ''}
                                    style="${!isUnlocked ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                                    ${mIdx === currentModuleIndex && lIdx === currentLessonIndex ? '▶' : (isExempt ? '✓' : '•')}
                                    ${!isUnlocked ? '🔒 ' : ''}${lesson.title}
                                    ${isExempt ? ' <span style="font-size: 0.75rem; padding: 0.1rem 0.4rem; background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 4px; margin-left: 0.5rem; font-weight: bold; display: inline-block; vertical-align: middle;">Exempt</span>' : ''}
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

                ${currentLesson.gamma_pdf_url ? `
                      <div id="gamma-scroller" style="width: 100%; height: 100%; position: relative; padding-right: ${(user.role === 'manager') ? '360px' : '0'}; padding-left: 2rem; padding-top: 2rem; padding-bottom: 2rem; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">
                        
                        <!-- Left Navigation Arrow (Managers Only) -->
                        ${user.role === 'manager' ? `
                        <button id="pdf-prev-slide-btn" class="hover-glow" style="position: absolute; left: 3rem; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 50%; background: rgba(15,15,15,0.75); border: 1px solid rgba(255,255,255,0.1); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; z-index: 50; backdrop-filter: blur(10px); box-shadow: 0 10px 30px rgba(0,0,0,0.5);" title="Previous Slide">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        ` : ''}

                        <canvas id="pdf-canvas" style="max-width: 100%; max-height: 100%; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); background: white;"></canvas>
                        
                        <!-- Right Navigation Arrow (Managers Only) -->
                        ${user.role === 'manager' ? `
                        <button id="pdf-next-slide-btn" class="hover-glow" style="position: absolute; right: ${(user.role === 'manager') ? '390px' : '3rem'}; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 50%; background: rgba(15,15,15,0.75); border: 1px solid rgba(255,255,255,0.1); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; z-index: 50; backdrop-filter: blur(10px); box-shadow: 0 10px 30px rgba(0,0,0,0.5);" title="Next Slide">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                        ` : ''}

                      </div>
                ` : currentLesson.gamma_url ? `
                     <div id="gamma-scroller" style="width: 100%; height: 100%; position: relative; padding-right: ${(user.role === 'manager') ? '360px' : '0'}; padding-left: 2rem; padding-top: 2rem; padding-bottom: 2rem; box-sizing: border-box;">
                        <iframe 
                            id="gamma-iframe"
                            src="${(() => {
                                let url = currentLesson.gamma_url;
                                if (!url) return '';
                                if (url.includes('gamma.app') && !url.includes('/embed/')) {
                                    try {
                                        const u = new URL(url);
                                        const pathParts = u.pathname.split('/').filter(Boolean);
                                        if (pathParts.length > 0) {
                                            const slug = pathParts[pathParts.length - 1];
                                            url = 'https://gamma.app/embed/' + slug;
                                        }
                                    } catch(e) {}
                                }
                                return url + '?mode=present';
                            })()}" 
                            style="width: 100%; height: 100%; border: none; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"
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
                <!-- Floating Control Toolbar (Top Right) -->
                <div style="position: absolute; top: 2rem; right: 2rem; z-index: 100; display: flex; align-items: center; gap: 0.75rem;">
                    
                    <!-- Reading Mode Toggle -->
                    <button id="reading-mode-toggle" class="hover-glow" style="background: rgba(15,15,15,0.65); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.85); width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); cursor: pointer; transition: all 0.2s; box-shadow: 0 10px 30px rgba(0,0,0,0.4);" title="Switch to Reading Mode">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #60a5fa;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    </button>

                    <!-- Manager Slide Operations Toolbar -->
                    ${(user.role === 'manager') ? `
                        <div class="glass" style="display: flex; align-items: center; gap: 0.25rem; background: rgba(15,15,15,0.65); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); padding: 0.25rem 0.5rem; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); height: 48px; box-sizing: border-box;">
                            
                            <button id="regenerate-gamma-btn" class="hover-glow" style="background: transparent; border: none; color: rgba(255,255,255,0.85); padding: 0 1rem; height: 36px; border-radius: 18px; display: flex; align-items: center; gap: 0.5rem; justify-content: center; font-size: 0.85rem; font-weight: bold; cursor: pointer; transition: all 0.2s;" title="Regenerate Presentation via AI">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #3b82f6;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                                <span>Regenerate Slides</span>
                            </button>

                            ${currentLesson.gamma_url ? `
                                <div style="width: 1px; height: 16px; background: rgba(255,255,255,0.15); margin: 0 0.25rem;"></div>
                                
                                <button id="update-gamma-btn" class="hover-glow" style="background: transparent; border: none; color: rgba(255,255,255,0.85); padding: 0 1rem; height: 36px; border-radius: 18px; display: flex; align-items: center; gap: 0.5rem; justify-content: center; font-size: 0.85rem; font-weight: bold; cursor: pointer; transition: all 0.2s;" title="Sync Latest Changes from Gamma">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #f59e0b;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                    <span>Update Slides</span>
                                </button>

                                <div style="width: 1px; height: 16px; background: rgba(255,255,255,0.15); margin: 0 0.25rem;"></div>

                                <button id="edit-gamma-btn" onclick="window.open('${currentLesson.gamma_url}', '_blank')" class="hover-glow" style="background: transparent; border: none; color: rgba(255,255,255,0.85); padding: 0 1rem; height: 36px; border-radius: 18px; display: flex; align-items: center; gap: 0.5rem; justify-content: center; font-size: 0.85rem; font-weight: bold; cursor: pointer; transition: all 0.2s;" title="Edit Presentation">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #10b981;"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                    <span>Edit Slides</span>
                                </button>
                            ` : ''}

                        </div>
                    ` : ''}

                </div>
                
                <!-- User Floating Audio Control Bar (Non-Managers Only) -->
                ${(user.role !== 'manager' && (currentLesson.audio_tracks || currentLesson.audio_url)) ? `
                    <div id="user-audio-controls" style="position: absolute; bottom: 3rem; left: 50%; transform: translateX(-50%); z-index: 50; display: flex; align-items: center; gap: 1.5rem; background: rgba(15,15,15,0.85); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); padding: 0.75rem 2rem; border-radius: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); min-width: 480px; width: 60%; max-width: 800px; transition: all 0.3s ease;">
                        <button id="user-play-pause-btn" style="background: var(--primary, #3b82f6); color: white; border: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; flex-shrink: 0; box-shadow: 0 4px 12px rgba(59,130,246,0.3);">
                            <span style="font-size: 0.95rem; margin-left: 2px;">▶</span>
                        </button>
                        <div id="user-slide-number" style="color: rgba(255,255,255,0.6); font-size: 0.85rem; font-weight: 500; font-family: monospace; white-space: nowrap; flex-shrink: 0;">
                            Slide 1 / 1
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.75rem; flex-grow: 1;">
                            <span id="user-current-time" style="color: white; font-size: 0.8rem; font-family: monospace; flex-shrink: 0;">0:00</span>
                            <div id="user-progress-container" style="flex-grow: 1; height: 6px; background: rgba(255,255,255,0.15); border-radius: 3px; cursor: pointer; position: relative; transition: height 0.2s;">
                                <div id="user-progress-bar" style="width: 0%; height: 100%; background: var(--primary, #3b82f6); border-radius: 3px; position: absolute; top: 0; left: 0; transition: width 0.1s linear;"></div>
                            </div>
                            <span id="user-total-time" style="color: rgba(255,255,255,0.5); font-size: 0.8rem; font-family: monospace; flex-shrink: 0;">0:00</span>
                        </div>
                    </div>
                ` : ''}

                <!-- Interactive Sidebar Curriculum (Right) -->
                ${(currentLesson.audio_tracks || currentLesson.audio_url || user.role === 'manager') ? `
                    <div class="interactive-sidebar fade-in" style="position: absolute; top: 6rem; bottom: 2rem; right: 2rem; width: 320px; z-index: 60; display: ${user.role === 'manager' ? 'flex' : 'none'}; flex-direction: column; gap: 1rem;">
                        <div class="glass" style="padding: 1.5rem; border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,0.1); background: rgba(10,10,10,0.75); backdrop-filter: blur(20px); box-shadow: 0 20px 40px rgba(0,0,0,0.5); flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                                <h4 style="margin: 0; font-size: 1rem; color: white; display: flex; align-items: center; gap: 0.5rem;"><span style="color: var(--primary);">🔊</span> Course Audio</h4>
                                ${user.role === 'manager' ? `<button id="inline-edit-audio-btn" class="hover-glow" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; font-size: 0.7rem; padding: 0.3rem 0.6rem; border-radius: 4px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 0.25rem;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>Edit</span></button>` : ''}
                            </div>
                            
                            <div class="audio-tracks-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; padding-right: 0.5rem;">
                                ${(() => {
                                    const tracks = (currentLesson.audio_tracks && currentLesson.audio_tracks.length > 0) ? currentLesson.audio_tracks : (currentLesson.audio_url ? [{ title: 'Full Lesson Audio', url: currentLesson.audio_url }] : []);
                                    if (tracks.length === 0) {
                                        return `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; font-style: italic; margin-top: 2rem;">No audio available</div>`;
                                    }
                                    return tracks.map((track, idx) => `
                                        <div class="audio-track-item ${idx === 0 ? 'active' : ''}" data-track-idx="${idx}" style="padding: 1rem; border-radius: var(--radius-md); background: ${idx === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${idx === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)'}; cursor: pointer; transition: all 0.2s; position: relative;">
                                            <div style="font-size: 0.85rem; font-weight: 600; color: ${idx === 0 ? 'white' : 'var(--text-muted)'}; margin-bottom: 0.5rem;">${track.title || `Slide ${idx + 1}`}</div>
                                            <audio ${idx === 0 ? 'id="lesson-audio"' : ''} class="track-audio" controls src="${track.url}" preload="metadata" style="width: 100%; height: 28px; filter: invert(1) brightness(2) contrast(1.2); opacity: 0.9; outline: none;"></audio>
                                            <div class="next-prompt fade-in" style="display: none; margin-top: 0.75rem; font-size: 0.85rem; color: #10b981; font-weight: bold; text-align: center; background: rgba(16, 185, 129, 0.15); padding: 0.5rem; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.3);">
                                                Advance slide ➔ Play ▶
                                            </div>
                                        </div>
                                    `).join('');
                                })()}
                            </div>
                        </div>

                        <!-- Hidden Audio Editor -->
                        ${user.role === 'manager' ? `
                        <div id="audio-edit-mode" style="display: none; position: absolute; top: 0; bottom: 0; right: 105%; width: 650px; background: rgba(10, 10, 10, 0.96); border: 1px solid rgba(255,255,255,0.2); border-radius: var(--radius-lg); backdrop-filter: blur(20px); box-shadow: 0 20px 40px rgba(0,0,0,0.8); flex-direction: column; overflow: hidden; z-index: 100;">
                            <!-- Sticky Header -->
                            <div style="padding: 2rem 2rem 1rem 2rem; flex-shrink: 0;">
                                <h4 style="margin: 0 0 0.5rem 0; font-size: 1.25rem; color: white;">Manage Audio Tracks</h4>
                                <p style="font-size: 0.95rem; color: var(--text-muted); margin: 0;">Add multiple tracks to correspond to slides.</p>
                            </div>
                            
                            <!-- Scrollable Content -->
                            <div style="flex: 1; overflow-y: auto; padding: 0 2rem 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.5rem;">
                                <div id="audio-tracks-editor" style="display: flex; flex-direction: column; gap: 1.5rem;">
                                    <!-- Populated by JS -->
                                </div>
                                <button id="add-audio-track-btn" class="btn-secondary" style="width: 100%; font-size: 1rem; padding: 0.8rem; margin: 0;">+ Add Track</button>
                            </div>

                            <!-- Sticky Footer -->
                            <div style="padding: 1.25rem 2rem 1.5rem 2rem; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(15, 15, 15, 0.98); display: flex; justify-content: flex-end; gap: 1rem; flex-shrink: 0; border-bottom-left-radius: var(--radius-lg); border-bottom-right-radius: var(--radius-lg);">
                                <button id="cancel-audio-edit" class="btn-ghost" style="height: 42px; padding: 0 1.5rem; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; border-radius: 21px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); cursor: pointer; transition: all 0.2s;">Cancel</button>
                                <button id="save-audio-edit" class="btn-primary" style="height: 42px; padding: 0 1.5rem; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; border-radius: 21px; box-sizing: border-box; cursor: pointer; transition: all 0.2s;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>Save Changes</span></button>
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        <span>Edit Content</span>
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
          <video id="intro-video" playsinline class="intro-video">
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    <span>Edit Quiz</span>
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

    const renderPretestIntro = () => {
        document.body.style.overflow = 'hidden';
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="cp-grid" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; box-sizing: border-box; background: radial-gradient(circle at center, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95)); position: fixed; inset: 0; z-index: 1000; overflow-y: auto;">
                <div class="glass fade-in" style="max-width: 600px; width: 100%; padding: 3rem; border-radius: var(--radius-lg); text-align: center; border: 1px solid var(--glass-border); box-shadow: 0 20px 50px rgba(0,0,0,0.5); backdrop-filter: blur(10px);">
                    <div style="margin-bottom: 2rem;">
                        <div class="logo-badge" style="padding: 0.5rem 1.25rem; border-radius: 12px; background: white; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                            <img src="/fsw_logo_brand.png" alt="FSW Logo" style="height: 36px; width: auto; object-fit: contain;">
                        </div>
                    </div>
                    <h2 class="text-gradient-silver" style="font-size: 2.2rem; margin: 0 0 1rem 0; font-weight: 800; line-height: 1.2;">Diagnostic Pre-Test</h2>
                    <p style="color: rgba(255,255,255,0.85); line-height: 1.6; font-size: 1.05rem; margin-bottom: 2.5rem;">
                        Prove your knowledge upfront to save time. If you pass the diagnostic test for any lesson, you will be exempted from its slides, audio, and activities.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 1rem; align-items: stretch;">
                        <button id="start-pretest-btn" class="btn-primary" style="padding: 1rem 2rem; font-size: 1.1rem; font-weight: bold; border-radius: var(--radius-md); cursor: pointer; border: none;">
                            Take Diagnostic Pre-Test
                        </button>
                        <button id="skip-pretest-btn" class="btn-ghost" style="padding: 1rem 2rem; font-size: 1rem; border: 1px solid var(--glass-border); border-radius: var(--radius-md); cursor: pointer; color: white;">
                            Skip and Do Full Course
                        </button>
                    </div>
                    
                    <div style="margin-top: 2rem;">
                        <button id="exit-pretest-btn" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.9rem; transition: color 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='var(--text-muted)'">
                            ← Exit Course
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('start-pretest-btn').addEventListener('click', () => {
            pretestState = 'testing';
            isActivityComplete = false; // Reset capstone activity state
            mount();
        });

        document.getElementById('skip-pretest-btn').addEventListener('click', async () => {
            if (await fswConfirm('Are you sure you want to skip the pre-test? You will have to sit the full course.')) {
                // Update status in DB to in-progress
                import('../api/courses.js').then(({ saveExemptedLessons }) => {
                    saveExemptedLessons(user.id, course.id, [], 'in-progress');
                });
                pretestState = 'normal';
                mount();
            }
        });

        document.getElementById('exit-pretest-btn').addEventListener('click', () => {
            import('../main').then(m => m.renderMainLayout(user));
        });
    };

    const renderPretestTesting = () => {
        document.body.style.overflow = 'auto';
        const app = document.getElementById('app');

        const totalMCQs = pretestQuestions.length;
        const totalSteps = totalMCQs + (capstoneActivity ? 1 : 0);
        const isOnCapstone = pretestCurrentStep === totalMCQs;
        const progressPct = Math.round((pretestCurrentStep / totalSteps) * 100);

        let stepContentHTML = "";

        if (!isOnCapstone) {
            // Render the single MCQ for the current step
            const q = pretestQuestions[pretestCurrentStep];
            const isSelected = pretestAnswers[pretestCurrentStep] !== undefined;

            stepContentHTML = `
                <div class="pretest-question-card" data-step="${pretestCurrentStep}" style="padding: 2.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-lg); margin-bottom: 2rem;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                        <div style="font-size: 0.8rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1.5px; font-weight: bold;">
                            Module ${q.mIdx + 1} • Lesson: ${q.lessonTitle}
                        </div>
                        ${user.role === 'manager' ? `
                        <button id="inline-edit-pretest-q-btn" class="hover-glow" style="font-size: 0.8rem; border-radius: 4px; padding: 0.3rem 0.6rem; display: flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; cursor: pointer; backdrop-filter: blur(5px); transition: all 0.2s;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            <span>Edit Question</span>
                        </button>
                        ` : ''}
                    </div>
                    
                    <div id="pretest-q-view-mode">
                        <div style="font-size: 1.25rem; font-weight: bold; color: white; margin-bottom: 2rem; line-height: 1.4;">
                            ${pretestCurrentStep + 1}. ${q.question}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.95rem;">
                            ${q.options.map((opt, oIdx) => {
                                const active = pretestAnswers[pretestCurrentStep] === oIdx;
                                return `
                                    <label style="display: flex; align-items: center; gap: 0.85rem; padding: 1rem 1.25rem; background: ${active ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)'}; border: 1px solid ${active ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;" class="pretest-option-label" data-o-idx="${oIdx}">
                                        <input type="radio" name="pretest-q-${pretestCurrentStep}" value="${oIdx}" ${active ? 'checked' : ''} style="width: 1.2rem; height: 1.2rem; cursor: pointer; accent-color: var(--primary);">
                                        <span style="color: ${active ? 'white' : 'rgba(255,255,255,0.85)'}; font-size: 0.95rem;">${opt}</span>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <div id="pretest-q-edit-mode" style="display: none;">
                        <div class="pretest-q-edit-item" style="padding-top: 1rem;">
                            <div style="margin-bottom: 1rem;">
                                <label style="display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Question Text</label>
                                <input type="text" class="edit-pretest-q-text" value="${q.question.replace(/"/g, '&quot;')}" style="width: 100%; box-sizing: border-box; padding: 0.75rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.5); color: white; outline: none;">
                            </div>
                            <div style="margin-bottom: 1rem; padding-left: 1rem; border-left: 2px solid rgba(255,255,255,0.1);">
                                <label style="display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Answers</label>
                                ${q.options.map((opt, oIdx) => `
                                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                        <span style="font-size: 0.8rem; color: ${q.correct_index === oIdx ? '#10b981' : 'var(--text-muted)'}; font-weight: bold; width: 20px;">${String.fromCharCode(65 + oIdx)}.</span>
                                        <input type="text" class="edit-pretest-opt-text" data-oidx="${oIdx}" value="${opt.replace(/"/g, '&quot;')}" style="flex: 1; box-sizing: border-box; padding: 0.5rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.5); color: white; outline: none; border-left-color: ${q.correct_index === oIdx ? '#10b981' : 'rgba(255,255,255,0.2)'}; border-left-width: ${q.correct_index === oIdx ? '4px' : '1px'};">
                                    </div>
                                `).join('')}
                            </div>
                            <div style="margin-bottom: 1rem;">
                                 <label style="display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Explanation (Feedback)</label>
                                 <textarea class="edit-pretest-q-exp" style="width: 100%; box-sizing: border-box; padding: 0.75rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.5); color: white; outline: none; min-height: 60px; font-family: inherit;">${(q.explanation || '').replace(/"/g, '&quot;')}</textarea>
                            </div>
                            <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem;">
                                <button id="inline-edit-pretest-q-cancel" class="btn-ghost" style="padding: 0.5rem 1rem;">Cancel</button>
                                <button id="inline-edit-pretest-q-save" class="btn-primary" style="padding: 0.5rem 1rem;">Save Question</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Render the capstone simulation
            stepContentHTML = `
                <div style="margin-bottom: 2rem; animation: fadeIn 0.3s ease;">
                    <h3 style="color: white; margin: 0 0 0.5rem 0; font-size: 1.35rem; font-weight: 700;">Capstone Simulation Challenge</h3>
                    <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 2rem; line-height: 1.5;">
                        Complete the interactive simulation below to demonstrate your practical application skills. This verifies competency across the entire course.
                    </p>
                    <div class="activity-wrapper" id="pretest-capstone-wrapper" style="margin: 0; background: rgba(0,0,0,0.4); border-radius: var(--radius-md); border: 1px solid var(--glass-border); padding: 1.5rem; min-height: 300px;">
                        <div id="pretest-capstone-container" class="ai-component-container" data-type="${capstoneActivity}" style="margin: 0;"></div>
                        <script type="application/json" id="config-pretest-capstone-container">${JSON.stringify(capstoneConfig)}</script>
                    </div>
                    <div id="capstone-status-badge" style="margin-top: 1.25rem; display: flex; align-items: center; gap: 0.5rem; color: ${isActivityComplete ? '#10b981' : '#ef4444'}; font-weight: bold; font-size: 0.95rem; background: ${isActivityComplete ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; padding: 0.75rem 1.25rem; border-radius: 8px; border: 1px solid ${isActivityComplete ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'};">
                        ${isActivityComplete 
                            ? `<span style="font-size: 1.2rem;">✓</span> Simulation Complete! You can now submit your test.`
                            : `<span style="font-size: 1.2rem;">✗</span> Simulation Pending (Complete the interactive simulation above to unlock pre-test submission)`
                        }
                    </div>
                </div>
            `;
        }

        // Render Wizard Layout
        app.innerHTML = `
            <div style="min-height: 100vh; background: radial-gradient(circle at center, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95)); padding: 3rem 2rem; box-sizing: border-box;">
                <div class="glass fade-in" style="max-width: 800px; width: 100%; margin: 0 auto; padding: 3rem; border-radius: var(--radius-lg); border: 1px solid var(--glass-border); box-shadow: 0 20px 50px rgba(0,0,0,0.5); backdrop-filter: blur(10px);">
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                        <div style="display: flex; align-items: center; gap: 0.85rem;">
                            <div class="logo-badge" style="padding: 0.35rem 0.85rem; border-radius: 8px; background: white; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
                                <img src="/fsw_logo_brand.png" alt="FSW Logo" style="height: 24px; width: auto; object-fit: contain;">
                            </div>
                            <div style="width: 1px; height: 24px; background: rgba(255,255,255,0.15);"></div>
                            <h2 style="margin: 0; color: white; font-size: 1.5rem; font-weight: 800; letter-spacing: 0.5px;">Diagnostic Pre-Test</h2>
                        </div>
                        <button id="cancel-test-btn" class="btn-ghost" style="padding: 0.5rem 1.25rem; font-size: 0.9rem; border: 1px solid var(--glass-border); border-radius: var(--radius-sm); color: white; cursor: pointer;">Cancel</button>
                    </div>

                    <!-- Progress Header -->
                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); font-weight: bold; margin-top: 1.5rem;">
                        <span>
                            ${isOnCapstone 
                                ? 'Final Part: Capstone Practical Simulation' 
                                : `Question ${pretestCurrentStep + 1} of ${totalMCQs}`
                            }
                        </span>
                        <span>${progressPct}% Complete</span>
                    </div>

                    <!-- Progress Bar -->
                    <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin: 0.5rem 0 2.5rem 0; overflow: hidden;">
                        <div style="width: ${progressPct}%; height: 100%; background: var(--primary); transition: width 0.3s ease;"></div>
                    </div>

                    <!-- Step Content -->
                    <div id="wizard-step-body">
                        ${stepContentHTML}
                    </div>

                    <!-- Navigation Footer -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--glass-border); padding-top: 2rem; margin-top: 1rem;">
                        <button id="pretest-prev-btn" class="btn-ghost" style="padding: 0.75rem 1.5rem; border: 1px solid var(--glass-border); color: white; cursor: pointer; opacity: ${pretestCurrentStep > 0 ? '1' : '0.3'};" ${pretestCurrentStep > 0 ? '' : 'disabled'}>
                            ← Previous
                        </button>
                        
                        <div>
                            ${isOnCapstone 
                                ? `
                                <button id="submit-pretest-btn" class="btn-primary" style="padding: 0.75rem 2.5rem; font-weight: bold; border-radius: var(--radius-md); border: none; cursor: ${isActivityComplete ? 'pointer' : 'not-allowed'}; opacity: ${isActivityComplete ? '1' : '0.5'};" ${isActivityComplete ? '' : 'disabled'}>
                                    Submit Pre-Test
                                </button>
                                `
                                : `
                                <button id="pretest-next-btn" class="btn-primary" style="padding: 0.75rem 2.5rem; font-weight: bold; border-radius: var(--radius-md); border: none; cursor: pointer;">
                                    ${pretestCurrentStep === totalMCQs - 1 ? (capstoneActivity ? 'Proceed to Capstone →' : 'Submit Pre-Test') : 'Next Question →'}
                                </button>
                                `
                            }
                        </div>
                    </div>

                </div>
            </div>
        `;

        // MCQ step interaction listeners
        if (!isOnCapstone) {
            document.querySelectorAll('.pretest-option-label').forEach(label => {
                label.addEventListener('click', () => {
                    const oIdx = parseInt(label.dataset.oIdx);
                    pretestAnswers[pretestCurrentStep] = oIdx;

                    // Update styling instantly
                    const container = label.closest('.pretest-question-card');
                    container.querySelectorAll('.pretest-option-label').forEach((lbl, index) => {
                        const radio = lbl.querySelector('input[type="radio"]');
                        const isSelected = index === oIdx;
                        radio.checked = isSelected;
                        lbl.style.background = isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)';
                        lbl.style.borderColor = isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.05)';
                        lbl.querySelector('span').style.color = isSelected ? 'white' : 'rgba(255,255,255,0.85)';
                    });
                });
            });

            // Next button click
            document.getElementById('pretest-next-btn').addEventListener('click', async () => {
                if (user?.role !== 'manager' && pretestAnswers[pretestCurrentStep] === undefined) {
                    await fswAlert('Please select an answer to proceed.');
                    return;
                }

                if (pretestCurrentStep < totalMCQs - 1) {
                    pretestCurrentStep++;
                    renderPretestTesting();
                } else if (pretestCurrentStep === totalMCQs - 1) {
                    if (capstoneActivity) {
                        pretestCurrentStep++;
                        renderPretestTesting();
                    } else {
                        submitTest();
                    }
                }
            });

            // Inline Edit Pretest Question Listeners
            const editBtn = document.getElementById('inline-edit-pretest-q-btn');
            if (editBtn) {
                const viewMode = document.getElementById('pretest-q-view-mode');
                const editMode = document.getElementById('pretest-q-edit-mode');
                const cancelBtn = document.getElementById('inline-edit-pretest-q-cancel');
                const saveBtn = document.getElementById('inline-edit-pretest-q-save');

                // Cache navigation elements we want to disable during edit
                const prevBtn = document.getElementById('pretest-prev-btn');
                const nextBtn = document.getElementById('pretest-next-btn');
                const cancelTestBtn = document.getElementById('cancel-test-btn');

                editBtn.addEventListener('click', () => {
                    viewMode.style.display = 'none';
                    editBtn.style.display = 'none';
                    editMode.style.display = 'block';
                    if (prevBtn) prevBtn.disabled = true;
                    if (nextBtn) nextBtn.disabled = true;
                    if (cancelTestBtn) cancelTestBtn.style.display = 'none';
                });

                cancelBtn.addEventListener('click', () => {
                    editMode.style.display = 'none';
                    viewMode.style.display = 'block';
                    editBtn.style.display = 'flex';
                    if (prevBtn) prevBtn.disabled = pretestCurrentStep === 0;
                    if (nextBtn) nextBtn.disabled = false;
                    if (cancelTestBtn) cancelTestBtn.style.display = 'block';
                });

                saveBtn.addEventListener('click', async () => {
                    const q = pretestQuestions[pretestCurrentStep];
                    
                    const qInput = editMode.querySelector('.edit-pretest-q-text');
                    const expInput = editMode.querySelector('.edit-pretest-q-exp');
                    const optInputs = editMode.querySelectorAll('.edit-pretest-opt-text');

                    if (qInput) q.question = qInput.value;
                    if (expInput) q.explanation = expInput.value;
                    optInputs.forEach(optInput => {
                        const oIdx = parseInt(optInput.dataset.oidx);
                        q.options[oIdx] = optInput.value;
                    });

                    // Sync to original modules array
                    const originalQuiz = modules[q.mIdx].lessons[q.lIdx].quiz[q.qIdx];
                    if (originalQuiz) {
                        originalQuiz.question = q.question;
                        originalQuiz.explanation = q.explanation;
                        originalQuiz.options = [...q.options];
                    }

                    const originalText = saveBtn.innerText;
                    saveBtn.innerText = 'Saving...';
                    saveBtn.disabled = true;

                    try {
                        const { updateCourse } = await import('../api/courses');
                        await updateCourse(course.id, {
                            content_json: modules,
                            updated_at: new Date()
                        });
                        
                        mount(); // Re-render
                    } catch(e) {
                        console.error('Failed to save pretest question edit:', e);
                        await fswAlert("Failed to save changes.");
                        saveBtn.innerText = originalText;
                        saveBtn.disabled = false;
                    }
                });
            }
        } else {
            // Capstone step render
            try {
                if (capstoneActivity === 'ai-tone') renderToneAnalyser('pretest-capstone-container', capstoneConfig);
                if (capstoneActivity === 'ai-dojo') renderDojoChat('pretest-capstone-container', capstoneConfig);
                if (capstoneActivity === 'ai-redline') renderRedline('pretest-capstone-container', capstoneConfig);
                if (capstoneActivity === 'ai-debate') renderDebate('pretest-capstone-container', capstoneConfig);
                if (capstoneActivity === 'ai-swipe') renderDecisionSwipe('pretest-capstone-container', capstoneConfig);
            } catch (e) {
                console.error("Failed to render pretest capstone activity", e);
                const container = document.getElementById('pretest-capstone-container');
                if (container) {
                    container.innerHTML = `<div style="color:red; border:1px solid red; padding:1rem;">Error rendering capstone activity: ${e.message}</div>`;
                }
            }

            // Listen for completion
            if (window.currentActivityListener) {
                document.removeEventListener('lesson-activity-complete', window.currentActivityListener);
            }

            window.currentActivityListener = () => {
                console.log('Capstone Activity Completed!');
                isActivityComplete = true;

                // Update badge and enable button
                const badge = document.getElementById('capstone-status-badge');
                if (badge) {
                    badge.innerHTML = `<span style="font-size: 1.2rem;">✓</span> Simulation Complete! You can now submit your test.`;
                    badge.style.color = '#10b981';
                    badge.style.background = 'rgba(16, 185, 129, 0.1)';
                    badge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
                }

                const submitBtn = document.getElementById('submit-pretest-btn');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.style.cursor = 'pointer';
                    submitBtn.style.opacity = '1';
                }
            };
            document.addEventListener('lesson-activity-complete', window.currentActivityListener, { once: true });

            document.getElementById('submit-pretest-btn').addEventListener('click', submitTest);
        }

        // Common Navigation buttons
        document.getElementById('pretest-prev-btn').addEventListener('click', () => {
            if (pretestCurrentStep > 0) {
                pretestCurrentStep--;
                renderPretestTesting();
            }
        });

        document.getElementById('cancel-test-btn').addEventListener('click', () => {
            pretestState = 'intro';
            pretestCurrentStep = 0;
            mount();
        });

        // Test Submission grading
        function submitTest() {
            let totalCorrect = 0;
            const lessonCorrectMap = {};
            const lessonTotalMap = {};

            pretestQuestions.forEach((q, idx) => {
                const key = `${q.mIdx}_${q.lIdx}`;
                if (!lessonTotalMap[key]) {
                    lessonTotalMap[key] = 0;
                    lessonCorrectMap[key] = 0;
                }
                lessonTotalMap[key]++;

                const selected = pretestAnswers[idx];
                if (selected !== undefined && parseInt(selected) === q.correct_index) {
                    totalCorrect++;
                    lessonCorrectMap[key]++;
                }
            });

            // Calculate exempted lessons
            exemptedLessons = [];
            modules.forEach((mod, mIdx) => {
                mod.lessons.forEach((les, lIdx) => {
                    const key = `${mIdx}_${lIdx}`;
                    const correct = lessonCorrectMap[key] || 0;
                    const total = lessonTotalMap[key] || 0;
                    
                    if (total > 0 && correct === total) {
                        exemptedLessons.push({ m: mIdx, l: lIdx });
                    }
                });
            });

            window.pretestResults = {
                totalCorrect,
                totalQuestions: totalMCQs,
                lessonCorrectMap,
                lessonTotalMap
            };

            pretestState = 'results';
            mount();
        }
    };

    const renderPretestResults = () => {
        document.body.style.overflow = 'hidden';
        const app = document.getElementById('app');
        const results = window.pretestResults;

        const totalCorrect = results?.totalCorrect || 0;
        const totalQuestions = results?.totalQuestions || 0;
        const lessonCorrectMap = results?.lessonCorrectMap || {};
        const lessonTotalMap = results?.lessonTotalMap || {};

        const totalLessonsCount = modules && Array.isArray(modules)
            ? modules.reduce((acc, m) => acc + (m && m.lessons && Array.isArray(m.lessons) ? m.lessons.length : 0), 0)
            : 0;
        const exemptedCount = exemptedLessons.length;

        // Compile breakdown HTML
        const breakdownHTML = modules.map((mod, mIdx) => {
            return `
                <div style="margin-bottom: 1.5rem;">
                    <div style="font-weight: bold; color: white; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; opacity: 0.8;">
                        ${mod.title}
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        ${mod.lessons.map((les, lIdx) => {
                            const key = `${mIdx}_${lIdx}`;
                            const correct = lessonCorrectMap[key] || 0;
                            const total = lessonTotalMap[key] || 0;
                            const isExempt = exemptedLessons.some(el => el.m === mIdx && el.l === lIdx);

                            return `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: rgba(0,0,0,0.25); border-radius: var(--radius-sm); border: 1px solid ${isExempt ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)'};">
                                    <div style="font-size: 0.95rem; color: ${isExempt ? '#10b981' : 'rgba(255,255,255,0.85)'}; display: flex; align-items: center; gap: 0.5rem;">
                                        <span>${isExempt ? '✅' : '📖'}</span>
                                        <span>${les.title}</span>
                                    </div>
                                    <div style="font-size: 0.85rem; font-weight: bold; color: ${isExempt ? '#10b981' : 'var(--text-muted)'};">
                                        ${isExempt ? 'Exempt' : `${correct}/${total} correct`}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');

        app.innerHTML = `
            <div class="cp-grid" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; box-sizing: border-box; background: radial-gradient(circle at center, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95)); position: fixed; inset: 0; z-index: 1000; overflow-y: auto;">
                <div class="glass fade-in" style="max-width: 650px; width: 100%; padding: 3rem; border-radius: var(--radius-lg); border: 1px solid var(--glass-border); box-shadow: 0 20px 50px rgba(0,0,0,0.5); backdrop-filter: blur(10px);">
                    <div style="text-align: center; margin-bottom: 1.5rem;">
                        <div class="logo-badge" style="padding: 0.5rem 1.25rem; border-radius: 12px; background: white; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                            <img src="/fsw_logo_brand.png" alt="FSW Logo" style="height: 36px; width: auto; object-fit: contain;">
                        </div>
                    </div>
                    <h2 class="text-gradient-silver" style="font-size: 2.2rem; margin: 0 0 0.5rem 0; font-weight: 800; text-align: center;">Pre-Test Results</h2>
                    <p style="color: var(--text-muted); text-align: center; margin-bottom: 2rem; font-size: 1.05rem;">
                        Here is your upfront knowledge diagnostic breakdown:
                    </p>

                    <!-- Summary Statistics -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2.5rem; text-align: center;">
                        <div class="glass" style="padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.25rem;">Total Score</div>
                            <div style="font-size: 2rem; font-weight: bold; color: white;">${totalCorrect} / ${totalQuestions}</div>
                        </div>
                        <div class="glass" style="padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.25rem;">Exempted Lessons</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #10b981;">${exemptedCount} / ${totalLessonsCount}</div>
                        </div>
                    </div>

                    <!-- Detail Breakdown list -->
                    <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; padding-right: 0.5rem; margin-bottom: 2.5rem;">
                        ${breakdownHTML}
                    </div>

                    <!-- Action button -->
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <button id="proceed-to-course-btn" class="btn-primary" style="padding: 1rem; font-size: 1.1rem; font-weight: bold; border-radius: var(--radius-md); border: none; cursor: pointer;">
                            ${exemptedCount === totalLessonsCount ? 'Claim Certification' : 'Proceed to Course'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('proceed-to-course-btn').addEventListener('click', async () => {
            const isAllExempt = exemptedCount === totalLessonsCount;
            const newStatus = isAllExempt ? 'completed' : 'in-progress';

            let certId = null;
            let expiresAt = null;
            if (isAllExempt) {
                certId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
                if (course.expiry_months && course.expiry_months > 0) {
                    const d = new Date();
                    d.setMonth(d.getMonth() + parseInt(course.expiry_months));
                    expiresAt = d.toISOString();
                }
            }

            // Save exemptions and status to DB
            try {
                const { saveExemptedLessons } = await import('../api/courses.js');
                await saveExemptedLessons(user.id, course.id, exemptedLessons, newStatus, certId, expiresAt);
            } catch (err) {
                console.error("Failed to save exempted progress:", err);
            }

            if (isAllExempt) {
                // If all lessons were exempted, complete course and issue cert immediately
                completeCourse(true);
            } else {
                // Find first non-exempted lesson
                let firstM = -1;
                let firstL = -1;
                for (let m = 0; m < modules.length; m++) {
                    const mod = modules[m];
                    for (let l = 0; l < mod.lessons.length; l++) {
                        const isExempt = exemptedLessons.some(el => el.m === m && el.l === l);
                        if (!isExempt) {
                            firstM = m;
                            firstL = l;
                            break;
                        }
                    }
                    if (firstM !== -1) break;
                }

                currentModuleIndex = firstM;
                currentLessonIndex = firstL;
                highestModuleIndex = firstM;
                highestLessonIndex = firstL;

                // Show welcome skips toast notification if skipped starting lessons
                if (firstM > 0 || firstL > 0) {
                    showWelcomeSkipNotice = true;
                }

                pretestState = 'normal';
                mount();
            }
        });
    };

    function isLastLesson() {
        return currentModuleIndex === modules.length - 1 &&
            currentLessonIndex === modules[currentModuleIndex].lessons.length - 1
    }

    // Keep track of charts to destroy them before re-rendering
    let activeCharts = [];



    const mount = () => {
        activeCharts.forEach(chart => chart.destroy())
        activeCharts = []

        // Re-compile pre-test questions to ensure they are up to date with any edits
        compilePretest();

        // Pre-test rendering check
        if (pretestState === 'intro') {
            renderPretestIntro();
            return;
        } else if (pretestState === 'testing') {
            renderPretestTesting();
            return;
        } else if (pretestState === 'results') {
            renderPretestResults();
            return;
        }

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
                    let config = {}
                    const rawText = script.textContent.trim()
                    if (rawText && rawText !== 'undefined') {
                        config = JSON.parse(rawText)
                    }

                    if (type === 'ai-tone') renderToneAnalyser(id, config)
                    if (type === 'ai-dojo') renderDojoChat(id, config)
                    if (type === 'ai-redline') renderRedline(id, config)
                    if (type === 'ai-debate') renderDebate(id, config)
                    if (type === 'ai-swipe') renderDecisionSwipe(id, config)

                } catch (e) {
                    console.error(`Error rendering component ${container.dataset.type}`, e)
                    container.innerHTML = `<div style="color:red; border:1px solid red; padding:1rem;">Error rendering AI Component: ${e.message}</div>`
                }
            })

        }, 100)



        // Handle Intro Video
        const overlay = document.getElementById('intro-overlay')
        const video = document.getElementById('intro-video')
        const audio = document.getElementById('lesson-audio')

        if (overlay && video) {
            const finishIntro = () => {
                if (overlay.classList.contains('fade-out')) return;
                overlay.classList.add('fade-out');
                setTimeout(() => overlay.remove(), 1000);
                if (audio) {
                    audio.play().catch(e => console.log('Audio autoplay blocked:', e));
                }
            };

            // Play the intro video automatically.
            // If the browser blocks it, skip the intro and start the lesson immediately.
            video.play()
                .then(() => {
                    video.addEventListener('ended', finishIntro);
                    setTimeout(() => {
                        if (!video.paused) {
                            finishIntro();
                        }
                    }, 6000);
                })
                .catch(e => {
                    console.log('Video autoplay blocked, skipping intro:', e);
                    finishIntro();
                });

        } else if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => overlay.remove(), 1000);
            if (audio) audio.play().catch(e => console.log('Audio play error:', e));
        } else {
            // No intro (e.g. next lesson), play audio immediately
            if (audio) audio.play().catch(e => console.log('Audio play error:', e))
            if (currentLesson.gamma_url) console.log('Lesson loaded')
        }

        attachEvents(currentLes)
        updateNextButtonState()

        // Show welcome skips toast notification if skipped starting lessons
        if (showWelcomeSkipNotice) {
            showWelcomeSkipNotice = false;
            const initialExemptLessons = [];
            modules.forEach((m, mIdx) => {
                m.lessons.forEach((l, lIdx) => {
                    const isExempt = exemptedLessons.some(el => el.m === mIdx && el.l === lIdx);
                    if (isExempt && (mIdx < currentModuleIndex || (mIdx === currentModuleIndex && lIdx < currentLessonIndex))) {
                        initialExemptLessons.push(l.title);
                    }
                });
            });

            if (initialExemptLessons.length > 0) {
                const listStr = initialExemptLessons.length === 1 
                    ? `Lesson "${initialExemptLessons[0]}"`
                    : `Lessons (${initialExemptLessons.join(', ')})`;
                
                setTimeout(() => {
                    const notice = document.createElement('div');
                    notice.className = 'fade-in';
                    notice.innerHTML = `
                        <div style="background: rgba(16, 185, 129, 0.95); color: white; padding: 1.25rem 2rem; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); font-weight: bold; max-width: 500px; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(10px); cursor: pointer;">
                            <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                                <span style="font-size: 1.2rem;">⚡</span>
                                <div>
                                    <div style="font-size: 1rem; margin-bottom: 0.25rem;">Welcome to the course!</div>
                                    <div style="font-size: 0.85rem; font-weight: normal; opacity: 0.9; line-height: 1.4;">
                                        Since you passed the pre-test for ${listStr}, you have been exempted and we started you straight on <strong>${modules[currentModuleIndex].lessons[currentLessonIndex].title}</strong>.
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    notice.style.cssText = "position: fixed; top: 30px; left: 50%; transform: translateX(-50%); z-index: 1100; transition: all 0.5s ease;";
                    document.body.appendChild(notice);
                    
                    notice.addEventListener('click', () => notice.remove());
                    setTimeout(() => { if (notice.parentNode) notice.remove(); }, 8000);
                }, 1200);
            }
        }
        
        // Save progress to DB automatically when mounting a new lesson
        if (!isCourseComplete) {
            import('../api/courses.js').then(({ saveLessonProgress }) => {
                saveLessonProgress(user.id, course.id, currentModuleIndex, currentLessonIndex, highestModuleIndex, highestLessonIndex);
            }).catch(e => console.error('Error importing courses API:', e));
        }
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

    const attachEvents = (currentLesson) => {
        let pdfDoc = null;
        let currentPdfPage = 1;
        let pdfCanvas = document.getElementById('pdf-canvas');
        
        if (pdfCanvas && currentLesson.gamma_pdf_url) {
            const initPdf = async () => {
                try {
                    const pdfjsLib = await import('pdfjs-dist');
                    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
                    const loadingTask = pdfjsLib.getDocument(currentLesson.gamma_pdf_url);
                    pdfDoc = await loadingTask.promise;
                    renderPdfPage(currentPdfPage);
                } catch (e) {
                    console.error("Failed to load PDF:", e);
                }
            };

            const renderPdfPage = async (num) => {
                if (!pdfDoc) return;
                const page = await pdfDoc.getPage(num);
                // Adjust scale for higher resolution
                const viewport = page.getViewport({ scale: 2.0 });
                const ctx = pdfCanvas.getContext('2d');
                pdfCanvas.height = viewport.height;
                pdfCanvas.width = viewport.width;
                await page.render({ canvasContext: ctx, viewport }).promise;
                updatePdfArrowVisibility();
            };

            const goToNextPdfPage = () => {
                if (!pdfDoc || currentPdfPage >= pdfDoc.numPages) return false;
                currentPdfPage++;
                renderPdfPage(currentPdfPage);
                return true;
            };

            const goToPrevPdfPage = () => {
                if (!pdfDoc || currentPdfPage <= 1) return false;
                currentPdfPage--;
                renderPdfPage(currentPdfPage);
                return true;
            };

            const pdfPrevBtn = document.getElementById('pdf-prev-slide-btn');
            const pdfNextBtn = document.getElementById('pdf-next-slide-btn');

            const updatePdfArrowVisibility = () => {
                if (!pdfDoc) return;
                if (pdfPrevBtn) {
                    if (currentPdfPage <= 1) {
                        pdfPrevBtn.style.opacity = '0.15';
                        pdfPrevBtn.style.pointerEvents = 'none';
                    } else {
                        pdfPrevBtn.style.opacity = '1';
                        pdfPrevBtn.style.pointerEvents = 'auto';
                    }
                }
                if (pdfNextBtn) {
                    if (currentPdfPage >= pdfDoc.numPages) {
                        pdfNextBtn.style.opacity = '0.15';
                        pdfNextBtn.style.pointerEvents = 'none';
                    } else {
                        pdfNextBtn.style.opacity = '1';
                        pdfNextBtn.style.pointerEvents = 'auto';
                    }
                }
            };

            initPdf();

            // Link audio track ending to next PDF page
            const audioElements = document.querySelectorAll('.track-audio');
            audioElements.forEach((audio, idx) => {
                audio.addEventListener('ended', () => {
                    const didAdvance = goToNextPdfPage();
                    if (didAdvance && idx + 1 < audioElements.length) {
                        const nextAudio = audioElements[idx + 1];
                        nextAudio.play();
                        document.querySelectorAll('.audio-track-item').forEach(el => el.classList.remove('active'));
                        audioElements[idx + 1].closest('.audio-track-item').classList.add('active');
                    }
                });
                
                audio.addEventListener('play', () => {
                     if (pdfDoc && idx + 1 !== currentPdfPage) {
                          currentPdfPage = idx + 1;
                          renderPdfPage(currentPdfPage);
                     }
                });
            });

            // Slide Navigation Arrows Click Events
            if (pdfPrevBtn) {
                pdfPrevBtn.addEventListener('click', () => {
                    let playingIdx = -1;
                    audioElements.forEach((a, i) => { if (!a.paused && !a.ended) playingIdx = i; });
                    
                    const didRegress = goToPrevPdfPage();
                    if (didRegress) {
                        const targetIdx = currentPdfPage - 1;
                        if (playingIdx >= 0) {
                            audioElements[playingIdx].pause();
                            audioElements[playingIdx].currentTime = 0;
                        }
                        if (targetIdx >= 0 && targetIdx < audioElements.length) {
                            if (playingIdx >= 0) {
                                audioElements[targetIdx].play().catch(e => console.log(e));
                            }
                            document.querySelectorAll('.audio-track-item').forEach(el => el.classList.remove('active'));
                            const activeItem = audioElements[targetIdx].closest('.audio-track-item');
                            if (activeItem) activeItem.classList.add('active');
                        }
                    }
                });
            }

            if (pdfNextBtn) {
                pdfNextBtn.addEventListener('click', () => {
                    let playingIdx = -1;
                    audioElements.forEach((a, i) => { if (!a.paused && !a.ended) playingIdx = i; });
                    
                    const didAdvance = goToNextPdfPage();
                    if (didAdvance) {
                        const targetIdx = currentPdfPage - 1;
                        if (playingIdx >= 0) {
                            audioElements[playingIdx].pause();
                            audioElements[playingIdx].currentTime = 0;
                        }
                        if (targetIdx >= 0 && targetIdx < audioElements.length) {
                            if (playingIdx >= 0) {
                                audioElements[targetIdx].play().catch(e => console.log(e));
                            }
                            document.querySelectorAll('.audio-track-item').forEach(el => el.classList.remove('active'));
                            const activeItem = audioElements[targetIdx].closest('.audio-track-item');
                            if (activeItem) activeItem.classList.add('active');
                        }
                    }
                });
            }


            // User Floating Audio Controls Logic
            const userControls = document.getElementById('user-audio-controls');
            if (userControls) {
                const userPlayBtn = document.getElementById('user-play-pause-btn');
                const userSlideNum = document.getElementById('user-slide-number');
                const userCurTime = document.getElementById('user-current-time');
                const userTotTime = document.getElementById('user-total-time');
                const userProgBar = document.getElementById('user-progress-bar');
                const userProgCont = document.getElementById('user-progress-container');

                let activeAudio = audioElements[0];

                const formatTime = (secs) => {
                    if (isNaN(secs)) return '0:00';
                    const m = Math.floor(secs / 60);
                    const s = Math.floor(secs % 60).toString().padStart(2, '0');
                    return `${m}:${s}`;
                };

                const updateControlsState = () => {
                    if (!activeAudio) return;
                    
                    const currentIdx = Array.from(audioElements).indexOf(activeAudio);
                    userSlideNum.innerText = `Slide ${currentIdx + 1} / ${audioElements.length}`;
                    
                    if (activeAudio.paused) {
                        userPlayBtn.innerHTML = '<span style="font-size: 0.95rem; margin-left: 2px;">▶</span>';
                    } else {
                        userPlayBtn.innerHTML = '<span style="font-size: 0.95rem;">||</span>';
                    }
                    
                    userCurTime.innerText = formatTime(activeAudio.currentTime);
                    userTotTime.innerText = formatTime(activeAudio.duration || (activeAudio.buffered.length ? activeAudio.duration : 0));
                    
                    if (activeAudio.duration) {
                        const pct = (activeAudio.currentTime / activeAudio.duration) * 100;
                        userProgBar.style.width = `${pct}%`;
                    }
                };

                userPlayBtn.addEventListener('click', () => {
                    if (!activeAudio) return;
                    if (activeAudio.paused) {
                        activeAudio.play().catch(e => console.log(e));
                    } else {
                        activeAudio.pause();
                    }
                    updateControlsState();
                });

                userProgCont.addEventListener('click', (e) => {
                    if (!activeAudio || !activeAudio.duration) return;
                    const rect = userProgCont.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const width = rect.width;
                    const pct = Math.max(0, Math.min(1, clickX / width));
                    activeAudio.currentTime = pct * activeAudio.duration;
                    updateControlsState();
                });

                userProgCont.addEventListener('mouseenter', () => {
                    userProgCont.style.height = '8px';
                });
                userProgCont.addEventListener('mouseleave', () => {
                    userProgCont.style.height = '6px';
                });

                audioElements.forEach((audio, idx) => {
                    audio.addEventListener('play', () => {
                        activeAudio = audio;
                        updateControlsState();
                    });
                    
                    audio.addEventListener('pause', () => {
                        if (activeAudio === audio) updateControlsState();
                    });
                    
                    audio.addEventListener('timeupdate', () => {
                        if (activeAudio === audio) {
                            userCurTime.innerText = formatTime(audio.currentTime);
                            if (audio.duration) {
                                const pct = (audio.currentTime / audio.duration) * 100;
                                userProgBar.style.width = `${pct}%`;
                            }
                        }
                    });
                    
                    audio.addEventListener('durationchange', () => {
                        if (activeAudio === audio) {
                            userTotTime.innerText = formatTime(audio.duration);
                        }
                    });
                    
                    audio.addEventListener('loadedmetadata', () => {
                        if (activeAudio === audio) {
                            userTotTime.innerText = formatTime(audio.duration);
                        }
                    });
                });

                updateControlsState();
            }
        }

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
                    if (!document.getElementById('easymde-script')) {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.id = 'easymde-script';
                            script.src = 'https://unpkg.com/easymde/dist/easymde.min.js';
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        });
                    }
                    const EasyMDE = window.EasyMDE;
                    
                    if (!document.getElementById('easymde-css')) {
                        const link = document.createElement('link');
                        link.id = 'easymde-css';
                        link.rel = 'stylesheet';
                        link.href = 'https://unpkg.com/easymde/dist/easymde.min.css';
                        document.head.appendChild(link);
                    }
                    
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
            const addTrackBtn = document.getElementById('add-audio-track-btn');
            const editorContainer = document.getElementById('audio-tracks-editor');
            const currentLesson = modules[currentModuleIndex].lessons[currentLessonIndex];

            // Local state for editing
            let editingTracks = [];

            const renderTracksEditor = () => {
                editorContainer.innerHTML = '';
                editingTracks.forEach((track, idx) => {
                    const el = document.createElement('div');
                    el.style.cssText = 'background: rgba(255,255,255,0.05); padding: 1.25rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 0.75rem; position: relative;';
                    el.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <input type="text" class="edit-track-title" value="${track.title || `Slide ${idx + 1}`}" style="background: transparent; border: none; color: white; font-size: 1.05rem; font-weight: bold; outline: none; width: 70%;">
                            <div>
                                <button class="btn-ghost remove-track-btn" style="padding: 0.3rem 0.6rem; font-size: 0.85rem; color: #ef4444;">Remove</button>
                            </div>
                        </div>
                        <textarea class="edit-track-script" style="width: 100%; height: 120px; background: rgba(0,0,0,0.5); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 0.75rem; font-family: inherit; font-size: 1rem; outline: none; resize: vertical; line-height: 1.5;">${track.script || ''}</textarea>
                        ${track.url ? `<audio controls src="${track.url}" style="width: 100%; height: 32px; filter: invert(1); margin-top: 0.5rem;"></audio>` : ''}
                        <button class="btn-secondary generate-single-track-btn" style="padding: 0.5rem 1rem; font-size: 0.9rem; align-self: flex-start; margin-top: 0.5rem; display: flex; align-items: center; gap: 0.4rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg><span>Generate Audio</span></button>
                    `;

                    // Remove track
                    el.querySelector('.remove-track-btn').addEventListener('click', () => {
                        editingTracks.splice(idx, 1);
                        renderTracksEditor();
                    });

                    // Update title/script on input
                    el.querySelector('.edit-track-title').addEventListener('input', (e) => track.title = e.target.value);
                    el.querySelector('.edit-track-script').addEventListener('input', (e) => track.script = e.target.value);

                    // Generate single track
                    const generateBtn = el.querySelector('.generate-single-track-btn');
                    generateBtn.addEventListener('click', async () => {
                        if (!track.script) return;
                        const origHtml = generateBtn.innerHTML;
                        generateBtn.innerHTML = 'Generating...';
                        generateBtn.disabled = true;
                        try {
                            const { createAudio } = await import('../api/elevenlabs.js');
                            const url = await createAudio(track.script);
                            track.url = url;
                            renderTracksEditor(); // Re-render to show new audio player
                        } catch(e) {
                            console.error('Audio error', e);
                            alert('Failed to generate audio for this track.');
                        } finally {
                            if (generateBtn) { generateBtn.innerHTML = origHtml; generateBtn.disabled = false; }
                        }
                    });

                    editorContainer.appendChild(el);
                });
            };

            editAudioBtn.addEventListener('click', () => {
                // Initialize local state
                if (currentLesson.audio_tracks && currentLesson.audio_tracks.length > 0) {
                    editingTracks = JSON.parse(JSON.stringify(currentLesson.audio_tracks)); // deep clone
                } else if (currentLesson.audio_url || currentLesson.audio_script) {
                    editingTracks = [{ title: 'Full Audio', script: currentLesson.audio_script || '', url: currentLesson.audio_url }];
                } else {
                    editingTracks = [{ title: 'Slide 1', script: '', url: null }];
                }
                
                renderTracksEditor();
                audioEditMode.style.display = 'flex';
            });

            addTrackBtn.addEventListener('click', () => {
                editingTracks.push({ title: `Slide ${editingTracks.length + 1}`, script: '', url: null });
                renderTracksEditor();
            });

            cancelAudioBtn.addEventListener('click', () => {
                audioEditMode.style.display = 'none';
            });

            saveAudioBtn.addEventListener('click', async () => {
                const originalText = saveAudioBtn.innerHTML;
                saveAudioBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>Saving...</span>';
                saveAudioBtn.disabled = true;

                try {
                    // Update lesson data
                    currentLesson.audio_tracks = editingTracks;
                    if (editingTracks.length > 0) {
                        currentLesson.audio_url = editingTracks[0].url; // backwards compat
                    }

                    // Update DB
                    const { updateCourse } = await import('../api/courses');
                    await updateCourse(course.id, {
                        content_json: modules,
                        updated_at: new Date()
                    });
                    
                    mount(); // Re-render
                } catch(e) {
                    console.error('Failed to save audio:', e);
                    const { fswAlert } = await import('../utils/dialog.js');
                    await fswAlert("Failed to save changes.");
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
                        const { createPresentation, exportAndUploadPdf } = await import('../api/gamma.js?t=' + Date.now());
                        const l = modules[currentModuleIndex].lessons[currentLessonIndex];
                        const input = l.presentation_input || l.audio_script || l.content;
                        
                        regenGammaBtn.querySelector('span').innerText = '🔄 Generating slides...';
                        const gammaResult = await createPresentation(l.title, input);
                        
                        if (gammaResult && gammaResult.id) {
                            l.gamma_url = gammaResult.url;
                            l.gamma_id = gammaResult.id;
                            
                            regenGammaBtn.querySelector('span').innerText = '🔄 Downloading PDF...';
                            const pdfUrl = await exportAndUploadPdf(gammaResult.id);
                            l.gamma_pdf_url = pdfUrl;

                            const { updateCourse } = await import('../api/courses.js');
                            await updateCourse(course.id, { content_json: modules, updated_at: new Date() });
                            mount();
                        } else {
                            throw new Error("Gamma returned null");
                        }
                    } catch (e) {
                         console.error('Failed to regenerate presentation:', e);
                         await fswAlert("Failed to regenerate presentation: " + e.message);
                    } finally {
                        if (document.getElementById('regenerate-gamma-btn')) {
                            document.getElementById('regenerate-gamma-btn').querySelector('span').innerText = '🔄 Regenerate Slides';
                            document.getElementById('regenerate-gamma-btn').disabled = false;
                        }
                    }
                }
            });
        }

        // Update Gamma Logic
        const updateGammaBtn = document.getElementById('update-gamma-btn');
        if (updateGammaBtn) {
            updateGammaBtn.addEventListener('click', async () => {
                const { fswConfirm, fswAlert } = await import('../utils/dialog.js');
                if (await fswConfirm("Sync the latest changes from Gamma into the course? This will download the latest version as a PDF.")) {
                    updateGammaBtn.querySelector('span').innerText = '⬇️ Syncing...';
                    updateGammaBtn.disabled = true;
                    try {
                        const { exportAndUploadPdf } = await import('../api/gamma.js?t=' + Date.now());
                        const l = modules[currentModuleIndex].lessons[currentLessonIndex];
                        
                        if (!l.gamma_id) throw new Error("No Gamma ID found. Please regenerate slides first.");

                        const pdfUrl = await exportAndUploadPdf(l.gamma_id);
                        l.gamma_pdf_url = pdfUrl;

                        const { updateCourse } = await import('../api/courses.js');
                        await updateCourse(course.id, { content_json: modules, updated_at: new Date() });
                        mount();
                    } catch (e) {
                         console.error('Failed to update presentation:', e);
                         await fswAlert("Failed to update presentation: " + e.message);
                    } finally {
                        if (document.getElementById('update-gamma-btn')) {
                            document.getElementById('update-gamma-btn').querySelector('span').innerText = '⬇️ Update Slides';
                            document.getElementById('update-gamma-btn').disabled = false;
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

        const moveToNextLesson = async () => {
            let nextM = currentModuleIndex;
            let nextL = currentLessonIndex;
            let skippedList = [];

            while (true) {
                if (nextL < modules[nextM].lessons.length - 1) {
                    nextL++;
                } else if (nextM < modules.length - 1) {
                    nextM++;
                    nextL = 0;
                } else {
                    // No more lessons
                    await completeCourse();
                    return;
                }

                const isExempt = exemptedLessons.some(el => el.m === nextM && el.l === nextL);
                if (isExempt) {
                    skippedList.push(modules[nextM].lessons[nextL].title);
                } else {
                    break;
                }
            }

            // Update indices
            currentModuleIndex = nextM;
            currentLessonIndex = nextL;

            if (currentModuleIndex > highestModuleIndex || (currentModuleIndex === highestModuleIndex && currentLessonIndex > highestLessonIndex)) {
                highestModuleIndex = currentModuleIndex;
                highestLessonIndex = currentLessonIndex;
            }

            // If we skipped any lessons, show a toast notification
            if (skippedList.length > 0) {
                const skippedNames = skippedList.length === 1 
                    ? `Lesson "${skippedList[0]}"` 
                    : `Lessons (${skippedList.join(', ')})`;
                
                const toast = document.createElement('div');
                toast.className = 'fade-in';
                toast.innerHTML = `<div style="background: rgba(16, 185, 129, 0.9); color: white; padding: 0.75rem 1.5rem; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-size: 0.9rem; font-weight: bold; border: 1px solid rgba(255,255,255,0.15);">⚡ Skipping ${skippedNames} (Exempt upfront)</div>`;
                toast.style.cssText = "position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); z-index: 1000;";
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 4000);
            }

            mount();
        };

        const moveToPrevLesson = () => {
            let prevM = currentModuleIndex;
            let prevL = currentLessonIndex;

            while (true) {
                if (prevL > 0) {
                    prevL--;
                } else if (prevM > 0) {
                    prevM--;
                    prevL = modules[prevM].lessons.length - 1;
                } else {
                    // No previous lessons
                    return;
                }

                const isExempt = exemptedLessons.some(el => el.m === prevM && el.l === prevL);
                if (!isExempt) {
                    break;
                }
            }

            currentModuleIndex = prevM;
            currentLessonIndex = prevL;
            mount();
        };

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                moveToPrevLesson();
            })
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', async () => {
                if (!isQuizComplete || !isActivityComplete) return; // double check
                
                if (isLastLesson()) {
                    await completeCourse();
                } else {
                    await moveToNextLesson();
                }
            })
        }

        // Sequential Audio Track Logic
        const trackItems = document.querySelectorAll('.audio-track-item');
        trackItems.forEach((item, index) => {
            const audioEl = item.querySelector('.track-audio');
            
            // Handle clicking a track card
            item.addEventListener('click', (e) => {
                // If they clicked the audio controls directly, let the browser handle it
                if (e.target.tagName === 'AUDIO') return;
                
                // Pause all other tracks
                document.querySelectorAll('.track-audio').forEach(a => { if (a !== audioEl) a.pause() });
                
                // Toggle play/pause
                if (audioEl.paused) {
                    audioEl.play();
                } else {
                    audioEl.pause();
                }
            });

            audioEl.addEventListener('play', () => {
                // Make active
                trackItems.forEach(t => {
                    t.classList.remove('active');
                    t.style.background = 'rgba(255,255,255,0.03)';
                    t.style.borderColor = 'rgba(255,255,255,0.05)';
                    t.querySelector('div').style.color = 'var(--text-muted)';
                    t.style.animation = 'none';
                    const prompt = t.querySelector('.next-prompt');
                    if (prompt) prompt.style.display = 'none';
                });
                item.classList.add('active');
                item.style.background = 'rgba(255,255,255,0.1)';
                item.style.borderColor = 'rgba(255,255,255,0.2)';
                item.style.animation = 'none';
                item.querySelector('div').style.color = 'white';
            });

            audioEl.addEventListener('ended', () => {
                // Highlight next track if it exists
                if (index + 1 < trackItems.length) {
                    const nextItem = trackItems[index + 1];
                    const nextPrompt = nextItem.querySelector('.next-prompt');
                    if (nextPrompt) nextPrompt.style.display = 'block';
                    
                    nextItem.style.background = 'rgba(16, 185, 129, 0.15)';
                    nextItem.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                    nextItem.style.animation = 'pulse 2s infinite';
                    nextItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    // All audio finished, switch to reading mode
                    const grid = document.querySelector('.cp-grid');
                    if (grid) {
                        grid.classList.remove('cinema-mode');
                        grid.classList.add('reading-mode');
                        const overlay = document.getElementById('visuals-overlay');
                        if (overlay) overlay.style.display = 'block';
                    }
                }
            });
        });


    }

    async function completeCourse(skipDBSave = false) {
        let container = document.querySelector('main') || document.getElementById('app')
        // Use a formatted date
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

        // Render Certificate
        if (container) {
            container.innerHTML = renderCertificate(course.title, user.full_name || user.email.split('@')[0], date) 
        }

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

        if (!skipDBSave) {
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
    }

    mount()
}
