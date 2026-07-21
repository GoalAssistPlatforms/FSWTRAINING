import { createCourse, updateCourse } from '../api/courses.js';
import { fetchSystemTags } from '../api/guides.js';
import { supabase } from '../api/supabase.js';
import { fswAlert, fswConfirm } from '../utils/dialog';
import {
    getVisibleSegments,
    getVisibleDuration,
    visibleToSourceTime,
    sourceToVisibleTime,
    getNextVisibleTime,
    normalizeEdits
} from '../utils/videoPlaybackController.js';
import { PlaybackCoordinator } from '../features/videoEditor/controllers/PlaybackCoordinator.js';
import { migrateLegacyEditsToSequence, getSequenceGaps } from '../features/videoEditor/services/playbackSequenceService.js';
import { isSequencePlaybackEnabled, isSequenceTimelineEditingEnabled, isSequenceTranscriptViewerActive } from '../features/videoEditor/config/playbackFeatureFlags.js';
import { TranscriptionService } from '../features/videoEditor/services/transcriptionService.ts';
import { TranscriptionJobController } from '../features/videoEditor/controllers/TranscriptionJobController.ts';
import { TranscriptViewerController } from '../features/videoEditor/controllers/TranscriptViewerController.ts';
import { TranscriptionUIController } from '../features/videoEditor/controllers/TranscriptionUIController.ts';
import { createSourceAsset } from '../features/videoEditor/persistence/projectRepository.ts';
import { TimelineEditorController } from '../features/videoEditor/controllers/TimelineEditorController.js';
import { AutosaveController } from '../features/videoEditor/controllers/AutosaveController.js';
import { loadProjectState, persistEditorProjectUpdate } from '../features/videoEditor/services/projectService.js';
import { visibleTimeToSourceTime as seqVisibleToSourceTime, sourceTimeToVisibleTime as seqSourceToVisibleTime } from '../features/videoEditor/domain/timeMapping.js';
import {
    buildPauseShorteningPlan,
    detectTranscriptPauses,
    PAUSE_RETAIN_SECONDS,
    PAUSE_THRESHOLD_SECONDS
} from '../features/videoEditor/services/pauseEditingService.ts';

export const renderSystemBuilder = () => {
    return `
    <div id="sys-builder-root" class="glass fade-in" style="padding: 2rem; border-radius: var(--radius-lg); position: relative; height: 100%; display: flex; flex-direction: column; transition: all 0.3s ease; overflow: hidden; box-sizing: border-box;">

        <div id="sys-builder-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem; margin-bottom: 1rem; flex-shrink: 0;">
            <div>
                <h2 id="sys-header-title" style="margin: 0; color: var(--text-main);">Interactive Guide Builder</h2>
                <p id="sys-builder-subtitle" style="margin: 0.5rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">Create a step-by-step interactive software guide.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
                <span id="sys-save-status" style="font-size: 0.85rem; display: none;"></span>
                <button id="sys-toggle-meta-btn" class="btn-ghost" style="display: none; border: 1px solid var(--glass-border); padding: 0.5rem 1rem; border-radius: var(--radius-md); color: var(--text-main); cursor: pointer; font-size: 0.85rem; align-items: center; gap: 0.5rem;">Guide Details <span style="font-size: 0.7rem;">▼</span></button>
                <button id="sys-replace-video-btn" class="btn-ghost" style="display: none; border: 1px solid rgba(239, 68, 68, 0.5); padding: 0.5rem 1rem; border-radius: var(--radius-md); color: #ef4444; cursor: pointer; font-size: 0.85rem;">Replace Recording</button>
                <button id="sys-cancel-btn" class="btn-ghost">Cancel</button>
                <button id="sys-draft-btn" class="btn-ghost" style="border: 1px solid var(--glass-border); padding: 0.6rem 1.2rem; border-radius: var(--radius-md); color: var(--text-main); cursor: pointer;" disabled>Save Draft</button>
                <button id="sys-save-btn" class="btn-primary" disabled>Publish Guide</button>
            </div>
        </div>

        <!-- Meta Setup -->
        <div id="sys-meta-step" style="display: flex; gap: 3.5rem; align-items: stretch; width: 100%; box-sizing: border-box; flex-shrink: 0; transition: max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease, padding 0.3s ease; overflow: hidden; max-height: 1000px;">
            <div id="sys-guide-details-fields" style="flex: 1; display: flex; flex-direction: column;">
                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Interactive Guide Title</label>
                <input type="text" id="sys-title" placeholder="e.g. Sage 50: Raising a Purchase Order" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: var(--pretest-input-bg); border: 1px solid var(--pretest-input-border); color: var(--text-main); color: var(--text-main); margin-bottom: 1rem; box-sizing: border-box; outline: none;">

                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Short Description</label>
                <textarea id="sys-desc" rows="4" placeholder="Briefly explain what the user will learn to do..." style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: var(--pretest-input-bg); border: 1px solid var(--pretest-input-border); color: var(--text-main); color: var(--text-main); margin-bottom: 1rem; resize: none; box-sizing: border-box; outline: none; flex: 1; min-height: 110px;"></textarea>

                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Tags (comma separated)</label>
                <input type="text" id="sys-tags" list="sys-tags-list" placeholder="e.g. Sage 50, Sales" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: var(--pretest-input-bg); border: 1px solid var(--pretest-input-border); color: var(--text-main); color: var(--text-main); margin-bottom: 0; box-sizing: border-box; outline: none;">
                <datalist id="sys-tags-list"></datalist>
            </div>

            <div id="sys-walkthrough-setup-wrapper" style="flex: 1; display: flex; flex-direction: column;">
                 <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Walkthrough Setup</label>

                 <!-- Screen Record Zone -->
                 <div id="sys-panel-record" style="display: flex; flex: 1; border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 1.5rem; background: var(--pretest-q-card-bg); flex-direction: column; align-items: center; justify-content: center; gap: 1rem; text-align: center; min-height: 220px;">
                     <div id="rec-setup-ui" style="width: 100%;">
                         <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🎙️ Screen & Voice Walkthrough</div>
                         <p style="color: var(--text-muted); font-size: 0.8rem; margin: 0 0 1.2rem 0; max-width: 380px; margin-left: auto; margin-right: auto; line-height: 1.4;">Record your screen and speak out loud explaining what you are doing. The AI will automatically clean up your speech, create structured timeline steps, and build an interactive video walkthrough!</p>
                          <button id="sys-start-rec-btn" class="btn-primary" style="display: inline-flex; align-items: center; gap: 0.6rem; background: #ef4444; border-color: #ef4444; color: var(--text-main); cursor: pointer;">
                              <span style="display: inline-block; width: 10px; height: 10px; background: white; border-radius: 50%; animation: pulse-dot 1.5s infinite;"></span>
                              Start Walkthrough Recording
                          </button>

                          <div style="margin: 0.8rem 0; display: flex; align-items: center; justify-content: center; gap: 0.5rem; opacity: 0.5;">
                              <div style="height: 1px; width: 60px; background: white;"></div>
                              <span style="font-size: 0.8rem; font-weight: bold; text-transform: uppercase;">OR</span>
                              <div style="height: 1px; width: 60px; background: white;"></div>
                          </div>

                          <div style="display: flex; flex-direction: column; align-items: center;">
                              <label for="sys-upload-video-input" class="btn-ghost" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.2rem; border: 1px solid var(--glass-border); border-radius: var(--radius-md); color: var(--text-main); cursor: pointer; transition: all 0.2s; background: var(--pretest-q-card-bg);" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                  Upload screen recording (.mp4)
                              </label>
                              <input type="file" id="sys-upload-video-input" accept="video/mp4" style="display: none;">
                          </div>
                     </div>

                     <div id="rec-live-ui" style="display: none; flex-direction: column; align-items: center; gap: 0.6rem;">
                          <div style="color: #ef4444; font-weight: bold; display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem;">
                              <span style="display: inline-block; width: 12px; height: 12px; background: #ef4444; border-radius: 50%; animation: pulse-dot 1s infinite;"></span>
                              RECORDING WALKTHROUGH...
                          </div>
                          <div id="rec-timer" style="font-size: 1.5rem; font-family: monospace; color: var(--text-main);">00:00</div>

                          <!-- Live mic volume indicator -->
                          <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.1rem; margin-bottom: 0.4rem;">
                              <span style="font-size: 0.75rem; color: var(--text-muted);">🎙️ Mic Level:</span>
                              <div style="width: 100px; height: 8px; background: rgba(255,255,255,0.15); border-radius: 4px; overflow: hidden; border: 1px solid var(--glass-border);">
                                  <div id="rec-volume-bar" style="height: 100%; width: 0%; background: #10b981; border-radius: 4px; transition: width 0.08s ease;"></div>
                              </div>
                          </div>

                          <button id="sys-stop-rec-btn" class="btn-ghost" style="border: 1px solid #ef4444; color: #ef4444; padding: 0.5rem 1.5rem; font-weight: 600; cursor: pointer; border-radius: 4px;">
                              Stop Recording
                          </button>
                      </div>

                     <div id="rec-progress-ui" style="display: none; flex-direction: column; align-items: center; gap: 0.8rem; width: 100%;">
                         <div class="loader" style="border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid var(--primary); border-radius: 50%; width: 32px; height: 32px; animation: spin 1s linear infinite;"></div>
                         <div id="rec-progress-msg" style="color: var(--text-main); font-size: 0.95rem; font-weight: 600;">AI Auto-Pilot processing walkthrough...</div>
                         <div style="background: rgba(255,255,255,0.1); border-radius: 10px; width: 80%; height: 6px; overflow: hidden; position: relative; margin-top: 0.5rem;">
                             <div id="rec-progress-bar" style="background: var(--primary); width: 10%; height: 100%; transition: width 0.4s;"></div>
                         </div>
                     </div>
                 </div>
            </div>
        </div>

        <!-- Timeline Video Walkthrough Editor -->
        <div id="sys-editor-step" style="display: none; flex-direction: column; flex: 1; overflow: hidden; margin-top: 1rem;">

             <!-- Editor Area -->
             <div class="sys-editor-area-flex" style="display: flex; gap: 1.5rem; flex: 1; overflow: hidden;">

                 <!-- Video & Transcript Container -->
                 <div class="sys-video-and-transcript-container" style="flex: 0 0 65%; display: flex; gap: 1rem; flex-direction: column; min-width: 0; overflow: hidden;">
                      <!-- Video Walkthrough Player -->
                      <div class="sys-video-player-container" style="background: rgba(0,0,0,0.5); border-radius: var(--radius-md); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--glass-border); width: 100%; flex-shrink: 0;">
                     <div style="background: rgba(0,0,0,0.6); padding: 0.75rem 1rem; font-weight: bold; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
                         <span style="font-size: 1.1rem;">Recorded Walkthrough</span>
                         <div style="display: flex; gap: 0.5rem; align-items: center;">
                              <button id="sys-undo-btn" class="btn-ghost" type="button" disabled title="Undo the last video cut or transcript removal from this editing session" style="border: 1px solid var(--glass-border); padding: 0.45rem 0.75rem; border-radius: 6px; color: var(--text-main); cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; opacity: 0.45;">↩ Undo cut</button>
                              <button id="sys-redo-btn" class="btn-ghost" type="button" disabled title="Redo the last video cut or transcript removal from this editing session" style="border: 1px solid var(--glass-border); padding: 0.45rem 0.75rem; border-radius: 6px; color: var(--text-main); cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; opacity: 0.45;">↪ Redo cut</button>
                              <button id="sys-add-step-here-btn" class="btn-primary" style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 1rem; font-size: 0.8rem; font-weight: 600; background: #10b981; border: none; color: var(--text-main); cursor: pointer; border-radius: 6px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);" onmouseover="this.style.background='#059669'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='#10b981'; this.style.transform='translateY(0)';" >
                                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                   Add step at current time
                               </button>
                         </div>
                     </div>
                     <div style="position: relative; flex: 1; display: flex; flex-direction: column; background: black;">
                          <video id="sys-editor-video" controls style="width: 100%; flex: 1; background: black; display: block;"></video>

                          <!-- Automatic Timeline Magnification Track (Shows above normal timeline only during dragging) -->
                          <div id="sys-magnified-track-container" style="display: none; height: 40px; background: rgba(10,10,12,0.95); border-top: 1px solid var(--glass-border); position: relative; overflow: hidden; padding: 0 1rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                              <canvas id="sys-magnified-waveform-canvas" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; opacity: 0.3; pointer-events: none;"></canvas>
                              <div id="sys-magnified-handle-indicator" style="position: absolute; top: 0; bottom: 0; width: 2px; background: var(--primary); left: 50%; z-index: 10;"></div>
                              <div id="sys-magnified-ruler" style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none;"></div>
                          </div>

                          <!-- Master Custom Timeline Bar Container -->
                          <div id="sys-player-timeline-container" style="display: none; padding: 0.75rem 1rem; background: rgba(10,10,12,0.9); border-top: 1px solid var(--glass-border); flex-direction: column; gap: 0.5rem; user-select: none;">

                              <!-- Draggable Join Previews Row (Floating above the scrubber) -->
                              <div id="sys-join-previews-container" style="display: none; justify-content: space-between; align-items: center; pointer-events: none; margin-bottom: 0.25rem;">
                                  <div id="sys-preview-left-thumb" style="width: 80px; height: 45px; border-radius: 4px; border: 1.5px solid #10b981; background: black; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: #10b981; font-weight: bold; position: relative;">
                                      <canvas id="sys-left-preview-canvas" style="position: absolute; width: 100%; height: 100%; object-fit: cover;"></canvas>
                                      <span style="position: relative; z-index: 1;">Pre-Cut</span>
                                  </div>
                                  <div id="sys-preview-right-thumb" style="width: 80px; height: 45px; border-radius: 4px; border: 1.5px solid #ef4444; background: black; overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: #ef4444; font-weight: bold; position: relative;">
                                      <canvas id="sys-right-preview-canvas" style="position: absolute; width: 100%; height: 100%; object-fit: cover;"></canvas>
                                      <span style="position: relative; z-index: 1;">Post-Cut</span>
                                  </div>
                              </div>

                              <div id="sys-timeline-track" style="height: 32px; background: var(--glass-bg); border-radius: 6px; position: relative; cursor: pointer; outline: none; display: flex; align-items: center;" tabindex="0" role="slider" aria-label="Playback progress">
                                  <!-- Audio Waveform Canvas overlay -->
                                  <canvas id="sys-audio-waveform-canvas" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: 6px; opacity: 0.85; pointer-events: none;"></canvas>

                                  <!-- Red Selected Cut Range Overlay -->
                                  <div id="sys-cut-range-overlay" style="display: none; position: absolute; height: 100%; background: rgba(239, 68, 68, 0.45); border-left: 2px solid #ef4444; border-right: 2px solid #ef4444; pointer-events: auto; cursor: grab;"></div>

                                  <!-- Collapsed Join Ticks and Step Markers -->
                                  <div id="sys-timeline-markers" style="position: absolute; left: 0; right: 0; height: 100%; pointer-events: none;"></div>

                                  <!-- Master Playhead -->
                                  <div id="sys-playhead" style="position: absolute; width: 4px; height: 100%; background: var(--primary); box-shadow: 0 0 8px rgba(18, 142, 205, 0.8); cursor: pointer; transform: translate3d(0, 0, 0); margin-left: -2px; pointer-events: auto; z-index: 15; border-radius: 2px;"></div>

                                  <!-- Drag Handles (Remove Section Mode only) -->
                                  <div id="sys-handle-start" style="display: none; position: absolute; width: 6px; height: 100%; background: #10b981; cursor: ew-resize; transform: translate3d(0, 0, 0); margin-left: -3px; pointer-events: auto; outline: none; z-index: 20; border-radius: 3px; border: 1.5px solid white; box-shadow: 0 0 6px rgba(16,185,129,0.5);" tabindex="0" role="slider" aria-label="Removal start time">
                                      <div style="position: absolute; width: 44px; height: 44px; left: -19px; top: -6px; border-radius: 50%;"></div>
                                  </div>
                                  <div id="sys-handle-end" style="display: none; position: absolute; width: 6px; height: 100%; background: #ef4444; cursor: ew-resize; transform: translate3d(0, 0, 0); margin-left: -3px; pointer-events: auto; outline: none; z-index: 20; border-radius: 3px; border: 1.5px solid white; box-shadow: 0 0 6px rgba(239,68,68,0.5);" tabindex="0" role="slider" aria-label="Removal end time">
                                      <div style="position: absolute; width: 44px; height: 44px; left: -19px; top: -6px; border-radius: 50%;"></div>
                                  </div>
                              </div>
                          </div>

                          <!-- Custom Player Control Bar -->
                          <div style="display: none; justify-content: space-between; align-items: center; padding: 0.6rem 1rem; background: rgba(0,0,0,0.6); font-size: 0.8rem; border-top: 1px solid var(--glass-border);">
                              <div style="display: flex; align-items: center; gap: 1rem;">
                                  <button id="sys-play-pause-btn" class="btn-ghost" style="padding: 0.35rem 0.75rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: var(--text-main); cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; outline: none; font-size: 0.75rem; font-weight: 500;">
                                      <span id="sys-play-icon">▶</span> Play
                                  </button>
                                  <span>Time: <strong id="sys-editor-video-time" style="color: var(--text-main); font-family: monospace;">00:00.0 / 00:00.0</strong></span>
                              </div>
                              <div style="display: flex; align-items: center; gap: 0.8rem;">
                                  <select id="sys-playback-speed" style="padding: 0.25rem 0.4rem; background: rgba(0,0,0,0.5); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: 4px; font-size: 0.75rem; outline: none; cursor: pointer;">
                                      <option value="0.5">0.5x</option>
                                      <option value="1.0" selected>1.0x</option>
                                      <option value="1.5">1.5x</option>
                                      <option value="2.0">2.0x</option>
                                  </select>
                                  <button id="sys-mute-btn" class="btn-ghost" style="padding: 0.35rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: var(--text-main); cursor: pointer; outline: none; font-size: 0.75rem;" title="Mute/Unmute">🔊</button>
                                  <button id="sys-fullscreen-player-btn" class="btn-ghost" style="padding: 0.35rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: var(--text-main); cursor: pointer; outline: none; font-size: 0.75rem;" title="Toggle player fullscreen">🗖</button>
                              </div>
                          </div>
                      </div>

                      <!-- Inline Action Bar (for Remove Section Mode, replaces old modal dialogue) -->
                      <div id="sys-visual-cut-action-bar" style="display: none; justify-content: space-between; align-items: center; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); padding: 0.6rem 1rem; border-radius: var(--radius-md); margin-top: 1rem; flex-wrap: wrap; gap: 0.8rem; border-top: 1px solid rgba(239,68,68,0.2);">
                          <div style="display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;">
                              <div style="display: flex; align-items: center; gap: 0.4rem;">
                                  <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">Start:</label>
                                  <input type="text" id="sys-visual-cut-start" value="00:00.0" style="width: 70px; padding: 0.3rem 0.5rem; background: rgba(0,0,0,0.5); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: 4px; font-family: monospace; outline: none; font-size: 0.8rem; text-align: center;">
                              </div>
                              <div style="display: flex; align-items: center; gap: 0.4rem;">
                                  <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">End:</label>
                                  <input type="text" id="sys-visual-cut-end" value="00:05.0" style="width: 70px; padding: 0.3rem 0.5rem; background: rgba(0,0,0,0.5); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: 4px; font-family: monospace; outline: none; font-size: 0.8rem; text-align: center;">
                              </div>
                              <span id="sys-visual-cut-duration" style="font-size: 0.8rem; font-weight: bold; color: #ef4444;">Remove: 5.0 seconds</span>
                              <span id="sys-visual-cut-steps-count" style="font-size: 0.8rem; font-weight: 500; color: #f59e0b;"></span>
                              <span id="sys-visual-cut-msg" style="font-size: 0.8rem; font-style: italic; color: #ef4444; font-weight: 500; display: none;"></span>
                              <div id="sys-visual-cut-error" style="font-size: 0.8rem; color: #ef4444; display: none; font-weight: 600;"></div>
                          </div>
                          <div style="display: flex; gap: 0.5rem; align-items: center;">
                              <button id="sys-visual-cut-preview-btn" class="btn-ghost" style="border: 1px solid rgba(255,255,255,0.15); color: var(--text-main); padding: 0.35rem 0.75rem; border-radius: 4px; font-size: 0.75rem; outline: none; cursor: pointer; font-weight: 500;">Preview</button>
                              <button id="sys-visual-cut-cancel-btn" class="btn-ghost" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; outline: none; cursor: pointer; font-weight: 500;">Cancel</button>
                              <button id="sys-visual-cut-confirm-btn" class="btn-primary" style="background: #10b981; border-color: #10b981; padding: 0.35rem 0.75rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: 500;">Remove section</button>
                          </div>
                      </div>
                  </div>

                  <!-- Read-only Transcript Panel -->
                  <div id="sys-transcript-panel" class="glass sys-transcript-panel" style="display: flex; flex: 1; padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); flex-direction: column; box-sizing: border-box; overflow-y: auto; background: rgba(10,10,12,0.5);" role="region" aria-label="Audio Transcript">
                      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem; margin-bottom: 0.75rem;">
                          <h4 style="margin: 0; color: var(--primary); display: flex; align-items: center; gap: 0.5rem;">
                              <span style="font-size: 1.1rem;">Transcript</span>
                              <span id="sys-transcript-lang" style="font-size: 0.7rem; background: rgba(255,255,255,0.1); padding: 0.15rem 0.4rem; border-radius: 4px; color: var(--text-muted); font-weight: normal; display: none;"></span>
                          </h4>
                          <div style="display: flex; gap: 0.5rem;">
                              <button id="sys-shorten-pauses-btn" class="btn-ghost" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid rgba(167, 201, 70, 0.4); border-radius: 4px; color: var(--primary); cursor: pointer; display: none; align-items: center; gap: 0.3rem; white-space: nowrap;">
                                  Shorten Pauses
                              </button>

                              <button id="sys-transcript-restore-all-btn" class="btn-ghost" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 4px; color: #10b981; cursor: pointer; display: none; align-items: center; gap: 0.3rem;">
                                  Restore all removed sections
                              </button>

                              <label id="sys-transcript-follow-label" style="display: none; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.8rem; color: var(--text-main);">
                                  <div class="toggle-switch">
                                      <input type="checkbox" id="sys-transcript-follow-btn" checked>
                                      <span class="slider"></span>
                                  </div>
                                  Follow Playback
                              </label>

                          </div>
                      </div>
                      <div id="sys-transcript-announcer" class="sr-only" aria-live="polite" style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0;"></div>
                      <div id="sys-removed-word-desc" class="sr-only" style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0;">Removed from playback</div>

                      <!-- Transcript Selection Action Bar -->
                      <div id="sys-transcript-selection-bar" style="display: none; justify-content: space-between; align-items: center; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); padding: 0.6rem 1rem; border-radius: var(--radius-md); margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.8rem;">
                          <span id="sys-transcript-selection-duration" style="font-size: 0.85rem; font-weight: bold; color: #ef4444;">Selected: 0.0 seconds</span>
                          <div style="display: flex; gap: 0.5rem; align-items: center;">
                              <button id="sys-transcript-cancel-selection-btn" class="btn-ghost" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; outline: none; cursor: pointer; font-weight: 500; border: 1px solid rgba(255,255,255,0.15); color: var(--text-main); border-radius: 4px;">Cancel selection</button>
                              <button id="sys-transcript-remove-selection-btn" class="btn-primary" style="background: #10b981; border-color: #10b981; padding: 0.35rem 0.75rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: 500;">Remove selected text from video</button>
                          </div>
                      </div>

                      <div id="sys-transcript-content" style="flex: 1; overflow-y: auto; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 0.25rem; padding-right: 0.25rem; line-height: 1.6; font-size: 0.95rem; color: rgba(255,255,255,0.75); outline: none;" tabindex="0">
                          <!-- Words will go here -->
                      </div>
                      <button id="sys-generate-transcript-btn" class="btn-primary" style="margin: 1rem auto; display: block; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); font-weight: 600; cursor: pointer;">Generate Transcript</button>
                      <div id="sys-transcript-progress-msg" style="display: none; text-align: center; color: var(--text-muted); font-style: italic; margin-top: 1rem;"></div>
                      <input type="file" id="sys-transcribe-file-input" accept=".json" style="display: none;">
                      <div id="sys-transcript-pipeline-controls" style="margin-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
                          <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; width: 100%;">
                              Preparing transcript tools…
                          </div>
                      </div>
                  </div>
              </div>

              <!-- Right Column: Sidebar Timeline Steps Controls -->
                 <div class="sys-right-sidebar-container" style="flex: 1; display: flex; flex-direction: column; gap: 1rem; min-width: 0; overflow: hidden;">
                     <div class="glass sys-timeline-list-container" style="padding: 1rem; border-radius: var(--radius-md); flex: 1; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;">
                         <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                             <h4 style="margin: 0; color: var(--primary); font-size: 1.1rem; display: flex; align-items: center;">Timeline Steps <span id="sys-step-count" style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal; margin-left: 0.5rem;">(0)</span></h4>
                             <button id="sys-generate-steps-btn" class="btn-ghost" style="padding: 0.35rem 0.65rem; font-size: 0.72rem; border: 1px solid var(--primary); border-radius: 4px; color: var(--primary); cursor: pointer; display: none;">Generate AI Steps</button>
                             <button id="sys-repair-steps-btn" class="btn-ghost" style="padding: 0.35rem 0.65rem; font-size: 0.72rem; border: 1px solid var(--warning-color); border-radius: 4px; color: var(--warning-color); cursor: pointer; display: none;">Repair Timings</button>
                         </div>
                         <div id="sys-step-generation-status" style="display: none; margin-bottom: 0.75rem; font-size: 0.75rem; color: var(--text-muted);"></div>

                         <!-- Scrollable Steps List -->
                         <div id="sys-timeline-steps-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; padding-right: 0.25rem;">
                             <!-- Dynamic Step Cards go here -->
                         </div>
                     </div>
                 </div>

             </div>

        </div>

        <!-- Video Editing Panel Drawer -->
        <div id="sys-video-edit-panel" style="display: none; border-top: 1px solid var(--glass-border); padding: 1.25rem; margin-top: 1.25rem; flex-direction: column; gap: 1rem; background: rgba(0,0,0,0.25); border-radius: var(--radius-md);">
            <h4 style="margin: 0; color: var(--primary); font-size: 1.1rem;">Video Editing Panel</h4>
            <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
                <button id="sys-trim-before-btn" class="btn-ghost" style="border: 1px solid rgba(255,255,255,0.15); color: var(--text-main); padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Trim everything before this point</button>
                <button id="sys-trim-after-btn" class="btn-ghost" style="border: 1px solid rgba(255,255,255,0.15); color: var(--text-main); padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Trim everything after this point</button>
                <button id="sys-cut-section-btn" class="btn-primary" style="background: #ef4444; border-color: #ef4444; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Remove a section</button>
            </div>

            <div style="margin-top: 0.5rem;">
                <label style="font-size: 0.85rem; color: var(--text-muted); font-weight: bold; display: block; margin-bottom: 0.5rem;">Current Edits:</label>
                <div id="sys-active-edits-list" style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 150px; overflow-y: auto;">
                    <!-- Active edits list goes here -->
                </div>
            </div>
        </div>



        <!-- Affected Steps Modal -->
        <div id="sys-steps-warning-dialog" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 100001; align-items: center; justify-content: center;">
            <div class="glass" style="padding: 2rem; border-radius: var(--radius-lg); width: 500px; display: flex; flex-direction: column; gap: 1.25rem;">
                <h3 style="margin: 0; color: var(--text-main);">Steps Affected by Edit</h3>
                <p id="sys-steps-warning-msg" style="margin: 0; color: var(--text-muted); font-size: 0.9rem;"></p>

                <div style="display: flex; flex-direction: column; gap: 1rem; max-height: 250px; overflow-y: auto; padding-right: 0.5rem;" id="sys-steps-resolution-list">
                    <!-- Resolution list for steps goes here -->
                </div>

                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 0.5rem;">
                    <button id="sys-steps-warning-cancel-btn" class="btn-ghost">Cancel Edit</button>
                    <button id="sys-steps-warning-confirm-btn" class="btn-primary" style="background: #10b981; border-color: #10b981;">Apply & Move/Delete Steps</button>
                </div>
            </div>
        </div>

    </div>

    <style>
        @keyframes pulse-dot {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .sys-transcript-word {
            background: none;
            border: 1px solid transparent;
            color: var(--text-main);
            font: inherit;
            padding: 0.1rem 0.2rem;
            margin: 0;
            cursor: pointer;
            display: inline;
            border-radius: 4px;
            transition: all 0.15s ease;
            text-align: left;
            outline: none;
        }
        .sys-transcript-word:hover:not(.removed) {
            background: var(--glass-bg);
            color: var(--text-main);
        }
        .sys-transcript-word.active {
            background: rgba(18, 142, 205, 0.2);
            color: var(--primary);
            font-weight: 500;
        }
        .sys-transcript-word.selected {
            border-color: var(--primary);
            background: rgba(var(--primary-rgb), 0.1);
        }
        .sys-transcript-word.removed {
            text-decoration: line-through;
            opacity: 0.4;
            cursor: pointer;
        }
        .sys-transcript-word:focus {
            outline: 2px solid var(--primary);
            outline-offset: 1px;
            background: rgba(255, 255, 255, 0.05);
        }
        .sys-transcript-pause {
            background: rgba(245, 158, 11, 0.12);
            border: 1px solid rgba(245, 158, 11, 0.35);
            color: #fbbf24;
            font: inherit;
            font-size: 0.78rem;
            font-weight: 600;
            padding: 0.05rem 0.35rem;
            margin: 0 0.1rem;
            cursor: pointer;
            border-radius: 999px;
            white-space: nowrap;
        }
        .sys-transcript-pause:hover,
        .sys-transcript-pause:focus {
            background: rgba(245, 158, 11, 0.2);
            outline: 2px solid rgba(245, 158, 11, 0.35);
            outline-offset: 1px;
        }
        .sys-transcript-panel #sys-transcript-follow-btn.active {
            color: #10b981;
            border-color: rgba(16, 185, 129, 0.3);
            background: rgba(16, 185, 129, 0.08);
        }
        @media (max-width: 1024px) {
            .sys-video-and-transcript-container {
                flex-direction: column !important;
            }
            .sys-transcript-panel {
                width: 100% !important;
                max-height: 280px !important;
                flex: none !important;
            }
        }
    </style>
    `;
};

export const initSystemBuilder = (onClose, existingGuide = null) => {


    document.body.dataset.sysTab = 'transcript';
    const setWorkspaceState = (mode) => {
        const root = document.getElementById('sys-builder-root');
        if (!root) return;

        const headerTitle = document.getElementById('sys-header-title');
        const titleInput = document.getElementById('sys-title');


        if (mode === 'setup') {
            root.classList.remove('sys-state-editing');
            root.classList.add('sys-state-setup');
            if (headerTitle) headerTitle.textContent = 'Interactive Guide Builder';

            const metaStep = document.getElementById('sys-meta-step');
            if (metaStep) {
                metaStep.style.maxHeight = '1000px';
                metaStep.style.opacity = '1';
                metaStep.style.margin = '0 0 1rem 0';
                metaStep.style.padding = '1.5rem';
                metaStep.style.border = '1px solid var(--glass-border)';
            }
            const guideDetailsFields = document.getElementById('sys-guide-details-fields');
            if (guideDetailsFields) {
                guideDetailsFields.style.display = 'flex';
            }
        } else if (mode === 'editing') {
            root.classList.remove('sys-state-setup');
            root.classList.add('sys-state-editing');
            if (headerTitle && titleInput && titleInput.value.trim()) {
                headerTitle.textContent = titleInput.value.trim();
            } else if (headerTitle) {
                headerTitle.textContent = 'Untitled Guide';
            }

            const metaStep = document.getElementById('sys-meta-step');
            if (metaStep) {
                metaStep.style.maxHeight = '0';
                metaStep.style.opacity = '0';
                metaStep.style.margin = '0';
                metaStep.style.padding = '0';
                metaStep.style.border = 'none';
            }
            const guideDetailsFields = document.getElementById('sys-guide-details-fields');
            if (guideDetailsFields) {
                guideDetailsFields.style.display = 'none';
            }

            const toggleMetaBtn = document.getElementById('sys-toggle-meta-btn');
            if (toggleMetaBtn) {
                toggleMetaBtn.innerHTML = 'Guide Details <span style="font-size: 0.7rem;">▼</span>';
            }
        }
    };

    const cancelBtn = document.getElementById('sys-cancel-btn');
    const saveBtn = document.getElementById('sys-save-btn');
    const draftBtn = document.getElementById('sys-draft-btn');
    const fullscreenBtn = document.getElementById('sys-fullscreen-btn');
    const builderRoot = document.getElementById('sys-builder-root');
    const titleInput = document.getElementById('sys-title');
    const descInput = document.getElementById('sys-desc');
    const tagsInput = document.getElementById('sys-tags');
    const tagsList = document.getElementById('sys-tags-list');
    const metaStep = document.getElementById('sys-meta-step');
    const toggleMetaBtn = document.getElementById('sys-toggle-meta-btn');
    const replaceVideoBtn = document.getElementById('sys-replace-video-btn');
    const builderSubtitle = document.getElementById('sys-builder-subtitle');
    const walkthroughSetupWrapper = document.getElementById('sys-walkthrough-setup-wrapper');
    const guideDetailsFields = document.getElementById('sys-guide-details-fields');
    const editorStep = document.getElementById('sys-editor-step');
    setWorkspaceState('setup');

    // Edit Video selectors
    const editVideoToggleBtn = document.getElementById('sys-edit-video-toggle-btn');
    const videoEditPanel = document.getElementById('sys-video-edit-panel');
    const trimBeforeBtn = document.getElementById('sys-trim-before-btn');
    const trimAfterBtn = document.getElementById('sys-trim-after-btn');
    const cutSectionBtn = document.getElementById('sys-cut-section-btn');
    const activeEditsList = document.getElementById('sys-active-edits-list');

    // Custom accessible video player timeline components
    const timelineTrack = document.getElementById('sys-timeline-track');
    const playhead = document.getElementById('sys-playhead');
    const cutRangeOverlay = document.getElementById('sys-cut-range-overlay');
    const handleStart = document.getElementById('sys-handle-start');
    const handleEnd = document.getElementById('sys-handle-end');
    const timelineMarkers = document.getElementById('sys-timeline-markers');
    const audioWaveformCanvas = document.getElementById('sys-audio-waveform-canvas');

    // Automatic timeline magnification components
    const magnifiedTrackContainer = document.getElementById('sys-magnified-track-container');
    const magnifiedWaveformCanvas = document.getElementById('sys-magnified-waveform-canvas');
    const magnifiedHandleIndicator = document.getElementById('sys-magnified-handle-indicator');
    const magnifiedRuler = document.getElementById('sys-magnified-ruler');

    // Join previews components
    const joinPreviewsContainer = document.getElementById('sys-join-previews-container');
    const leftPreviewCanvas = document.getElementById('sys-left-preview-canvas');
    const rightPreviewCanvas = document.getElementById('sys-right-preview-canvas');

    // Custom Player Controls
    const playPauseBtn = document.getElementById('sys-play-pause-btn');
    const playIcon = document.getElementById('sys-play-icon');
    const playbackSpeedSelect = document.getElementById('sys-playback-speed');
    const muteBtn = document.getElementById('sys-mute-btn');
    const fullscreenPlayerBtn = document.getElementById('sys-fullscreen-player-btn');

    // Visual Remove Section Action Bar
    const visualCutActionBar = document.getElementById('sys-visual-cut-action-bar');
    const visualCutStartInput = document.getElementById('sys-visual-cut-start');
    const visualCutEndInput = document.getElementById('sys-visual-cut-end');
    const visualCutDuration = document.getElementById('sys-visual-cut-duration');
    const visualCutStepsCount = document.getElementById('sys-visual-cut-steps-count');
    const visualCutMsg = document.getElementById('sys-visual-cut-msg');
    const visualCutError = document.getElementById('sys-visual-cut-error');
    const visualCutPreviewBtn = document.getElementById('sys-visual-cut-preview-btn');
    const visualCutCancelBtn = document.getElementById('sys-visual-cut-cancel-btn');
    const visualCutConfirmBtn = document.getElementById('sys-visual-cut-confirm-btn');

    const undoBtn = document.getElementById('sys-undo-btn');
    const redoBtn = document.getElementById('sys-redo-btn');
    const generateTranscriptBtn = document.getElementById('sys-generate-transcript-btn');
    const generateStepsBtn = document.getElementById('sys-generate-steps-btn');
    const stepGenerationStatus = document.getElementById('sys-step-generation-status');
    const shortenPausesBtn = document.getElementById('sys-shorten-pauses-btn');
    const transcriptProgressMsg = document.getElementById('sys-transcript-progress-msg');

    const cancelSelectionBtn = document.getElementById('sys-transcript-cancel-selection-btn');
    const removeSelectionBtn = document.getElementById('sys-transcript-remove-selection-btn');
    const restoreAllBtn = document.getElementById('sys-transcript-restore-all-btn');

    if (restoreAllBtn) {
        restoreAllBtn.onclick = () => {
            if (timelineEditorController && isTimelineSeqEditing) {
                // To restore all, we could either undo all, or if we want to explicitly clear cuts:
                // Actually the sequence engine might not have a clearCuts method.
                // We could iterate over all clips that are removed, but the simplest is to reload sequence from base,
                // or just rely on undo if needed. Wait, we can iterate over all `videoEdits.cuts` in legacy, but what about seq engine?
                // For now, let's just clear videoEdits.cuts in legacy mode, and in seq engine maybe we can't easily clear all.
                // Wait! TimelineEditorController has `getCommittedSequence()`.
                // Actually, restoring all removed sections might just be resetting the sequence to source duration.
                // Or we can just call `restoreRemovedRange` on the full duration.
                const dur = editorVideo.duration || 0;
                try {
                    timelineEditorController.restoreRemovedRange(0, dur);
                } catch (err) {
                    // It might throw if there are no gaps or it's not a gap, so we can ignore or just try our best.
                    console.log("Restoring full range:", err);
                }
            } else if (playbackCoordinator) {
                videoEdits.cuts = [];
                playbackCoordinator.loadCuts(videoEdits.cuts);
                hasUnsavedChanges = true;
                updateSaveStatusIndicator();
                if (transcriptionUIController?.transcriptViewerController) {
                    transcriptionUIController.transcriptViewerController.refreshSequence(
                        migrateLegacyEditsToSequence(sourceAssetId || '', editorVideo.duration || 0, videoEdits)
                    );
                }
            }
        };
    }

    const updateUndoRedoButtons = () => {
        const canUndo = Boolean(
            timelineEditorController
            && isTimelineSeqEditing
            && timelineEditorController.canUndo()
        );
        const canRedo = Boolean(
            timelineEditorController
            && isTimelineSeqEditing
            && timelineEditorController.canRedo()
        );

        if (undoBtn) {
            undoBtn.disabled = !canUndo;
            undoBtn.style.opacity = canUndo ? '1' : '0.45';
            undoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
        }
        if (redoBtn) {
            redoBtn.disabled = !canRedo;
            redoBtn.style.opacity = canRedo ? '1' : '0.45';
            redoBtn.style.cursor = canRedo ? 'pointer' : 'not-allowed';
        }
    };

    if (undoBtn) {
        undoBtn.onclick = () => {
            if (timelineEditorController?.canUndo()) {
                timelineEditorController.undo();
                clearTranscriptSelection();
                announceTranscript('Last video cut undone.');
            }
        };
    }
    if (redoBtn) {
        redoBtn.onclick = () => {
            if (timelineEditorController?.canRedo()) {
                timelineEditorController.redo();
                clearTranscriptSelection();
                announceTranscript('Last video cut restored.');
            }
        };
    }

    if (cancelSelectionBtn) {
        cancelSelectionBtn.onclick = () => {
            clearTranscriptSelection();
        };
    }
    if (removeSelectionBtn) {
        removeSelectionBtn.onclick = () => {
            handleRemoveSelection();
        };
    }

    if (shortenPausesBtn) {
        shortenPausesBtn.onclick = async () => {
            if (!timelineEditorController || !isTimelineSeqEditing) return;

            currentTranscriptPauses = detectTranscriptPauses(currentTranscriptWordsList);
            const plan = getCurrentPauseShorteningPlan();
            if (plan.eligible.length === 0) {
                const message = plan.protected.length > 0
                    ? 'These pauses contain guide steps, so they have been left unchanged.'
                    : 'There are no pauses to shorten.';
                await fswAlert(message);
                return;
            }

            const pauseLabel = plan.eligible.length === 1 ? 'pause' : 'pauses';
            const protectedMessage = plan.protected.length > 0
                ? ` ${plan.protected.length} containing guide steps will be left unchanged.`
                : '';
            const confirmed = await fswConfirm(
                `Shorten ${plan.eligible.length} ${pauseLabel} and remove approximately ${plan.totalSecondsRemoved.toFixed(1)} seconds?${protectedMessage}`
            );
            if (!confirmed) return;

            shortenPausesBtn.disabled = true;
            try {
                timelineEditorController.removeVisibleRanges(
                    plan.eligible.map((pause) => ({
                        visibleStart: pause.removalVisibleStart,
                        visibleEnd: pause.removalVisibleEnd
                    }))
                );
                clearTranscriptSelection();

                const skippedMessage = plan.protected.length > 0
                    ? ` ${plan.protected.length} containing guide steps were left unchanged.`
                    : '';
                showTranscriptNotice(
                    `${plan.eligible.length} ${pauseLabel} shortened.${skippedMessage}`
                );
                announceTranscript(`${plan.eligible.length} ${pauseLabel} shortened.`);
            } catch (error) {
                console.error('Pause shortening failed', error);
                await fswAlert(error?.message || 'The pauses could not be shortened.');
            } finally {
                shortenPausesBtn.disabled = false;
                updateShortenPausesButton();
            }
        };
    }

    if (generateTranscriptBtn) {
        generateTranscriptBtn.onclick = async () => {
            if (!existingGuide?.id || !sourceAssetId || !transcriptionUIController?.transcriptionJobController) {
                await fswAlert('Save the recording before generating its transcript.');
                return;
            }

            try {
                generateTranscriptBtn.style.display = 'none';
                transcriptProgressMsg.style.display = 'block';
                transcriptProgressMsg.innerText = 'Loading the saved recording…';

                if (!videoUrl) {
                    throw new Error('The saved recording could not be found.');
                }

                const recordingResponse = await fetch(videoUrl, { cache: 'no-store' });
                if (!recordingResponse.ok) {
                    throw new Error('The saved recording could not be loaded.');
                }
                const recordingBlob = await recordingResponse.blob();

                transcriptProgressMsg.innerText = 'Preparing speech audio…';
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                let audioBuffer;
                try {
                    audioBuffer = await audioCtx.decodeAudioData(await recordingBlob.arrayBuffer());
                } finally {
                    audioCtx.close().catch(() => {});
                }

                let maxVal = 0;
                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const channelData = audioBuffer.getChannelData(channel);
                    for (let i = 0; i < channelData.length; i++) {
                        maxVal = Math.max(maxVal, Math.abs(channelData[i]));
                    }
                }
                if (maxVal < 0.001) {
                    throw new Error('The recording does not contain clear speech audio.');
                }

                if (maxVal < 0.8) {
                    const gain = 0.8 / maxVal;
                    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                        const channelData = audioBuffer.getChannelData(channel);
                        for (let i = 0; i < channelData.length; i++) {
                            channelData[i] *= gain;
                        }
                    }
                }

                const speechWav = bufferToWav(audioBuffer);
                const maximumRequestBytes = 3670016;
                if (speechWav.size > maximumRequestBytes) {
                    throw new Error('This recording is too long for instant transcription.');
                }

                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) {
                    throw new Error('Your session has expired. Please sign in again.');
                }

                transcriptProgressMsg.innerText = 'Transcribing speech…';
                const formData = new FormData();
                formData.append('guideId', existingGuide.id);
                formData.append('file', speechWav, 'audio.wav');

                const response = await fetch('/api/transcribe', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: formData
                });
                const providerResult = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(providerResult?.error?.message || 'Transcription failed. Please try again.');
                }

                const requestId = response.headers.get('X-Request-ID') || crypto.randomUUID();
                const rawWords = Array.isArray(providerResult.words)
                    ? [...providerResult.words].sort((a, b) => Number(a.start) - Number(b.start))
                    : [];
                const lastWordEnd = rawWords.reduce((latest, word) => {
                    const end = Number(word.end);
                    return Number.isFinite(end) ? Math.max(latest, end) : latest;
                }, 0);
                const transcriptDuration = Math.max(Number(editorVideo.duration) || 0, lastWordEnd);
                const words = [];
                let previousWordEnd = 0;

                rawWords.forEach((rawWord, index) => {
                    const text = String(rawWord.word || rawWord.text || '').trim();
                    let start = Number(rawWord.start);
                    let end = Number(rawWord.end);

                    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) return;
                    start = Math.max(0, start, previousWordEnd);
                    end = Math.min(transcriptDuration, end);
                    if (end <= start) return;

                    words.push({
                        id: `${requestId}_w${index}_${Math.round(start * 1000)}_${Math.round(end * 1000)}`,
                        text,
                        startSourceTime: start,
                        endSourceTime: end,
                        confidence: null,
                        speakerId: null
                    });
                    previousWordEnd = end;
                });

                if (words.length === 0) {
                    throw new Error('No clear speech was detected in this recording.');
                }

                const transcript = {
                    schemaVersion: 1,
                    sourceAssetId,
                    language: String(providerResult.language || 'en').toLowerCase(),
                    duration: transcriptDuration,
                    words
                };

                transcriptProgressMsg.innerText = 'Saving transcript…';
                await transcriptionUIController.transcriptionJobController.startManualImport(
                    requestId,
                    transcript
                );
                await transcriptionUIController.transcriptionJobController.approve();
                if (transcriptionUIController.transcriptViewerController) {
                    await transcriptionUIController.transcriptViewerController.initialize();
                }

                const speechSegments = buildSpeechSegments(providerResult);
                const hasOnlyStarterStep = steps.length === 1
                    && Number(steps[0].sourceTimestamp || 0) === 0
                    && steps[0].instruction === 'Start Walkthrough';

                if (speechSegments.length > 0 && (steps.length === 0 || hasOnlyStarterStep)) {
                    transcriptProgressMsg.innerText = 'Structuring timeline steps…';
                    await generateTimelineStepsFromSegments(speechSegments);
                }

                transcriptProgressMsg.innerText = speechSegments.length > 0
                    ? 'Transcript and steps ready'
                    : 'Transcript ready';
                setTimeout(() => {
                    transcriptProgressMsg.style.display = 'none';
                }, 2000);
            } catch (err) {
                console.error('Transcript generation failed', err);
                transcriptProgressMsg.innerText = err?.message || 'Error generating transcript. Please try again.';
                generateTranscriptBtn.style.display = 'block';
            }
        };
    }

    if (generateStepsBtn) {
        generateStepsBtn.onclick = async () => {
            const transcriptState = transcriptionUIController?.transcriptViewerController?.getState();
            const transcript = transcriptState?.transcript;
            if (!transcript || !Array.isArray(transcript.words) || transcript.words.length === 0) {
                await fswAlert('Generate the transcript before generating timeline steps.');
                return;
            }

            const hasOnlyStarterStep = steps.length === 1
                && Number(steps[0].sourceTimestamp || 0) === 0
                && steps[0].instruction === 'Start Walkthrough';
            const preserveExistingSteps = steps.length > 0 && !hasOnlyStarterStep;

            if (preserveExistingSteps) {
                const repairSteps = await fswConfirm('Repair the current step timings from the transcript? Every existing action and detailed note will be preserved.');
                if (!repairSteps) return;
            }

            generateStepsBtn.disabled = true;
            stepGenerationStatus.style.display = 'block';
            stepGenerationStatus.innerText = preserveExistingSteps
                ? 'Repairing step timings while preserving your notes…'
                : 'Structuring the transcript into timeline steps…';

            try {
                if (preserveExistingSteps) {
                    await captureTimingDiagnostic('before_repair');
                }

                const visibleTranscriptWords = Array.isArray(transcriptState?.visibleWords)
                    ? transcriptState.visibleWords
                        .filter(visibleWord => visibleWord?.state !== 'removed' && visibleWord?.word)
                        .map(visibleWord => visibleWord.word)
                    : [];
                const speechSegments = buildSpeechSegments({
                    words: preserveExistingSteps && visibleTranscriptWords.length > 0
                        ? visibleTranscriptWords
                        : transcript.words
                });
                if (speechSegments.length === 0) {
                    throw new Error('The transcript does not contain usable word timings.');
                }

                const stepCount = await generateTimelineStepsFromSegments(speechSegments, {
                    preserveExistingSteps
                });
                if (preserveExistingSteps) {
                    await captureTimingDiagnostic('after_repair_save_response');
                }
                stepGenerationStatus.innerText = preserveExistingSteps
                    ? `${stepCount} step timings repaired and saved. Every action and detailed note was preserved.`
                    : `${stepCount} timeline steps generated and saved.`;
            } catch (err) {
                console.error('Timeline step generation failed', err);
                stepGenerationStatus.innerText = err?.message || 'Timeline steps could not be generated.';
                await fswAlert(stepGenerationStatus.innerText);
            } finally {
                generateStepsBtn.disabled = false;
            }
        };
    }

    // Affected Steps dialog controls
    const stepsWarningDialog = document.getElementById('sys-steps-warning-dialog');
    const stepsWarningMsg = document.getElementById('sys-steps-warning-msg');
    const stepsResolutionList = document.getElementById('sys-steps-resolution-list');
    const stepsWarningCancelBtn = document.getElementById('sys-steps-warning-cancel-btn');
    const stepsWarningConfirmBtn = document.getElementById('sys-steps-warning-confirm-btn');

    // Source capturing components
    const panelRecord = document.getElementById('sys-panel-record');

    const startRecBtn = document.getElementById('sys-start-rec-btn');
    const stopRecBtn = document.getElementById('sys-stop-rec-btn');
    const recSetupUi = document.getElementById('rec-setup-ui');
    const recLiveUi = document.getElementById('rec-live-ui');
    const recProgressUi = document.getElementById('rec-progress-ui');
    const recProgressMsg = document.getElementById('rec-progress-msg');
    const recProgressBar = document.getElementById('rec-progress-bar');
    const recTimer = document.getElementById('rec-timer');
    const uploadVideoInput = document.getElementById('sys-upload-video-input');

    // Crop box tools
    const cropToggleBtn = document.getElementById('sys-crop-toggle');
    const cropOverlay = document.getElementById('sys-crop-box-overlay');
    const cropDimText = document.getElementById('sys-crop-dim');
    const magnifier = document.getElementById('sys-magnifier');

    // Fine-Tuning controls
    // Video Editor components
    const editorVideo = document.getElementById('sys-editor-video');
    const editorVideoTime = document.getElementById('sys-editor-video-time');
    const timelineStepsList = document.getElementById('sys-timeline-steps-list');
    const addStepHereBtn = document.getElementById('sys-add-step-here-btn');

    let steps = []; // [{ id, createdOrder, sourceTimestamp, instruction, teachingText }]
    let nextStepOrder = 0;
    let hasUnsavedChanges = false;
    let lastActiveStepId = null;
    let recordedVideoBlob = null;
    let videoUrl = null;
    let videoEdits = { schemaVersion: 1, trimStart: 0.0, trimEnd: null, cuts: [] };
    let renderStatus = "notRequired";
    let publicationStatus = "draft";
    let playbackCoordinator = null;
    let autosaveController = null;
    let timelineEditorController = null;
    let transcriptViewerController = null;
    let transcriptionJobController = null;
    let transcriptionService = null;
    let transcriptionUIController = null;
    let sourceAssetId = null;
    let isManualScrollingTranscript = false;
    let isManualScrollingSteps = false;
    let userRole = 'learner';

    let currentTranscriptSelectableItems = [];
    let selectedTranscriptKeys = new Set();
    let transcriptSelectionAnchorIndex = null;
    let transcriptSelectionFocusIndex = null;
    let isDraggingTranscriptSelection = false;
    let currentTranscriptWordsList = [];
    let currentTranscriptPauses = [];

    const getWordSelectionKey = wordId => `word:${wordId}`;
    const getPauseSelectionKey = pauseId => `pause:${pauseId}`;
    let stepAutosaveTimer = null;
    let stepAutosavePromise = null;
    let stepTimestampRepairAttempted = false;
    let latestTranscriptForStepRepair = null;
    const timingDiagnosticsStorageKey = existingGuide?.id
        ? `fsw_timing_diagnostics_${existingGuide.id}`
        : null;
    let timingDiagnosticEntries = [];

    const parseGuideContent = (content) => {
        if (typeof content === 'string') {
            try {
                return JSON.parse(content);
            } catch (error) {
                return {};
            }
        }
        return content && typeof content === 'object' ? content : {};
    };

    const timestampDiagnosticValue = (value) => {
        const numericValue = Number(value);
        return {
            raw: value ?? null,
            type: typeof value,
            numeric: Number.isFinite(numericValue) ? numericValue : null
        };
    };

    const snapshotRawSteps = (content) => {
        const parsedContent = parseGuideContent(content);
        const rawSteps = Array.isArray(parsedContent?.steps) ? parsedContent.steps : [];
        return rawSteps.map((step, index) => ({
            index,
            id: step?.id || null,
            createdOrder: step?.createdOrder ?? null,
            sourceTimestamp: timestampDiagnosticValue(step?.sourceTimestamp),
            timestamp: timestampDiagnosticValue(step?.timestamp)
        }));
    };

    const snapshotMemorySteps = () => steps.map((step, index) => {
        const sourceTimestamp = Number(step?.sourceTimestamp);
        let rendered = null;
        try {
            if (Number.isFinite(sourceTimestamp)) {
                const mapping = localSourceToVisibleTime(sourceTimestamp);
                rendered = {
                    visibleTime: Number(mapping?.visibleTime),
                    isRemoved: Boolean(mapping?.isRemoved),
                    boundary: mapping?.boundary || null
                };
            }
        } catch (error) {
            rendered = { error: error?.message || String(error) };
        }

        return {
            index,
            id: step?.id || null,
            createdOrder: step?.createdOrder ?? null,
            sourceTimestamp: timestampDiagnosticValue(step?.sourceTimestamp),
            rendered
        };
    });

    const snapshotSequence = () => {
        try {
            const sequence = timelineEditorController?.getCommittedSequence?.();
            return {
                clips: Array.isArray(sequence?.clips)
                    ? sequence.clips.map(clip => ({
                        id: clip?.id || null,
                        sourceAssetId: clip?.sourceAssetId || null,
                        sourceStart: timestampDiagnosticValue(clip?.sourceStart),
                        sourceEnd: timestampDiagnosticValue(clip?.sourceEnd)
                    }))
                    : []
            };
        } catch (error) {
            return { error: error?.message || String(error), clips: [] };
        }
    };

    const persistTimingDiagnosticEntries = () => {
        if (!timingDiagnosticsStorageKey) return;
        try {
            localStorage.setItem(
                timingDiagnosticsStorageKey,
                JSON.stringify(timingDiagnosticEntries.slice(-20))
            );
        } catch (error) {
            console.warn('Could not retain timing diagnostics locally:', error);
        }
    };

    if (timingDiagnosticsStorageKey) {
        try {
            const storedDiagnostics = JSON.parse(
                localStorage.getItem(timingDiagnosticsStorageKey) || '[]'
            );
            timingDiagnosticEntries = Array.isArray(storedDiagnostics)
                ? storedDiagnostics
                : [];
        } catch (error) {
            timingDiagnosticEntries = [];
        }
    }

    const captureTimingDiagnostic = async (stage, options = {}) => {
        if (!existingGuide?.id) return null;

        let guideRow = options.guideRow || null;
        let databaseError = null;
        if (!guideRow) {
            const { data, error } = await supabase
                .from('courses')
                .select('*')
                .eq('id', existingGuide.id)
                .maybeSingle();
            guideRow = data || null;
            databaseError = error
                ? { message: error.message, code: error.code || null }
                : null;
        }

        const databaseContent = parseGuideContent(guideRow?.content_json);
        const entry = {
            stage,
            capturedAt: new Date().toISOString(),
            guideId: existingGuide.id,
            databaseRowFound: Boolean(guideRow),
            databaseError,
            databaseUpdatedAt: guideRow?.updated_at || null,
            sourceAssetId: sourceAssetId || null,
            videoDuration: Number(editorVideo?.duration) || 0,
            databaseSteps: snapshotRawSteps(databaseContent),
            memorySteps: snapshotMemorySteps(),
            databaseVideoEdits: databaseContent?.videoEdits || null,
            memoryVideoEdits: videoEdits,
            sequence: snapshotSequence(),
            context: options.context || null
        };

        timingDiagnosticEntries.push(entry);
        timingDiagnosticEntries = timingDiagnosticEntries.slice(-20);
        persistTimingDiagnosticEntries();
        console.log('[TIMING DIAGNOSTIC]', entry);
        return entry;
    };

    window.__fswTimingDiagnostics = {
        capture: captureTimingDiagnostic,
        getReport: () => ({
            generatedAt: new Date().toISOString(),
            guideId: existingGuide?.id || null,
            snapshots: [...timingDiagnosticEntries]
        })
    };

    const getGuideContentObject = () => {
        let content = existingGuide?.content_json || {};
        if (typeof content === 'string') {
            try {
                content = JSON.parse(content);
            } catch (error) {
                content = {};
            }
        }
        return content && typeof content === 'object' ? content : {};
    };

    const persistStepsToGuide = async () => {
        if (!existingGuide?.id) return;

        const persistedSteps = steps.map((step, index) => {
            const sourceTimestamp = Number(step.sourceTimestamp);
            const safeTimestamp = Number.isFinite(sourceTimestamp)
                ? Math.max(0, sourceTimestamp)
                : 0;

            return {
                id: step.id,
                createdOrder: step.createdOrder ?? index,
                sourceTimestamp: safeTimestamp,
                timestamp: safeTimestamp,
                instruction: step.instruction || '',
                teachingText: step.teachingText || ''
            };
        });
        const nextContent = {
            ...getGuideContentObject(),
            is_system_simulation: true,
            type: 'video_walkthrough',
            videoUrl: videoUrl || getGuideContentObject().videoUrl || '',
            videoEdits,
            renderStatus,
            steps: persistedSteps
        };

        const savedGuide = await updateCourse(existingGuide.id, {
            content_json: nextContent
        });
        Object.assign(existingGuide, savedGuide || {}, {
            content_json: nextContent
        });
    };

    const flushStepAutosave = async () => {
        if (stepAutosaveTimer !== null) {
            clearTimeout(stepAutosaveTimer);
            stepAutosaveTimer = null;
        }

        if (!stepAutosavePromise) {
            stepAutosavePromise = persistStepsToGuide()
                .catch(error => {
                    console.error('Step autosave failed:', error);
                    throw error;
                })
                .finally(() => {
                    stepAutosavePromise = null;
                });
        }

        await stepAutosavePromise;
    };

    const scheduleStepAutosave = () => {
        if (!existingGuide?.id) return;
        if (stepAutosaveTimer !== null) {
            clearTimeout(stepAutosaveTimer);
        }

        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        stepAutosaveTimer = setTimeout(() => {
            stepAutosaveTimer = null;
            flushStepAutosave().catch(error => {
                console.error('Step autosave failed:', error);
            });
        }, 800);
    };

    const repairCollapsedStepTimestamps = async (transcript) => {
        if (stepTimestampRepairAttempted || steps.length < 2) return;

        const currentTimestamps = steps.map(step => Number(step.sourceTimestamp));
        const validTimestamps = currentTimestamps.filter(Number.isFinite);
        const uniqueTimestamps = new Set(
            validTimestamps.map(timestamp => timestamp.toFixed(3))
        );
        const timestampsAreCollapsed =
            validTimestamps.length !== steps.length
            || uniqueTimestamps.size <= 1;

        const renderedMappings = steps.map(step =>
            localSourceToVisibleTime(Number(step.sourceTimestamp) || 0)
        );
        const uniqueRenderedTimes = new Set(
            renderedMappings.map(mapping => Number(mapping.visibleTime || 0).toFixed(3))
        );
        const renderedTimelineIsCollapsed =
            renderedMappings.length > 1
            && renderedMappings.every(mapping => mapping.isRemoved)
            && uniqueRenderedTimes.size <= 1;

        if (!timestampsAreCollapsed && !renderedTimelineIsCollapsed) return;

        const visibleTranscriptWords = currentTranscriptWordsList
            .filter(visibleWord => visibleWord?.state !== 'removed' && visibleWord?.word)
            .map(visibleWord => visibleWord.word);
        const sourceWords = visibleTranscriptWords.length > 0
            ? visibleTranscriptWords
            : (Array.isArray(transcript?.words) ? transcript.words : []);
        const transcriptWords = sourceWords
                .map(word => ({
                    start: Number(word.startSourceTime ?? word.start),
                    end: Number(word.endSourceTime ?? word.end)
                }))
                .filter(word =>
                    Number.isFinite(word.start)
                    && Number.isFinite(word.end)
                    && word.end > word.start
                )
                .sort((a, b) => a.start - b.start)
            ;

        if (transcriptWords.length === 0) return;
        stepTimestampRepairAttempted = true;

        if (stepGenerationStatus) {
            stepGenerationStatus.style.display = 'block';
            stepGenerationStatus.innerText = 'Repairing saved step timings while preserving your notes…';
        }

        steps.forEach((step, index) => {
            const wordIndex = steps.length <= 1
                ? 0
                : Math.round(index * (transcriptWords.length - 1) / (steps.length - 1));
            step.sourceTimestamp = transcriptWords[wordIndex].start;
        });

        renderTimelineSteps();

        try {
            await persistStepsToGuide();
            if (stepGenerationStatus) {
                stepGenerationStatus.innerText = `${steps.length} step timings repaired. Your instructions and notes were preserved.`;
            }
        } catch (error) {
            hasUnsavedChanges = true;
            updateSaveStatusIndicator();
            if (stepGenerationStatus) {
                stepGenerationStatus.innerText = 'Step timings were repaired locally. Use Save Draft to keep them.';
            }
            console.error('Could not persist repaired step timings:', error);
        }
    };

    const requestStepTimestampRepair = (transcript) => {
        if (!transcript) return;
        latestTranscriptForStepRepair = transcript;

        const attemptRepair = () => {
            repairCollapsedStepTimestamps(latestTranscriptForStepRepair).catch(error => {
                console.error('Step timestamp repair failed:', error);
            });
        };

        attemptRepair();
        setTimeout(attemptRepair, 250);
        setTimeout(attemptRepair, 1000);
    };

    // Fetch user profile role on load
    supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
            supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data: profile }) => {
                userRole = profile?.role || 'learner';
            });
        }
    });

    const isTimelineSeqEditing = isSequenceTimelineEditingEnabled() && isSequencePlaybackEnabled();

    const hasUsableTimelineSequence = (sequence, duration) => {
        const clips = Array.isArray(sequence?.clips) ? sequence.clips : [];
        return duration > 0
            && clips.length > 0
            && clips.every(clip => {
                const start = Number(clip.sourceStart);
                const end = Number(clip.sourceEnd);
                return Number.isFinite(start)
                    && Number.isFinite(end)
                    && start >= 0
                    && end > start
                    && end <= duration + 0.01;
            });
    };

    const localSourceToVisibleTime = (sourceTime) => {
        const duration = editorVideo.duration || 0.0;
        const legacyMapping = sourceToVisibleTime(sourceTime, videoEdits, duration);

        if (isTimelineSeqEditing && timelineEditorController) {
            const sequence = timelineEditorController.getCommittedSequence();
            if (!hasUsableTimelineSequence(sequence, duration)) {
                return legacyMapping;
            }

            const res = seqSourceToVisibleTime(sequence, sourceTime);
            return {
                visibleTime: res.visibleTime,
                isRemoved: !res.isVisible,
                boundary: res.nearestBoundary === "previous" ? "cutEnd" : "cutStart"
            };
        }
        return legacyMapping;
    };

    // Steps remain anchored to the original recording. If their exact frame is
    // removed, the edited timeline places them at that cut's surviving join.
    const localStepToVisibleTime = (sourceTime) => {
        const mapping = localSourceToVisibleTime(sourceTime);
        return {
            ...mapping,
            isRemoved: false,
            wasReattachedToCut: Boolean(mapping.isRemoved)
        };
    };

    const localVisibleToSourceTime = (visibleTime) => {
        const duration = editorVideo.duration || 0.0;
        if (isTimelineSeqEditing && timelineEditorController) {
            const sequence = timelineEditorController.getCommittedSequence();
            if (hasUsableTimelineSequence(sequence, duration)) {
                return seqVisibleToSourceTime(sequence, visibleTime).sourceTime;
            }
        }
        return visibleToSourceTime(visibleTime, videoEdits, duration);
    };

    const localGetVisibleDuration = () => {
        const duration = editorVideo.duration || 0.0;
        if (isTimelineSeqEditing && timelineEditorController) {
            const sequence = timelineEditorController.getCommittedSequence();
            if (hasUsableTimelineSequence(sequence, duration)) {
                return timelineEditorController.getVisibleDuration();
            }
        }
        return getVisibleDuration(duration, videoEdits);
    };

    const preventUnload = (e) => {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
    };

    const updateSaveStatusIndicator = () => {
        const statusBadge = document.getElementById('sys-save-status');
        if (!statusBadge) return;

        statusBadge.style.display = 'inline-flex';

        if (hasUnsavedChanges) {
            statusBadge.className = 'save-status-badge unsaved';
            statusBadge.innerText = '● Unsaved changes';
            window.addEventListener('beforeunload', preventUnload);
        } else {
            statusBadge.className = 'save-status-badge saved';
            statusBadge.innerText = '✓ All changes saved';
            window.removeEventListener('beforeunload', preventUnload);
        }
    };

    let lastRenderedTranscriptId = null;
    let lastRenderedRevision = null;
    let lastRenderedTranscriptWords = null;
    let isProgrammaticScrolling = false;

    const getVisibleStepTimes = () => steps
        .map((step) => localSourceToVisibleTime(Number(step.sourceTimestamp) || 0))
        .filter((mapping) => !mapping.isRemoved && Number.isFinite(mapping.visibleTime))
        .map((mapping) => mapping.visibleTime);

    const getPauseShorteningPlan = (pauses) => {
        return buildPauseShorteningPlan(pauses, getVisibleStepTimes());
    };
    const getCurrentPauseShorteningPlan = () => getPauseShorteningPlan(currentTranscriptPauses);

    const updateShortenPausesButton = () => {
        if (!shortenPausesBtn) return;
        const canShorten = Boolean(
            timelineEditorController
            && isTimelineSeqEditing
            && currentTranscriptPauses.length > 0
        );
        shortenPausesBtn.style.display = canShorten ? 'inline-flex' : 'none';
        shortenPausesBtn.title = `Shorten pauses of ${PAUSE_THRESHOLD_SECONDS.toFixed(1)} seconds or longer to ${PAUSE_RETAIN_SECONDS.toFixed(1)} seconds`;
    };

    const getWordSpacing = (words, index) => {
        const word = words[index];
        const nextWord = words[index + 1];
        if (!nextWord) return "";

        const text = word.word.text;
        const nextText = nextWord.word.text;

        const leftAttachingPunctuation = /^[.,?!:;)'"\]]/;
        if (leftAttachingPunctuation.test(nextText)) {
            return "";
        }

        const rightAttachingPunctuation = /^[(['"]/;
        if (rightAttachingPunctuation.test(text)) {
            return "";
        }

        return " ";
    };

    const scrollWordIntoViewIfOutside = (activeEl) => {
        const container = document.getElementById('sys-transcript-content');
        if (!container || !activeEl) return;

        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;

        const elemTop = activeEl.offsetTop - container.offsetTop;
        const elemBottom = elemTop + activeEl.clientHeight;

        if (elemTop < containerTop || elemBottom > containerBottom) {
            isProgrammaticScrolling = true;
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    const updateWordHighlights = (diff) => {
        if (diff.previousActiveWordId) {
            const prevActiveEl = document.getElementById(`sys-word-${diff.previousActiveWordId}`);
            if (prevActiveEl) prevActiveEl.classList.remove('active');
        }
        if (diff.activeWordId) {
            const activeEl = document.getElementById(`sys-word-${diff.activeWordId}`);
            if (activeEl) {
                activeEl.classList.add('active');
                if (transcriptionUIController?.transcriptViewerController && transcriptionUIController.transcriptViewerController.getState().followPlayback) {
                    scrollWordIntoViewIfOutside(activeEl);
                }
            }
        }
        if (diff.previousSelectedWordId) {
            const prevSelectedEl = document.getElementById(`sys-word-${diff.previousSelectedWordId}`);
            if (prevSelectedEl) prevSelectedEl.classList.remove('selected');
        }
        if (diff.selectedWordId) {
            const selectedEl = document.getElementById(`sys-word-${diff.selectedWordId}`);
            if (selectedEl) selectedEl.classList.add('selected');
        }
    };

    const syncTranscriptSelectionVisualState = () => {
        const contentContainer = document.getElementById('sys-transcript-content');
        if (!contentContainer) return;

        const buttons = contentContainer.querySelectorAll("[data-transcript-selection-key]");
        buttons.forEach(button => {
            const key = button.dataset.transcriptSelectionKey;
            const isSelected = selectedTranscriptKeys.has(key);
            button.classList.toggle("selected", isSelected);
            if (isSelected) {
                button.setAttribute("aria-pressed", "true");
            } else {
                button.removeAttribute("aria-pressed");
            }
        });

        const removeBtn = document.getElementById('sys-transcript-remove-selection-btn');
        if (removeBtn) {
            if (selectedTranscriptKeys.size > 0) {
                removeBtn.style.display = 'inline-flex';
                let allRemoved = true;
                const selectedItems = currentTranscriptSelectableItems.filter(item => selectedTranscriptKeys.has(item.key));
                selectedItems.forEach(item => {
                    if (item.kind === 'word' && item.visibleWord.state !== 'removed') allRemoved = false;
                    if (item.kind === 'pause') allRemoved = false;
                });

                if (allRemoved) {
                    removeBtn.innerText = 'Restore this section';
                    removeBtn.style.background = '#3b82f6';
                    removeBtn.style.borderColor = '#3b82f6';
                } else {
                    removeBtn.innerText = 'Remove selected text from video';
                    removeBtn.style.background = '#10b981';
                    removeBtn.style.borderColor = '#10b981';
                }
            } else {
                removeBtn.style.display = 'none';
            }
        }
    };

    const clearTranscriptSelection = () => {
        selectedTranscriptKeys.clear();
        transcriptSelectionAnchorIndex = null;
        transcriptSelectionFocusIndex = null;
        isDraggingTranscriptSelection = false;
        syncTranscriptSelectionVisualState();
    };

    window.addEventListener('pointerup', () => {
        if (isDraggingTranscriptSelection) {
            isDraggingTranscriptSelection = false;
        }
    });

    const selectTranscriptRange = (anchorIndex, focusIndex) => {
        const minimum = Math.min(anchorIndex, focusIndex);
        const maximum = Math.max(anchorIndex, focusIndex);

        selectedTranscriptKeys = new Set(
            currentTranscriptSelectableItems
                .slice(minimum, maximum + 1)
                .map(item => item.key)
        );

        transcriptSelectionAnchorIndex = anchorIndex;
        transcriptSelectionFocusIndex = focusIndex;
        syncTranscriptSelectionVisualState();
    };

    const handleTranscriptItemClick = (event, item) => {
        if (event.shiftKey && transcriptSelectionAnchorIndex !== null) {
            selectTranscriptRange(transcriptSelectionAnchorIndex, item.orderIndex);
        } else {
            selectedTranscriptKeys.clear();
            selectedTranscriptKeys.add(item.key);
            transcriptSelectionAnchorIndex = item.orderIndex;
            transcriptSelectionFocusIndex = item.orderIndex;
            syncTranscriptSelectionVisualState();

            if (item.kind === 'pause') {
                const previewTime = Math.max(0, item.pause.visibleStart - 0.2);
                if (playbackCoordinator) {
                    playbackCoordinator.seekVisibleTime(previewTime);
                } else {
                    editorVideo.currentTime = localVisibleToSourceTime(previewTime);
                }
            } else if (item.kind === 'word') {
                if (transcriptionUIController?.transcriptViewerController && playbackCoordinator) {
                    const targetSourceTime = transcriptionUIController.transcriptViewerController.getSeekTarget(item.visibleWord.word.id);
                    playbackCoordinator.seekSourceTime(targetSourceTime);
                }
            }
        }
    };

    const renderTranscriptSelection = () => { syncTranscriptSelectionVisualState(); };

    const handleRemoveSelection = () => {
        const selectedItems = currentTranscriptSelectableItems.filter(item => selectedTranscriptKeys.has(item.key));
        if (selectedItems.length === 0) return;

        const selectedWordItems = selectedItems.filter(item => item.kind === "word");
        const selectedPauseItems = selectedItems.filter(item => item.kind === "pause");

        const allSelectedWordsRemoved = selectedWordItems.length > 0 && selectedWordItems.every(item => item.visibleWord.state === "removed");

        if (selectedPauseItems.length === 0 && allSelectedWordsRemoved) {
            // Legacy Word-Only Restoration
            const cutStart = selectedWordItems[0].visibleWord.word.startSourceTime;
            const cutEnd = selectedWordItems[selectedWordItems.length - 1].visibleWord.word.endSourceTime;
            try {
                if (timelineEditorController && isTimelineSeqEditing) {
                    timelineEditorController.restoreRemovedRange(cutStart, cutEnd);
                }
                clearTranscriptSelection();
            } catch (err) {
                console.error("Failed to restore range", err);
                fswAlert("Failed to restore selected text to video.");
            }
            return;
        }

        // 1. Build word removal ranges
        const wordRanges = [];
        let currentWordRun = [];

        for (let i = 0; i < currentTranscriptSelectableItems.length; i++) {
            const item = currentTranscriptSelectableItems[i];
            if (selectedTranscriptKeys.has(item.key) && item.kind === 'word') {
                currentWordRun.push(item);
            } else {
                if (currentWordRun.length > 0) {
                    const firstWord = currentWordRun[0].visibleWord;
                    const lastWord = currentWordRun[currentWordRun.length - 1].visibleWord;
                    wordRanges.push({
                        visibleStart: firstWord.visibleStartTime,
                        visibleEnd: lastWord.visibleEndTime
                    });
                    currentWordRun = [];
                }
            }
        }
        if (currentWordRun.length > 0) {
            const firstWord = currentWordRun[0].visibleWord;
            const lastWord = currentWordRun[currentWordRun.length - 1].visibleWord;
            wordRanges.push({
                visibleStart: firstWord.visibleStartTime,
                visibleEnd: lastWord.visibleEndTime
            });
        }

        // 2. Build pause removal ranges
        const selectedPauses = selectedPauseItems.map(item => item.pause);
        const pausePlan = getPauseShorteningPlan(selectedPauses);
        const pauseRanges = pausePlan.eligible.map(pause => ({
            visibleStart: pause.removalVisibleStart,
            visibleEnd: pause.removalVisibleEnd
        }));

        // 3. Normalise and merge ranges
        let allRanges = [...wordRanges, ...pauseRanges].filter(r => Number.isFinite(r.visibleStart) && Number.isFinite(r.visibleEnd) && r.visibleEnd > r.visibleStart);
        allRanges.sort((a, b) => a.visibleStart - b.visibleStart);

        const finalRanges = [];
        const EPSILON = 1e-6;
        for (const range of allRanges) {
            if (finalRanges.length === 0) {
                finalRanges.push(range);
                continue;
            }
            const last = finalRanges[finalRanges.length - 1];
            if (range.visibleStart <= last.visibleEnd + EPSILON) {
                last.visibleEnd = Math.max(last.visibleEnd, range.visibleEnd);
            } else {
                finalRanges.push(range);
            }
        }

        if (finalRanges.length === 0) {
            if (pausePlan.protected.length > 0) {
                fswAlert("The selected pauses contain guide steps and were left unchanged.");
            }
            return;
        }

        try {
            if (timelineEditorController && isTimelineSeqEditing) {
                timelineEditorController.removeVisibleRanges(finalRanges);

                let noticeText = "Selection removed.";
                if (pausePlan.protected.length > 0) {
                    noticeText += ` ${pausePlan.protected.length} selected pause(s) contained a guide step and were left unchanged.`;
                }

                const affectedStepCount = steps.filter((step) => {
                    const mapping = localSourceToVisibleTime(Number(step.sourceTimestamp) || 0);
                    return !mapping.isRemoved && finalRanges.some(r => mapping.visibleTime >= r.visibleStart && mapping.visibleTime < r.visibleEnd);
                }).length;

                if (affectedStepCount > 0) {
                    const stepLabel = affectedStepCount === 1 ? 'guide step was' : 'guide steps were';
                    noticeText += ` ${affectedStepCount} ${stepLabel} moved to the nearest remaining moment.`;
                }

                showTranscriptNotice(noticeText);
                clearTranscriptSelection();
            }
        } catch (err) {
            console.error("Failed to remove range", err);
            fswAlert("Failed to remove selected sections from video.");
        }
    };

    const announceTranscript = (msg) => {
        const announcer = document.getElementById('sys-transcript-announcer');
        if (announcer) {
            announcer.textContent = msg;
        }
    };

    let transcriptNoticeTimer = null;
    const showTranscriptNotice = (message) => {
        if (!transcriptProgressMsg) return;
        clearTimeout(transcriptNoticeTimer);
        transcriptProgressMsg.innerText = message;
        transcriptProgressMsg.style.display = 'block';
        transcriptProgressMsg.style.color = '#10b981';
        transcriptProgressMsg.style.fontStyle = 'normal';
        transcriptNoticeTimer = setTimeout(() => {
            transcriptProgressMsg.style.display = 'none';
        }, 5000);
    };

    const renderTranscriptState = (state) => {
        const contentContainer = document.getElementById('sys-transcript-content');
        if (!contentContainer) return;

        const followBtn = document.getElementById('sys-transcript-follow-btn');
        if (followBtn) {
            if (state.status === 'ready') {
                followBtn.style.display = 'inline-flex';
                if (state.followPlayback) {
                    followBtn.classList.add('active');
                    followBtn.setAttribute('aria-pressed', 'true');
                    followBtn.innerHTML = '<span>●</span> Follow Playback';
                } else {
                    followBtn.classList.remove('active');
                    followBtn.setAttribute('aria-pressed', 'false');
                    followBtn.innerHTML = '<span>○</span> Follow Playback';
                }
            } else {
                followBtn.style.display = 'none';
            }
        }

        const langBadge = document.getElementById('sys-transcript-lang');
        if (langBadge) {
            if (state.status === 'ready' && state.transcript && state.transcript.language && state.transcript.language.toLowerCase() !== 'en') {
                langBadge.textContent = state.transcript.language.toUpperCase();
                langBadge.style.display = 'inline-block';
            } else {
                langBadge.style.display = 'none';
            }
        }

        if (state.status === 'loading') {
            contentContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; gap: 0.5rem; padding: 2rem 0; color: var(--text-muted);">
                    <div class="loader" style="border: 2px solid rgba(255,255,255,0.1); border-top: 2px solid var(--primary); border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite;"></div>
                    <span style="font-size: 0.85rem;">Loading transcript...</span>
                </div>
            `;
            announceTranscript("Loading transcript...");
            lastRenderedTranscriptId = null;
            lastRenderedRevision = null;
            lastRenderedTranscriptWords = null;
            currentTranscriptPauses = [];
            updateShortenPausesButton();
            return;
        }

        if (state.status === 'empty') {
            const generateBtn = document.getElementById('sys-generate-transcript-btn');
            if (generateBtn) generateBtn.style.display = 'block';
            contentContainer.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0; font-style: italic;">
                    No transcript available for this walkthrough.
                </div>
            `;
            announceTranscript("No transcript available.");
            lastRenderedTranscriptId = null;
            lastRenderedRevision = null;
            lastRenderedTranscriptWords = null;
            currentTranscriptPauses = [];
            updateShortenPausesButton();
            return;
        } else {
            const generateBtn = document.getElementById('sys-generate-transcript-btn');
            if (generateBtn) generateBtn.style.display = 'none';
        }

        if (state.status === 'error') {
            const generateBtn = document.getElementById('sys-generate-transcript-btn');
            if (generateBtn && existingGuide?.id && sourceAssetId) {
                generateBtn.style.display = 'block';
            }
            contentContainer.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0; font-style: italic; text-align: center;">
                    No transcript is available yet. Generate one from the saved recording below.
                </div>
            `;
            announceTranscript("No transcript available.");
            lastRenderedTranscriptId = null;
            lastRenderedRevision = null;
            lastRenderedTranscriptWords = null;
            currentTranscriptPauses = [];
            updateShortenPausesButton();
            return;
        }

        if (state.status === 'ready' && state.transcript) {
            currentTranscriptWordsList = state.visibleWords || [];
            requestStepTimestampRepair(state.transcript);
            let hasRemovedWords = false;

            if (
                lastRenderedTranscriptId === state.transcript.id
                && lastRenderedRevision === state.transcript.revision
                && lastRenderedTranscriptWords === state.visibleWords
            ) {
                for (const vw of state.visibleWords) {
                    const btn = document.getElementById(`sys-word-${vw.word.id}`);
                    if (btn) {
                        if (vw.state === 'removed') {
                            hasRemovedWords = true;
                            btn.classList.add('removed');
                            btn.setAttribute('aria-label', `${vw.word.text} (removed)`);
                            btn.setAttribute('aria-describedby', 'sys-removed-word-desc');
                        } else {
                            btn.classList.remove('removed');
                            btn.setAttribute('aria-label', vw.word.text);
                        }
                    }
                }
                const restoreAllBtn = document.getElementById('sys-transcript-restore-all-btn');
                if (restoreAllBtn) {
                    restoreAllBtn.style.display = hasRemovedWords ? 'inline-flex' : 'none';
                }
                updateShortenPausesButton();
                return;
            }

            contentContainer.innerHTML = "";
            const fragment = document.createDocumentFragment();
            const wordsList = state.visibleWords;
            currentTranscriptPauses = detectTranscriptPauses(wordsList);
            const pausesBeforeWord = new Map(
                currentTranscriptPauses.map((pause) => [pause.nextWordId, pause])
            );

            currentTranscriptSelectableItems = [];

            wordsList.forEach((vw, index) => {
                const pause = pausesBeforeWord.get(vw.word.id);
                if (pause) {
                    currentTranscriptSelectableItems.push({
                        key: getPauseSelectionKey(pause.id),
                        kind: 'pause',
                        orderIndex: currentTranscriptSelectableItems.length,
                        pause
                    });
                }
                currentTranscriptSelectableItems.push({
                    key: getWordSelectionKey(vw.word.id),
                    kind: 'word',
                    orderIndex: currentTranscriptSelectableItems.length,
                    wordIndex: index,
                    visibleWord: vw
                });
            });

            currentTranscriptSelectableItems.forEach(item => {
                if (item.kind === 'pause') {
                    const pauseBtn = document.createElement('button');
                    pauseBtn.type = 'button';
                    pauseBtn.className = 'sys-transcript-pause';
                    pauseBtn.id = `sys-${item.pause.id}`;
                    pauseBtn.textContent = `… ${item.pause.duration.toFixed(1)}s`;
                    pauseBtn.title = `Pause of ${item.pause.duration.toFixed(1)} seconds. Select to delete/shorten.`;
                    pauseBtn.setAttribute('aria-label', `Pause of ${item.pause.duration.toFixed(1)} seconds. Select to delete.`);

                    pauseBtn.dataset.transcriptSelectionKey = item.key;
                    pauseBtn.dataset.transcriptSelectionIndex = String(item.orderIndex);
                    pauseBtn.dataset.transcriptSelectionKind = item.kind;

                    pauseBtn.addEventListener('mousedown', (e) => {
                        if (e.button !== 0) return;
                        isDraggingTranscriptSelection = true;
                        handleTranscriptItemClick(e, item);
                    });
                    pauseBtn.addEventListener('mouseenter', () => {
                        if (isDraggingTranscriptSelection) {
                            selectTranscriptRange(transcriptSelectionAnchorIndex, item.orderIndex);
                        }
                    });

                    fragment.appendChild(pauseBtn);
                    fragment.appendChild(document.createTextNode(' '));
                } else {
                    const vw = item.visibleWord;
                    if (vw.state === 'removed') hasRemovedWords = true;
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'sys-transcript-word';
                    btn.id = `sys-word-${vw.word.id}`;
                    btn.textContent = vw.word.text;

                    if (vw.state === 'removed') {
                        btn.classList.add('removed');
                        btn.setAttribute('aria-label', `${vw.word.text} (removed)`);
                        btn.setAttribute('aria-describedby', 'sys-removed-word-desc');
                    } else {
                        btn.setAttribute('aria-label', vw.word.text);
                    }

                    btn.dataset.transcriptSelectionKey = item.key;
                    btn.dataset.transcriptSelectionIndex = String(item.orderIndex);
                    btn.dataset.transcriptSelectionKind = item.kind;

                    btn.addEventListener('mousedown', (e) => {
                        if (e.button !== 0) return;
                        isDraggingTranscriptSelection = true;
                        handleTranscriptItemClick(e, item);
                    });
                    btn.addEventListener('mouseenter', () => {
                        if (isDraggingTranscriptSelection) {
                            selectTranscriptRange(transcriptSelectionAnchorIndex, item.orderIndex);
                        }
                    });

                    fragment.appendChild(btn);

                    const spacing = getWordSpacing(wordsList, item.wordIndex);
                    if (spacing) {
                        fragment.appendChild(document.createTextNode(spacing));
                    }
                }
            });

            contentContainer.appendChild(fragment);
            currentTranscriptWordsList = wordsList;
            syncTranscriptSelectionVisualState();

            const restoreAllBtn = document.getElementById('sys-transcript-restore-all-btn');
            if (restoreAllBtn) {
                restoreAllBtn.style.display = hasRemovedWords ? 'inline-flex' : 'none';
            }

            lastRenderedTranscriptId = state.transcript.id;
            lastRenderedRevision = state.transcript.revision;
            lastRenderedTranscriptWords = state.visibleWords;
            updateShortenPausesButton();
            announceTranscript("Transcript ready.");
        }
    };

    // Time Formatter Utilities
    const formatTimeReadable = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return "00:00.0";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const tenths = Math.floor((seconds % 1) * 10);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
    };

    const parseTimeReadable = (str) => {
        if (!str) return NaN;
        const parts = str.trim().split(':');
        if (parts.length === 2) {
            const mins = parseFloat(parts[0]);
            const secs = parseFloat(parts[1]);
            if (isNaN(mins) || isNaN(secs)) return NaN;
            return mins * 60 + secs;
        } else if (parts.length === 1) {
            return parseFloat(parts[0]);
        }
        return NaN;
    };

    // State for pending steps warning modal
    let pendingCutStart = null;
    let pendingCutEnd = null;
    let pendingTrimVal = null;
    let pendingTrimType = null;
    let pendingApplyCallback = null;

    const showStepsWarningModal = (affectedSteps, editType, boundaryVal, onApply) => {
        pendingApplyCallback = onApply;
        if (editType === 'trimStart') {
            pendingTrimVal = boundaryVal;
            pendingTrimType = 'trimStart';
        } else if (editType === 'trimEnd') {
            pendingTrimVal = boundaryVal;
            pendingTrimType = 'trimEnd';
        } else if (editType === 'cut') {
            pendingCutStart = boundaryVal.start;
            pendingCutEnd = boundaryVal.end;
        }

        stepsWarningMsg.innerText = `This edit affects ${affectedSteps.length} guide step(s). Choose how to handle them:`;
        stepsResolutionList.innerHTML = '';

        const globalRow = document.createElement('div');
        globalRow.style.cssText = "display: flex; flex-direction: column; gap: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 0.5rem;";
        globalRow.innerHTML = `
            <label style="font-size: 0.85rem; font-weight: bold; color: var(--text-main);">Global Action:</label>
            <select id="sys-global-action" style="padding: 0.5rem; background: rgba(0,0,0,0.4); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: 4px; outline: none;">
                <option value="move-before">Move all immediately before the cut/trim</option>
                <option value="move-after">Move all immediately after the cut/trim</option>
                <option value="delete">Delete all affected steps</option>
                <option value="individual">Review individually...</option>
            </select>
        `;
        stepsResolutionList.appendChild(globalRow);

        const individualContainer = document.createElement('div');
        individualContainer.id = 'sys-individual-container';
        individualContainer.style.cssText = "display: none; flex-direction: column; gap: 0.75rem;";

        affectedSteps.forEach((step) => {
            const stepRow = document.createElement('div');
            stepRow.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 4px; font-size: 0.85rem;";
            stepRow.innerHTML = `
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">Step ${steps.indexOf(step) + 1}: <strong>${step.instruction || '(Untitled)'}</strong></span>
                <select class="sys-step-resolution" data-step-id="${step.id}" style="padding: 0.35rem; background: rgba(0,0,0,0.4); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: 4px; outline: none;">
                    <option value="move-before">Move before</option>
                    <option value="move-after">Move after</option>
                    <option value="delete">Delete step</option>
                </select>
            `;
            individualContainer.appendChild(stepRow);
        });
        stepsResolutionList.appendChild(individualContainer);

        const globalSelect = globalRow.querySelector('#sys-global-action');
        globalSelect.addEventListener('change', (e) => {
            if (e.target.value === 'individual') {
                individualContainer.style.display = 'flex';
            } else {
                individualContainer.style.display = 'none';
            }
        });

        stepsWarningDialog.style.display = 'flex';
    };

    stepsWarningConfirmBtn.addEventListener('click', () => {
        const globalSelect = document.getElementById('sys-global-action');
        const globalAction = globalSelect.value;

        const resolveStep = (stepId, action) => {
            const step = steps.find(s => s.id === stepId);
            if (!step) return;

            if (action === 'delete') {
                const idx = steps.indexOf(step);
                if (idx !== -1) steps.splice(idx, 1);
            } else if (action === 'move-before') {
                if (pendingCutStart !== null) {
                    step.sourceTimestamp = Math.max(0.0, pendingCutStart - 0.01);
                } else if (pendingTrimVal !== null) {
                    step.sourceTimestamp = Math.max(0.0, pendingTrimVal - 0.01);
                }
            } else if (action === 'move-after') {
                if (pendingCutEnd !== null) {
                    step.sourceTimestamp = pendingCutEnd;
                } else if (pendingTrimVal !== null) {
                    step.sourceTimestamp = pendingTrimVal;
                }
            }
        };

        const affectedStepRows = stepsResolutionList.querySelectorAll('.sys-step-resolution');
        const affectedIds = [];

        affectedStepRows.forEach(select => {
            affectedIds.push({
                id: select.getAttribute('data-step-id'),
                action: globalAction === 'individual' ? select.value : globalAction
            });
        });

        if (globalAction !== 'individual') {
            let inRange = [];
            if (pendingTrimVal !== null) {
                if (pendingTrimType === 'trimStart') {
                    inRange = steps.filter(s => s.sourceTimestamp < pendingTrimVal);
                } else {
                    inRange = steps.filter(s => s.sourceTimestamp >= pendingTrimVal);
                }
            } else {
                inRange = steps.filter(s => s.sourceTimestamp >= pendingCutStart && s.sourceTimestamp < pendingCutEnd);
            }
            inRange.forEach(s => {
                affectedIds.push({ id: s.id, action: globalAction });
            });
        }

        affectedIds.forEach(item => {
            resolveStep(item.id, item.action);
        });

        steps.sort((a, b) => a.sourceTimestamp - b.sourceTimestamp || a.createdOrder - b.createdOrder);
        stepsWarningDialog.style.display = 'none';

        if (pendingApplyCallback) {
            pendingApplyCallback();
        }

        pendingCutStart = null;
        pendingCutEnd = null;
        pendingTrimVal = null;
        pendingTrimType = null;
        pendingApplyCallback = null;
    });

    stepsWarningCancelBtn.addEventListener('click', () => {
        stepsWarningDialog.style.display = 'none';
        pendingCutStart = null;
        pendingCutEnd = null;
        pendingTrimVal = null;
        pendingTrimType = null;
        pendingApplyCallback = null;
    });

    // Undo/Redo toasts
    let undoToastTimeout = null;
    const showUndoToast = (type, prevValue) => {
        const existing = document.getElementById('sys-undo-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'sys-undo-toast';
        toast.style.cssText = "position: fixed; bottom: 2rem; right: 2rem; background: rgba(16, 185, 129, 0.95); color: var(--text-main); padding: 0.8rem 1.5rem; border-radius: var(--radius-md); font-weight: 500; font-size: 0.9rem; z-index: 100005; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 1rem; backdrop-filter: blur(10px);";
        toast.innerHTML = `
            <span>Cut restored.</span>
            <button style="background: none; border: none; color: var(--text-main); text-decoration: underline; font-weight: bold; cursor: pointer; padding: 0; outline: none; font-family: inherit;">Undo</button>
        `;
        document.body.appendChild(toast);

        toast.querySelector('button').addEventListener('click', () => {
            if (type === 'trimStart') {
                videoEdits.trimStart = prevValue;
            } else if (type === 'trimEnd') {
                videoEdits.trimEnd = prevValue;
            } else if (type === 'cuts') {
                videoEdits.cuts = prevValue;
            }
            videoEdits = normalizeEdits(videoEdits, editorVideo.duration || 0);
            hasUnsavedChanges = true;
            if (renderStatus === 'ready') renderStatus = 'stale';
            updateSaveStatusIndicator();
            renderActiveEdits();
            renderTimelineSteps();
            toast.remove();
        });

        clearTimeout(undoToastTimeout);
        undoToastTimeout = setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 5000);
    };

    // Cut Previews Playback
    const playCutPreview = (startSource, endSource) => {
        const duration = editorVideo.duration || 0.0;

        if (playbackCoordinator) {
            const state = playbackCoordinator.getState();
            if (!state) return;
            const prevVisible = state.visibleTime;
            const prevPlaying = state.status === 'playing';

            const startVisibleMapping = localSourceToVisibleTime(startSource);
            const previewStartVisible = Math.max(0.0, startVisibleMapping.visibleTime - 2.0);
            const previewStopVisible = startVisibleMapping.visibleTime + 2.0;

            playbackCoordinator.seekVisibleTime(previewStartVisible);
            playbackCoordinator.play();

            const checkStop = () => {
                const currentState = playbackCoordinator.getState();
                if (currentState && (currentState.visibleTime >= previewStopVisible || currentState.ended)) {
                    playbackCoordinator.pause();
                    playbackCoordinator.seekVisibleTime(prevVisible);
                    if (prevPlaying) playbackCoordinator.play();
                    editorVideo.removeEventListener('timeupdate', checkStop);
                }
            };
            editorVideo.addEventListener('timeupdate', checkStop);
            return;
        }

        const prevPosition = editorVideo.currentTime;
        const prevPlaying = !editorVideo.paused;
        const prevVolume = editorVideo.volume;
        const prevSpeed = editorVideo.playbackRate;

        const startVisibleMapping = localSourceToVisibleTime(startSource);
        const previewStartVisible = Math.max(0.0, startVisibleMapping.visibleTime - 2.0);
        const previewStartRaw = localVisibleToSourceTime(previewStartVisible);

        const previewStopVisible = startVisibleMapping.visibleTime + 2.0;

        editorVideo.currentTime = previewStartRaw;
        editorVideo.play();

        const checkStop = () => {
            const currentVisible = localSourceToVisibleTime(editorVideo.currentTime).visibleTime;
            if (currentVisible >= previewStopVisible || editorVideo.currentTime >= (videoEdits.trimEnd || duration)) {
                editorVideo.pause();
                editorVideo.currentTime = prevPosition;
                editorVideo.volume = prevVolume;
                editorVideo.playbackRate = prevSpeed;
                if (prevPlaying) editorVideo.play();
                editorVideo.removeEventListener('timeupdate', checkStop);
            }
        };
        editorVideo.addEventListener('timeupdate', checkStop);
    };

    // Render edit list panel
    const renderActiveEdits = () => {
        if (playbackCoordinator) {
            playbackCoordinator.refreshSequence();
        }
        activeEditsList.innerHTML = '';
        const duration = editorVideo.duration || 0;

        if (videoEdits.trimStart > 0.0) {
            const div = document.createElement('div');
            div.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 4px; font-size: 0.85rem;";
            div.innerHTML = `
                <span>Trimmed first <strong>${videoEdits.trimStart.toFixed(1)}s</strong></span>
                <button class="btn-ghost sys-restore-trim-start" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid var(--glass-border); border-radius: 4px; cursor: pointer; color: #ef4444; outline: none;">Restore</button>
            `;
            activeEditsList.appendChild(div);
            div.querySelector('.sys-restore-trim-start').addEventListener('click', () => {
                const oldVal = videoEdits.trimStart;
                if (isTimelineSeqEditing && timelineEditorController) {
                    try {
                        timelineEditorController.restoreRemovedRange(0, oldVal);
                    } catch (err) {
                        fswAlert(err.message || "Failed to restore start trim.");
                    }
                    return;
                }
                videoEdits.trimStart = 0.0;
                videoEdits = normalizeEdits(videoEdits, duration);
                hasUnsavedChanges = true;
                if (renderStatus === 'ready') renderStatus = 'stale';
                updateSaveStatusIndicator();
                renderActiveEdits();
                renderTimelineSteps();
                showUndoToast("trimStart", oldVal);
            });
        }

        const cuts = videoEdits.cuts || [];
        cuts.forEach((cut) => {
            const div = document.createElement('div');
            div.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 4px; font-size: 0.85rem;";
            div.innerHTML = `
                <span>Removed <strong>${formatTimeReadable(cut.start)}</strong> to <strong>${formatTimeReadable(cut.end)}</strong> (${(cut.end - cut.start).toFixed(1)}s)</span>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-ghost sys-preview-cut-item" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid var(--glass-border); border-radius: 4px; cursor: pointer; color: var(--primary); outline: none;">Preview</button>
                    <button class="btn-ghost sys-restore-cut" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid var(--glass-border); border-radius: 4px; cursor: pointer; color: #ef4444; outline: none;">Restore</button>
                </div>
            `;
            activeEditsList.appendChild(div);

            div.querySelector('.sys-preview-cut-item').addEventListener('click', () => {
                playCutPreview(cut.start, cut.end);
            });

            div.querySelector('.sys-restore-cut').addEventListener('click', () => {
                const oldCuts = [...videoEdits.cuts];
                if (isTimelineSeqEditing && timelineEditorController) {
                    try {
                        timelineEditorController.restoreRemovedRange(cut.start, cut.end);
                    } catch (err) {
                        fswAlert(err.message || "Failed to restore cut.");
                    }
                    return;
                }
                videoEdits.cuts = videoEdits.cuts.filter(c => c.id !== cut.id);
                videoEdits = normalizeEdits(videoEdits, duration);
                hasUnsavedChanges = true;
                if (renderStatus === 'ready') renderStatus = 'stale';
                updateSaveStatusIndicator();
                renderActiveEdits();
                renderTimelineSteps();
                showUndoToast("cuts", oldCuts);
            });
        });

        if (videoEdits.trimEnd !== null) {
            const div = document.createElement('div');
            div.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 4px; font-size: 0.85rem;";
            div.innerHTML = `
                <span>Trimmed after <strong>${videoEdits.trimEnd.toFixed(1)}s</strong></span>
                <button class="btn-ghost sys-restore-trim-end" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid var(--glass-border); border-radius: 4px; cursor: pointer; color: #ef4444; outline: none;">Restore</button>
            `;
            activeEditsList.appendChild(div);
            div.querySelector('.sys-restore-trim-end').addEventListener('click', () => {
                const oldVal = videoEdits.trimEnd;
                if (isTimelineSeqEditing && timelineEditorController) {
                    try {
                        timelineEditorController.restoreRemovedRange(oldVal, duration);
                    } catch (err) {
                        fswAlert(err.message || "Failed to restore end trim.");
                    }
                    return;
                }
                videoEdits.trimEnd = null;
                videoEdits = normalizeEdits(videoEdits, duration);
                hasUnsavedChanges = true;
                if (renderStatus === 'ready') renderStatus = 'stale';
                updateSaveStatusIndicator();
                renderActiveEdits();
                renderTimelineSteps();
                showUndoToast("trimEnd", oldVal);
            });
        }

        updateEditVideoBtnLabel();
    };

    const updateEditVideoBtnLabel = () => {
        let count = 0;
        if (videoEdits.trimStart > 0.0) count++;
        if (videoEdits.trimEnd !== null) count++;
        count += (videoEdits.cuts || []).length;

        if (editVideoToggleBtn) {
            editVideoToggleBtn.innerHTML = count > 0 ? `✂️ Edit Video (${count})` : `✂️ Edit Video`;
        }
    };

    // Toggle Editing Drawer Panel
    if (editVideoToggleBtn && videoEditPanel) {
        editVideoToggleBtn.addEventListener('click', () => {
            const isPanelVisible = videoEditPanel.style.display === 'flex';
            videoEditPanel.style.display = isPanelVisible ? 'none' : 'flex';
            renderActiveEdits();
        });
    }

    // Trim Triggers
    const applyTrimStart = (rawTime) => {
        const duration = editorVideo.duration || 0.0;
        if (isTimelineSeqEditing && timelineEditorController) {
            try {
                const visibleTime = localSourceToVisibleTime(rawTime).visibleTime;
                timelineEditorController.setStartTrim(visibleTime);
                editorVideo.currentTime = rawTime;
            } catch (err) {
                fswAlert(err.message || "Failed to apply start trim.");
            }
            return;
        }
        videoEdits.trimStart = rawTime;
        videoEdits = normalizeEdits(videoEdits, duration);
        hasUnsavedChanges = true;
        if (renderStatus === 'ready') renderStatus = 'stale';
        updateSaveStatusIndicator();
        renderActiveEdits();
        renderTimelineSteps();
        editorVideo.currentTime = rawTime;
    };

    trimBeforeBtn.addEventListener('click', () => {
        const rawTime = parseFloat(editorVideo.currentTime.toFixed(1));
        const affectedSteps = steps.filter(s => s.sourceTimestamp < rawTime);
        if (affectedSteps.length > 0) {
            showStepsWarningModal(affectedSteps, "trimStart", rawTime, () => {
                applyTrimStart(rawTime);
            });
        } else {
            applyTrimStart(rawTime);
        }
    });

    const applyTrimEnd = (rawTime) => {
        const duration = editorVideo.duration || 0.0;
        if (isTimelineSeqEditing && timelineEditorController) {
            try {
                const visibleTime = localSourceToVisibleTime(rawTime).visibleTime;
                timelineEditorController.setEndTrim(visibleTime);
                editorVideo.currentTime = rawTime;
            } catch (err) {
                fswAlert(err.message || "Failed to apply end trim.");
            }
            return;
        }
        videoEdits.trimEnd = rawTime;
        videoEdits = normalizeEdits(videoEdits, duration);
        hasUnsavedChanges = true;
        if (renderStatus === 'ready') renderStatus = 'stale';
        updateSaveStatusIndicator();
        renderActiveEdits();
        renderTimelineSteps();
        editorVideo.currentTime = rawTime;
    };

    trimAfterBtn.addEventListener('click', () => {
        const rawTime = parseFloat(editorVideo.currentTime.toFixed(1));
        const affectedSteps = steps.filter(s => s.sourceTimestamp >= rawTime);
        if (affectedSteps.length > 0) {
            showStepsWarningModal(affectedSteps, "trimEnd", rawTime, () => {
                applyTrimEnd(rawTime);
            });
        } else {
            applyTrimEnd(rawTime);
        }
    });

    // Custom Player Controls
    playPauseBtn.addEventListener('click', () => {
        if (playbackCoordinator) {
            playbackCoordinator.togglePlayback();
            const state = playbackCoordinator.getState();
            if (state) {
                const isPlaying = state.status === 'playing';
                playPauseBtn.innerHTML = isPlaying ? '<span id="sys-play-icon">⏸</span> Pause' : '<span id="sys-play-icon">▶</span> Play';
            }
            return;
        }

        if (editorVideo.paused) {
            editorVideo.play();
            playPauseBtn.innerHTML = '<span id="sys-play-icon">⏸</span> Pause';
        } else {
            editorVideo.pause();
            playPauseBtn.innerHTML = '<span id="sys-play-icon">▶</span> Play';
        }
    });

    playbackSpeedSelect.addEventListener('change', () => {
        const rate = parseFloat(playbackSpeedSelect.value);
        if (playbackCoordinator) {
            playbackCoordinator.setPlaybackRate(rate);
        } else {
            editorVideo.playbackRate = rate;
        }
    });

    muteBtn.addEventListener('click', () => {
        if (playbackCoordinator) {
            const state = playbackCoordinator.getState();
            if (state) {
                playbackCoordinator.setMuted(!state.muted);
                muteBtn.innerText = !state.muted ? '🔇' : '🔊';
            }
        } else {
            editorVideo.muted = !editorVideo.muted;
            muteBtn.innerText = editorVideo.muted ? '🔇' : '🔊';
        }
    });

    fullscreenPlayerBtn.addEventListener('click', () => {
        if (editorVideo.requestFullscreen) {
            editorVideo.requestFullscreen();
        } else if (editorVideo.webkitRequestFullscreen) {
            editorVideo.webkitRequestFullscreen();
        }
    });

    // Central state for visual selection (in visible seconds)
    let isCutMode = false;
    let previousPlayheadPosition = 0;
    let previousPlaybackState = false;
    let cutSelection = { startVisibleTime: 0, endVisibleTime: 0 };
    let activeDragType = null; // 'start', 'end', 'range', 'playhead'
    let dragStartCoords = { x: 0, startVisible: 0, endVisible: 0 };

    const updatePlayheadPosition = () => {
        if (playbackCoordinator) {
            const state = playbackCoordinator.getState();
            if (state) {
                const percent = state.visibleDuration > 0 ? (state.visibleTime / state.visibleDuration) : 0;
                const trackWidth = timelineTrack.clientWidth || 600;
                const playheadLeft = percent * trackWidth;
                playhead.style.transform = `translate3d(${playheadLeft}px, 0, 0)`;
                timelineTrack.setAttribute('aria-valuenow', state.visibleTime.toFixed(1));
                timelineTrack.setAttribute('aria-valuetext', formatTimeReadable(state.visibleTime));
                timelineTrack.setAttribute('aria-valuemax', state.visibleDuration.toFixed(1));
                return;
            }
        }

        const duration = editorVideo.duration || 0.0;
        const visibleDur = localGetVisibleDuration();
        if (visibleDur <= 0) return;
        const mapping = localSourceToVisibleTime(editorVideo.currentTime);
        const percent = mapping.visibleTime / visibleDur;
        const trackWidth = timelineTrack.clientWidth || 600;
        const playheadLeft = percent * trackWidth;

        playhead.style.transform = `translate3d(${playheadLeft}px, 0, 0)`;

        timelineTrack.setAttribute('aria-valuenow', mapping.visibleTime.toFixed(1));
        timelineTrack.setAttribute('aria-valuetext', formatTimeReadable(mapping.visibleTime));
        timelineTrack.setAttribute('aria-valuemax', visibleDur.toFixed(1));
    };

    const seekTimeline = (e) => {
        if (isCutMode) return;
        const rect = timelineTrack.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const duration = editorVideo.duration || 0.0;
        const visibleDur = localGetVisibleDuration();
        const targetVisible = percent * visibleDur;

        if (playbackCoordinator) {
            playbackCoordinator.seekVisibleTime(targetVisible);
        } else {
            const targetSource = localVisibleToSourceTime(targetVisible);
            editorVideo.currentTime = targetSource;
            updatePlayheadPosition();
        }
    };

    let decodedAudioPeaks = null;
    const loadAndDecodeAudio = async (source) => {
        try {
            let arrayBuffer;
            if (source instanceof Blob) {
                arrayBuffer = await source.arrayBuffer();
            } else if (typeof source === 'string' && source.startsWith('http')) {
                const res = await fetch(source);
                if (!res.ok) throw new Error("Fetch failed");
                arrayBuffer = await res.arrayBuffer();
            } else {
                return;
            }

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtx.decodeAudioData(arrayBuffer, (audioBuffer) => {
                const channelData = audioBuffer.getChannelData(0);
                const numPeaks = 400;
                const step = Math.floor(channelData.length / numPeaks);
                const peaks = [];

                for (let i = 0; i < numPeaks; i++) {
                    let max = 0.05;
                    const start = i * step;
                    const end = Math.min(start + step, channelData.length);
                    for (let j = start; j < end; j++) {
                        const val = Math.abs(channelData[j]);
                        if (val > max) max = val;
                    }
                    peaks.push(max);
                }

                const maxPeak = Math.max(...peaks);
                decodedAudioPeaks = maxPeak > 0.05 ? peaks.map(p => p / maxPeak) : peaks.map(() => 0.05);
                drawWaveform();
            }, (err) => {
                console.warn("Audio decoding failed or silent:", err);
                decodedAudioPeaks = null;
                drawWaveform();
            });
        } catch (e) {
            console.warn("Failed to load and decode audio:", e);
            decodedAudioPeaks = null;
            drawWaveform();
        }
    };

    // Audio Waveform Peaks Generator
    const drawWaveform = () => {
        if (!audioWaveformCanvas) return;
        const ctx = audioWaveformCanvas.getContext('2d');
        if (!ctx) return;
        const w = audioWaveformCanvas.width = timelineTrack.clientWidth || 600;
        const h = audioWaveformCanvas.height = timelineTrack.clientHeight || 32;
        ctx.clearRect(0, 0, w, h);

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#14b8a6'); // Teal
        grad.addColorStop(1, '#10b981'); // Emerald
        ctx.fillStyle = grad;

        const barWidth = 2;
        const barGap = 2;
        const totalWidth = barWidth + barGap;
        const numBars = Math.floor(w / totalWidth);

        for (let i = 0; i < numBars; i++) {
            const x = i * totalWidth;
            let peak = 0.05;

            if (decodedAudioPeaks && decodedAudioPeaks.length > 0) {
                const peakIdx = Math.floor((i / numBars) * decodedAudioPeaks.length);
                peak = 0.05 + 0.9 * (decodedAudioPeaks[peakIdx] || 0.0);
            } else {
                peak = 0.1 + 0.3 * Math.abs(Math.sin(i * 0.05) * Math.cos(i * 0.12));
            }

            const barHeight = peak * (h - 8);
            const y = (h - barHeight) / 2;

            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 1);
            ctx.fill();
        }
    };

    const snapThreshold = 0.25; // 250ms
    const checkSnapping = (time) => {
        if (isTimelineSeqEditing && timelineEditorController) {
            const stepVisibleTimes = steps.map(s => localSourceToVisibleTime(s.sourceTimestamp).visibleTime);
            const res = timelineEditorController.calculateSnap(time, stepVisibleTimes);
            return res.snappedTime;
        }
        const duration = editorVideo.duration || 0.0;
        // Snap to steps
        for (const step of steps) {
            const stepMapping = localSourceToVisibleTime(step.sourceTimestamp);
            if (Math.abs(time - stepMapping.visibleTime) < snapThreshold) {
                return stepMapping.visibleTime;
            }
        }
        // Snap to whole/half seconds
        const rounded = Math.round(time * 2) / 2;
        if (Math.abs(time - rounded) < 0.1) {
            return rounded;
        }
        return time;
    };

    // Video Seek Throttler
    let lastSeekTime = 0;
    let seekTimeout = null;
    const throttleSeek = (targetSource) => {
        const now = Date.now();
        if (now - lastSeekTime >= 100) {
            editorVideo.currentTime = targetSource;
            lastSeekTime = now;
        } else {
            clearTimeout(seekTimeout);
            seekTimeout = setTimeout(() => {
                editorVideo.currentTime = targetSource;
                lastSeekTime = Date.now();
            }, 100);
        }
    };

    const renderBoundaryPreviews = (startSource, endSource) => {
        try {
            const lCtx = leftPreviewCanvas.getContext('2d');
            leftPreviewCanvas.width = 80;
            leftPreviewCanvas.height = 45;
            lCtx.drawImage(editorVideo, 0, 0, 80, 45);
        } catch (e) {}
    };

    const drawMagnifiedTimeline = (centerTime) => {
        if (!magnifiedWaveformCanvas) return;
        const ctx = magnifiedWaveformCanvas.getContext('2d');
        const w = magnifiedWaveformCanvas.width = magnifiedTrackContainer.clientWidth || 600;
        const h = magnifiedWaveformCanvas.height = magnifiedTrackContainer.clientHeight || 40;
        ctx.clearRect(0, 0, w, h);

        const duration = editorVideo.duration || 0.0;
        const visibleDur = localGetVisibleDuration();

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px monospace';

        const range = 10.0;
        const halfRange = range / 2;
        const start = centerTime - halfRange;

        for (let offset = 0; offset <= 100; offset++) {
            const t = start + (offset * 0.1);
            if (t < 0 || t > visibleDur) continue;

            const x = (offset / 100) * w;
            const isWholeSecond = Math.abs(t - Math.round(t)) < 0.01;

            ctx.beginPath();
            ctx.moveTo(x, h);
            ctx.lineTo(x, isWholeSecond ? h - 12 : h - 6);
            ctx.stroke();

            if (isWholeSecond) {
                ctx.fillText(formatTimeReadable(t), x + 3, 15);
            }
        }
    };

    const renderCutsTimeline = () => {
        const duration = editorVideo.duration || 0.0;
        const visibleDur = localGetVisibleDuration();
        if (visibleDur <= 0) return;

        const trackWidth = timelineTrack.clientWidth || 600;

        const startPct = cutSelection.startVisibleTime / visibleDur;
        const startX = startPct * trackWidth;
        handleStart.style.transform = `translate3d(${startX}px, 0, 0)`;
        handleStart.setAttribute('aria-valuenow', cutSelection.startVisibleTime.toFixed(1));
        handleStart.setAttribute('aria-valuetext', formatTimeReadable(cutSelection.startVisibleTime));
        handleStart.setAttribute('aria-valuemax', cutSelection.endVisibleTime.toFixed(1));

        const endPct = cutSelection.endVisibleTime / visibleDur;
        const endX = endPct * trackWidth;
        handleEnd.style.transform = `translate3d(${endX}px, 0, 0)`;
        handleEnd.setAttribute('aria-valuenow', cutSelection.endVisibleTime.toFixed(1));
        handleEnd.setAttribute('aria-valuetext', formatTimeReadable(cutSelection.endVisibleTime));
        handleEnd.setAttribute('aria-valuemin', cutSelection.startVisibleTime.toFixed(1));

        cutRangeOverlay.style.transform = `translate3d(${startX}px, 0, 0)`;
        cutRangeOverlay.style.width = `${endX - startX}px`;

        visualCutStartInput.value = formatTimeReadable(cutSelection.startVisibleTime);
        visualCutEndInput.value = formatTimeReadable(cutSelection.endVisibleTime);

        const cutVisibleLen = cutSelection.endVisibleTime - cutSelection.startVisibleTime;

        const startSource = localVisibleToSourceTime(cutSelection.startVisibleTime);
        const endSource = localVisibleToSourceTime(cutSelection.endVisibleTime);

        const cuts = videoEdits.cuts || [];
        const crossedCuts = cuts.filter(c =>
            (c.start >= startSource && c.start <= endSource) ||
            (c.end >= startSource && c.end <= endSource) ||
            (startSource >= c.start && endSource <= c.end)
        );

        let totalRemovedSourceLen = cutVisibleLen;

        if (crossedCuts.length > 0) {
            const minSourceStart = Math.min(startSource, ...crossedCuts.map(c => c.start));
            const maxSourceEnd = Math.max(endSource, ...crossedCuts.map(c => c.end));
            totalRemovedSourceLen = maxSourceEnd - minSourceStart;

            visualCutMsg.innerText = `⚠️ Selection crosses existing edits. Cuts will be combined.`;
            visualCutMsg.style.display = 'inline';
            visualCutDuration.innerText = `Remove: ${totalRemovedSourceLen.toFixed(1)}s (net)`;

            document.querySelectorAll('.join-tick').forEach(tick => {
                const tickTime = parseFloat(tick.dataset.time);
                if (tickTime >= startSource && tickTime <= endSource) {
                    tick.style.borderLeft = '2.5px dashed #f59e0b';
                } else {
                    tick.style.borderLeft = '2.5px dashed rgba(255,255,255,0.45)';
                }
            });
        } else {
            visualCutMsg.style.display = 'none';
            visualCutDuration.innerText = `Remove: ${cutVisibleLen.toFixed(1)} seconds`;

            document.querySelectorAll('.join-tick').forEach(tick => {
                tick.style.borderLeft = '2.5px dashed rgba(255,255,255,0.45)';
            });
        }

        const affectedSteps = steps.filter(s => s.sourceTimestamp >= startSource && s.sourceTimestamp < endSource);
        visualCutStepsCount.innerText = affectedSteps.length > 0 ? `${affectedSteps.length} steps affected` : '';

        // Highlight step markers inside range
        document.querySelectorAll('.timeline-step-dot').forEach(dot => {
            const stepId = dot.dataset.id;
            const isAffected = affectedSteps.some(s => s.id === stepId);
            dot.style.background = isAffected ? '#ef4444' : '#10b981';
        });

        if (cutVisibleLen < 0.5) {
            visualCutError.innerText = 'Selection must be at least 0.5 seconds.';
            visualCutError.style.display = 'inline';
            visualCutConfirmBtn.disabled = true;
            visualCutConfirmBtn.style.opacity = '0.5';
        } else if (visibleDur - cutVisibleLen < 1.0) {
            visualCutError.innerText = 'Remaining video would be too short.';
            visualCutError.style.display = 'inline';
            visualCutConfirmBtn.disabled = true;
            visualCutConfirmBtn.style.opacity = '0.5';
        } else {
            visualCutError.style.display = 'none';
            visualCutConfirmBtn.disabled = false;
            visualCutConfirmBtn.style.opacity = '1';
        }

        renderBoundaryPreviews(startSource, endSource);
    };

    const showJoinTooltip = (tickElement, cut) => {
        const existing = document.getElementById('sys-join-tooltip');
        if (existing) existing.remove();

        const tooltip = document.createElement('div');
        tooltip.id = 'sys-join-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.background = 'rgba(10,10,12,0.95)';
        tooltip.style.border = '1px solid var(--glass-border)';
        tooltip.style.borderRadius = '6px';
        tooltip.style.padding = '0.4rem';
        tooltip.style.display = 'flex';
        tooltip.style.gap = '0.4rem';
        tooltip.style.zIndex = '1000';

        const playBtn = document.createElement('button');
        playBtn.innerText = '▶ Play Join';
        playBtn.className = 'btn-ghost';
        playBtn.style.padding = '2px 6px';
        playBtn.style.fontSize = '0.7rem';
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playCutPreview(cut.start, cut.end);
            tooltip.remove();
        });

        const restoreBtn = document.createElement('button');
        restoreBtn.innerText = '↩ Restore';
        restoreBtn.className = 'btn-ghost';
        restoreBtn.style.padding = '2px 6px';
        restoreBtn.style.fontSize = '0.7rem';
        restoreBtn.style.color = '#ef4444';
        restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isTimelineSeqEditing && timelineEditorController) {
                try {
                    timelineEditorController.restoreRemovedRange(cut.start, cut.end);
                } catch (err) {
                    fswAlert(err.message || "Failed to restore cut.");
                }
                tooltip.remove();
                return;
            }
            videoEdits.cuts = videoEdits.cuts.filter(c => c.id !== cut.id);
            videoEdits = normalizeEdits(videoEdits, editorVideo.duration || 0.0);
            hasUnsavedChanges = true;
            if (renderStatus === 'ready') renderStatus = 'stale';
            updateSaveStatusIndicator();
            renderActiveEdits();
            renderTimelineSteps();
            renderTimelineMarkers();
            drawWaveform();
            tooltip.remove();
        });

        tooltip.appendChild(playBtn);
        tooltip.appendChild(restoreBtn);

        const rect = tickElement.getBoundingClientRect();
        const trackRect = timelineTrack.getBoundingClientRect();
        tooltip.style.left = `${rect.left - trackRect.left}px`;
        tooltip.style.top = '-32px';

        timelineTrack.appendChild(tooltip);

        const closeTooltip = () => {
            tooltip.remove();
            document.removeEventListener('click', closeTooltip);
        };
        setTimeout(() => document.addEventListener('click', closeTooltip), 50);
    };

    const renderTimelineMarkers = () => {
        timelineMarkers.innerHTML = '';
        const duration = editorVideo.duration || 0.0;
        const visibleDur = localGetVisibleDuration();
        if (visibleDur <= 0) return;

        steps.forEach((step, idx) => {
            const mapping = localStepToVisibleTime(step.sourceTimestamp);

            const pct = (mapping.visibleTime / visibleDur) * 100;

            const dot = document.createElement('div');
            dot.className = 'timeline-step-dot';
            dot.dataset.id = step.id;
            dot.style.position = 'absolute';
            dot.style.left = `${pct}%`;
            dot.style.top = '50%';
            dot.style.width = '10px';
            dot.style.height = '10px';
            dot.style.borderRadius = '50%';
            dot.style.background = '#10b981';
            dot.style.border = '1.5px solid white';
            dot.style.transform = 'translate(-50%, -50%)';
            dot.style.cursor = 'pointer';
            dot.title = `Step ${idx + 1}: ${step.instruction}`;

            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                if (playbackCoordinator) {
                    playbackCoordinator.seekVisibleTime(mapping.visibleTime);
                } else {
                    editorVideo.currentTime = localVisibleToSourceTime(mapping.visibleTime);
                }
                updatePlayheadPosition();
            });

            timelineMarkers.appendChild(dot);
        });

        const cuts = videoEdits.cuts || [];
        cuts.forEach(cut => {
            const mapping = localSourceToVisibleTime(cut.start);
            const pct = (mapping.visibleTime / visibleDur) * 100;

            const tick = document.createElement('div');
            tick.className = 'join-tick';
            tick.dataset.time = cut.start;
            tick.style.position = 'absolute';
            tick.style.left = `${pct}%`;
            tick.style.top = '0';
            tick.style.bottom = '0';
            tick.style.width = '3px';
            tick.style.borderLeft = '2.5px dashed rgba(255,255,255,0.45)';
            tick.style.transform = 'translateX(-50%)';
            tick.style.cursor = 'pointer';
            tick.title = `Collapsed Cut Join Point. Click to preview or restore.`;

            tick.addEventListener('click', (e) => {
                e.stopPropagation();
                showJoinTooltip(tick, cut);
            });

            timelineMarkers.appendChild(tick);
        });
    };

    // Pointer event listeners on timelineTrack
    timelineTrack.addEventListener('pointerdown', (e) => {
        const rect = timelineTrack.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = clickX / rect.width;

        const duration = editorVideo.duration || 0.0;
        const visibleDur = localGetVisibleDuration();
        const clickedTime = percent * visibleDur;

        if (isCutMode) {
            const startX = (cutSelection.startVisibleTime / visibleDur) * rect.width;
            const endX = (cutSelection.endVisibleTime / visibleDur) * rect.width;

            if (Math.abs(clickX - startX) < 18) {
                activeDragType = 'start';
                handleStart.setPointerCapture(e.pointerId);
                magnifiedTrackContainer.style.display = 'block';
                drawMagnifiedTimeline(cutSelection.startVisibleTime);
            }
            else if (Math.abs(clickX - endX) < 18) {
                activeDragType = 'end';
                handleEnd.setPointerCapture(e.pointerId);
                magnifiedTrackContainer.style.display = 'block';
                drawMagnifiedTimeline(cutSelection.endVisibleTime);
            }
            else if (clickX >= startX && clickX <= endX) {
                activeDragType = 'range';
                timelineTrack.setPointerCapture(e.pointerId);
                dragStartCoords = {
                    x: e.clientX,
                    startVisible: cutSelection.startVisibleTime,
                    endVisible: cutSelection.endVisibleTime
                };
            }
            else {
                activeDragType = 'playhead';
                playhead.setPointerCapture(e.pointerId);
                const targetSource = localVisibleToSourceTime(clickedTime);
                editorVideo.currentTime = targetSource;
                updatePlayheadPosition();
            }
        } else {
            activeDragType = 'playhead';
            playhead.setPointerCapture(e.pointerId);
            seekTimeline(e);
        }
    });

    timelineTrack.addEventListener('pointermove', (e) => {
        if (!activeDragType) return;

        const rect = timelineTrack.getBoundingClientRect();
        const duration = editorVideo.duration || 0.0;
        const visibleDur = localGetVisibleDuration();

        if (activeDragType === 'start' || activeDragType === 'end') {
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            let targetTime = percent * visibleDur;

            targetTime = checkSnapping(targetTime);

            if (activeDragType === 'start') {
                cutSelection.startVisibleTime = Math.min(targetTime, cutSelection.endVisibleTime - 0.5);
                drawMagnifiedTimeline(cutSelection.startVisibleTime);
            } else {
                cutSelection.endVisibleTime = Math.max(targetTime, cutSelection.startVisibleTime + 0.5);
                drawMagnifiedTimeline(cutSelection.endVisibleTime);
            }

            const targetSource = localVisibleToSourceTime(targetTime);
            throttleSeek(targetSource);
            requestAnimationFrame(renderCutsTimeline);
        }
        else if (activeDragType === 'range') {
            const deltaX = e.clientX - dragStartCoords.x;
            const deltaPercent = deltaX / rect.width;
            const deltaTime = deltaPercent * visibleDur;

            let newStart = dragStartCoords.startVisible + deltaTime;
            let newEnd = dragStartCoords.endVisible + deltaTime;
            const rangeLen = cutSelection.endVisibleTime - cutSelection.startVisibleTime;

            if (newStart < 0) {
                newStart = 0;
                newEnd = rangeLen;
            } else if (newEnd > visibleDur) {
                newEnd = visibleDur;
                newStart = visibleDur - rangeLen;
            }

            cutSelection.startVisibleTime = newStart;
            cutSelection.endVisibleTime = newEnd;
            requestAnimationFrame(renderCutsTimeline);
        }
        else if (activeDragType === 'playhead') {
            seekTimeline(e);
        }
    });

    const finishPointerDrag = (e) => {
        if (!activeDragType) return;
        const duration = editorVideo.duration || 0.0;

        if (activeDragType === 'start') {
            const startSource = localVisibleToSourceTime(cutSelection.startVisibleTime);
            editorVideo.currentTime = startSource;
        } else if (activeDragType === 'end') {
            const endSource = localVisibleToSourceTime(cutSelection.endVisibleTime);
            editorVideo.currentTime = endSource;
        }

        activeDragType = null;
        magnifiedTrackContainer.style.display = 'none';
        updatePlayheadPosition();
    };

    timelineTrack.addEventListener('pointerup', finishPointerDrag);
    timelineTrack.addEventListener('pointercancel', finishPointerDrag);

    // Keyboard navigation on handles
    const handleKeyNav = (e, handleType) => {
        const duration = editorVideo.duration || 0.0;
        const visibleDur = localGetVisibleDuration();
        let stepSize = 0.1;
        if (e.shiftKey) stepSize = 1.0;

        let currentTime = handleType === 'start' ? cutSelection.startVisibleTime : cutSelection.endVisibleTime;

        if (e.key === 'ArrowLeft' || e.key === 'Left') {
            currentTime = Math.max(0, currentTime - stepSize);
        } else if (e.key === 'ArrowRight' || e.key === 'Right') {
            currentTime = Math.min(visibleDur, currentTime + stepSize);
        } else if (e.key === 'Home') {
            currentTime = 0;
        } else if (e.key === 'End') {
            currentTime = visibleDur;
        } else {
            return;
        }

        e.preventDefault();
        if (handleType === 'start') {
            cutSelection.startVisibleTime = Math.min(currentTime, cutSelection.endVisibleTime - 0.5);
        } else {
            cutSelection.endVisibleTime = Math.max(currentTime, cutSelection.startVisibleTime + 0.5);
        }

        const sourceTime = localVisibleToSourceTime(currentTime);
        editorVideo.currentTime = sourceTime;
        renderCutsTimeline();
    };

    handleStart.addEventListener('keydown', (e) => handleKeyNav(e, 'start'));
    handleEnd.addEventListener('keydown', (e) => handleKeyNav(e, 'end'));

    // ResizeObserver to maintain layout
    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
            updatePlayheadPosition();
            if (isCutMode) renderCutsTimeline();
            drawWaveform();
        });
        ro.observe(timelineTrack);
    }

    // Trigger Remove section mode
    cutSectionBtn.addEventListener('click', () => {
        isCutMode = true;
        previousPlaybackState = !editorVideo.paused;
        previousPlayheadPosition = editorVideo.currentTime;
        editorVideo.pause();
        playPauseBtn.innerHTML = '<span id="sys-play-icon">▶</span> Play';

        const duration = editorVideo.duration || 0.0;
        const mapping = localSourceToVisibleTime(editorVideo.currentTime);

        cutSelection.startVisibleTime = mapping.visibleTime;
        cutSelection.endVisibleTime = Math.min(mapping.visibleTime + 5.0, localGetVisibleDuration());

        cutRangeOverlay.style.display = 'block';
        handleStart.style.display = 'block';
        handleEnd.style.display = 'block';
        visualCutActionBar.style.display = 'flex';
        joinPreviewsContainer.style.display = 'flex';

        renderCutsTimeline();
        handleStart.focus();
    });

    visualCutCancelBtn.addEventListener('click', () => {
        isCutMode = false;
        cutRangeOverlay.style.display = 'none';
        handleStart.style.display = 'none';
        handleEnd.style.display = 'none';
        visualCutActionBar.style.display = 'none';
        joinPreviewsContainer.style.display = 'none';

        if (playbackCoordinator) {
            playbackCoordinator.seekSourceTime(previousPlayheadPosition);
            if (previousPlaybackState) {
                playbackCoordinator.play();
            } else {
                playbackCoordinator.pause();
            }
        } else {
            editorVideo.currentTime = previousPlayheadPosition;
            if (previousPlaybackState) {
                editorVideo.play().catch(() => {});
                playPauseBtn.innerHTML = '<span id="sys-play-icon">⏸</span> Pause';
            }
            updatePlayheadPosition();
        }
    });

    visualCutPreviewBtn.addEventListener('click', () => {
        const duration = editorVideo.duration || 0.0;
        const startSource = localVisibleToSourceTime(cutSelection.startVisibleTime);
        const endSource = localVisibleToSourceTime(cutSelection.endVisibleTime);

        playCutPreview(startSource, endSource);
        visualCutPreviewBtn.focus();
    });

    visualCutConfirmBtn.addEventListener('click', () => {
        const duration = editorVideo.duration || 0.0;
        const startSource = localVisibleToSourceTime(cutSelection.startVisibleTime);
        const endSource = localVisibleToSourceTime(cutSelection.endVisibleTime);

        const applyCut = () => {
            isCutMode = false;
            cutRangeOverlay.style.display = 'none';
            handleStart.style.display = 'none';
            handleEnd.style.display = 'none';
            visualCutActionBar.style.display = 'none';
            joinPreviewsContainer.style.display = 'none';

            if (isTimelineSeqEditing && timelineEditorController) {
                try {
                    timelineEditorController.removeVisibleRange(cutSelection.startVisibleTime, cutSelection.endVisibleTime);
                } catch (err) {
                    fswAlert(err.message || "Failed to remove range.");
                }
                if (playbackCoordinator) {
                    playbackCoordinator.seekSourceTime(startSource);
                    playbackCoordinator.pause();
                } else {
                    editorVideo.currentTime = startSource;
                    editorVideo.pause();
                    playPauseBtn.innerHTML = '<span id="sys-play-icon">▶</span> Play';
                    updatePlayheadPosition();
                }
                return;
            }

            // Push cut
            videoEdits.cuts.push({
                id: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
                start: startSource,
                end: endSource
            });
            videoEdits = normalizeEdits(videoEdits, duration);
            hasUnsavedChanges = true;
            if (renderStatus === 'ready') renderStatus = 'stale';
            updateSaveStatusIndicator();
            renderActiveEdits();
            renderTimelineSteps();
            renderTimelineMarkers();
            drawWaveform();

            // Pause at the beginning of the newly created jump-cut
            if (playbackCoordinator) {
                playbackCoordinator.refreshSequence();
                playbackCoordinator.seekSourceTime(startSource);
                playbackCoordinator.pause();
            } else {
                editorVideo.currentTime = startSource;
                editorVideo.pause();
                playPauseBtn.innerHTML = '<span id="sys-play-icon">▶</span> Play';
                updatePlayheadPosition();
            }
        };

        const affectedSteps = steps.filter(s => s.sourceTimestamp >= startSource && s.sourceTimestamp < endSource);
        if (affectedSteps.length > 0) {
            showStepsWarningModal(affectedSteps, "cut", { start: startSource, end: endSource }, applyCut);
        } else {
            applyCut();
        }
    });

    // Synchronize direct visual cut text inputs
    const onManualTimeInput = () => {
        const startVal = parseTimeReadable(visualCutStartInput.value);
        const endVal = parseTimeReadable(visualCutEndInput.value);
        const duration = editorVideo.duration || 0.0;
        const visibleDur = localGetVisibleDuration();

        if (!isNaN(startVal) && !isNaN(endVal) && startVal < endVal && endVal <= visibleDur) {
            cutSelection.startVisibleTime = startVal;
            cutSelection.endVisibleTime = endVal;
            renderCutsTimeline();
        }
    };
    visualCutStartInput.addEventListener('input', onManualTimeInput);
    visualCutEndInput.addEventListener('input', onManualTimeInput);


    // Populate Datalist
    fetchSystemTags().then(tags => {
        tagsList.innerHTML = tags.map(t => `<option value="${t}"></option>`).join('');
    });

    // Screen Recorder state
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedStream = null;
    let recordingTimerInterval = null;
    let recordingSeconds = 0;
    let audioContextInstance = null;

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            const isFS = builderRoot.classList.toggle('sys-builder-fullscreen');
            fullscreenBtn.innerHTML = isFS ? '🗖 Exit Fullscreen' : '🗖 Fullscreen';

            setTimeout(() => {
                if (lastActiveStepId) {
                    focusStep(lastActiveStepId, false);
                }
            }, 100);
        });
    }



    // Video File Upload Logic
    if (uploadVideoInput) {
        uploadVideoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Accept MP4 files
            if (file.type !== 'video/mp4' && !file.name.endsWith('.mp4')) {
                fswAlert("Please upload a valid MP4 screen recording file.");
                uploadVideoInput.value = '';
                return;
            }

            try {
                recordedVideoBlob = file;
                const localUrl = URL.createObjectURL(file);
                editorVideo.src = localUrl;

                // Hide setup UI and trigger deconstruction directly
                recSetupUi.style.display = 'none';
                await processRecordedWalkthrough(file);
            } catch (err) {
                console.error("Failed to load uploaded walkthrough video:", err);
                fswAlert("Failed to load walkthrough video: " + err.message);
                uploadVideoInput.value = '';
            }
        });
    }

    // 2. Screen Recorder Logic
    startRecBtn.addEventListener('click', async () => {
        try {
            recordedChunks = [];

            // 1. Request microphone permission first (ensures user sees prompt immediately and doesn't talk during prompt latency)
            let micStream = null;
            try {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
            } catch (err) {
                console.error("Microphone access denied:", err);
                await fswAlert("Microphone access is required so the AI can transcribe your voice walkthrough. Please allow microphone permissions and try again.");
                return;
            }

            // 2. Request screen sharing display stream
            let screenStream = null;
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { width: 1280, height: 720 },
                    audio: true // Allow system audio capture
                });
            } catch (err) {
                // If they cancel screen sharing, make sure to stop the microphone stream
                if (micStream) micStream.getTracks().forEach(t => t.stop());
                throw err;
            }

            // 3. Set up Web Audio Context to mix microphone and system audio
            audioContextInstance = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContextInstance.state === 'suspended') {
                await audioContextInstance.resume();
            }
            const dest = audioContextInstance.createMediaStreamDestination();
            const analyser = audioContextInstance.createAnalyser();
            analyser.fftSize = 256;

            let hasAudioTracks = false;

            if (micStream && micStream.getAudioTracks().length > 0) {
                const micSource = audioContextInstance.createMediaStreamSource(micStream);
                micSource.connect(dest);
                micSource.connect(analyser);
                hasAudioTracks = true;
            }

            if (screenStream && screenStream.getAudioTracks().length > 0) {
                const screenSource = audioContextInstance.createMediaStreamSource(screenStream);
                screenSource.connect(dest);
                screenSource.connect(analyser);
                hasAudioTracks = true;
            }

            // Combine screen video track with our mixed audio track
            const tracks = [...screenStream.getVideoTracks()];
            if (hasAudioTracks) {
                tracks.push(...dest.stream.getAudioTracks());
            }

            recordedStream = new MediaStream(tracks);

            // Stop trigger from native browser sharing bar
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                stopRecording();
            });

            // Fallback checking
            let options = { mimeType: 'video/webm;codecs=vp9,opus' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm;codecs=vp8,opus';
            }
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm';
            }

            mediaRecorder = new MediaRecorder(recordedStream, options);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunks.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                recordedVideoBlob = new Blob(recordedChunks, { type: 'video/webm' });
                const localUrl = URL.createObjectURL(recordedVideoBlob);
                editorVideo.src = localUrl;
                await processRecordedWalkthrough(recordedVideoBlob);
            };

            mediaRecorder.start();

            // Start UI Timer and Mic visualizer
            recordingSeconds = 0;
            recTimer.innerText = "00:00";

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const volumeBar = document.getElementById('rec-volume-bar');

            let tick = 0;
            recordingTimerInterval = setInterval(() => {
                tick++;
                if (tick >= 10) {
                    tick = 0;
                    recordingSeconds++;
                    const min = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
                    const sec = String(recordingSeconds % 60).padStart(2, '0');
                    recTimer.innerText = `${min}:${sec}`;
                }

                // Update volume visualizer every 100ms
                if (volumeBar && analyser) {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) {
                        sum += dataArray[i];
                    }
                    const average = sum / bufferLength;
                    const pct = Math.min(100, Math.round((average / 80) * 100));
                    volumeBar.style.width = `${pct}%`;
                }
            }, 100);

            recSetupUi.style.display = 'none';
            recLiveUi.style.display = 'flex';

        } catch (err) {
            console.error("Failed to start walkthrough capture:", err);
            fswAlert("Recording could not be started: " + err.message);
        }
    });

    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        if (recordedStream) {
            recordedStream.getTracks().forEach(t => t.stop());
        }
        if (recordingTimerInterval) {
            clearInterval(recordingTimerInterval);
        }
        if (audioContextInstance && audioContextInstance.state !== 'closed') {
            audioContextInstance.close().catch(() => {});
        }
    };

    const detectClickTimestamp = async (videoEl, startTime, endTime) => {
        const step = 0.15; // sample every 150ms
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 30;
        const ctx = canvas.getContext('2d');

        let prevPixels = null;
        let transitionTime = -1;

        // Scan through the segment duration
        for (let t = startTime; t <= endTime; t += step) {
            videoEl.currentTime = Math.min(t, videoEl.duration);
            await new Promise(r => videoEl.onseeked = () => r());

            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imgData.data;

            if (prevPixels) {
                let diff = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    diff += Math.abs(pixels[i] - prevPixels[i]);     // R
                    diff += Math.abs(pixels[i+1] - prevPixels[i+1]); // G
                    diff += Math.abs(pixels[i+2] - prevPixels[i+2]); // B
                }
                const score = diff / (canvas.width * canvas.height * 3 * 255);

                // If change is greater than 1.5% (typical button hover style change or transition)
                if (score > 0.015) {
                    transitionTime = t;
                    break;
                }
            }
            prevPixels = pixels;
        }

        if (transitionTime !== -1) {
            // The click happened right before the visual change. Capture 300ms before transition.
            return Math.max(startTime, transitionTime - 0.3);
        }

        // Fallback to end of segment
        return Math.max(startTime, endTime - 0.2);
    };

    stopRecBtn.addEventListener('click', stopRecording);

    // 3. AI Deconstruction logic
    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    const floatTo8BitPCM = (output, offset, input) => {
        for (let i = 0; i < input.length; i++) {
            const sample = Math.max(-1, Math.min(1, input[i]));
            output.setUint8(offset + i, Math.round((sample + 1) * 127.5));
        }
    };

    const bufferToWav = (buffer) => {
        const numOfChan = 1; // force mono to save space
        const targetWavBytes = 3400000;
        const maximumSpeechSampleRate = 12000;
        const minimumSpeechSampleRate = 8000;
        const sampleRateForTargetSize = Math.floor((targetWavBytes - 44) / Math.max(buffer.duration, 1));
        const sampleRate = Math.max(
            minimumSpeechSampleRate,
            Math.min(maximumSpeechSampleRate, sampleRateForTargetSize)
        );
        const scale = sampleRate / buffer.sampleRate;
        const length = Math.floor(buffer.length * scale);
        const result = new Float32Array(length);

        // Average all channels to mono so we don't lose mic audio from other channels
        const inputNumOfChan = Math.max(1, buffer.numberOfChannels);
        const channelData = [];
        for (let c = 0; c < inputNumOfChan; c++) {
            channelData.push(buffer.getChannelData(c));
        }

        // Downsample and mix down to mono
        for (let i = 0; i < length; i++) {
            const index = Math.min(buffer.length - 1, Math.floor(i / scale));
            let sum = 0;
            for (let c = 0; c < inputNumOfChan; c++) {
                sum += channelData[c][index];
            }
            result[i] = sum / inputNumOfChan;
        }

        const bufferLength = result.length;
        const ab = new ArrayBuffer(44 + bufferLength);
        const view = new DataView(ab);

        /* RIFF identifier */
        writeString(view, 0, 'RIFF');
        /* file length */
        view.setUint32(4, 36 + bufferLength, true);
        /* RIFF type */
        writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        writeString(view, 12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw) */
        view.setUint16(20, 1, true);
        /* channel count */
        view.setUint16(22, numOfChan, true);
        /* sample rate */
        view.setUint32(24, sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, sampleRate, true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, numOfChan, true);
        /* bits per sample */
        view.setUint16(34, 8, true);
        /* data chunk identifier */
        writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, bufferLength, true);

        // Write PCM samples
        floatTo8BitPCM(view, 44, result);

        return new Blob([ab], { type: 'audio/wav' });
    };

    const buildSpeechSegments = (providerResult) => {
        const suppliedSegments = Array.isArray(providerResult?.segments)
            ? providerResult.segments
                .map((segment, index) => ({
                    id: segment.id ?? index,
                    start: Number(segment.start),
                    end: Number(segment.end),
                    text: String(segment.text || '').trim()
                }))
                .filter(segment =>
                    segment.text
                    && Number.isFinite(segment.start)
                    && Number.isFinite(segment.end)
                    && segment.end > segment.start
                )
            : [];

        if (suppliedSegments.length > 0) {
            return suppliedSegments;
        }

        const timedWords = Array.isArray(providerResult?.words)
            ? providerResult.words
                .map(word => ({
                    text: String(word.word || word.text || '').trim(),
                    start: Number(word.start ?? word.startSourceTime),
                    end: Number(word.end ?? word.endSourceTime)
                }))
                .filter(word =>
                    word.text
                    && Number.isFinite(word.start)
                    && Number.isFinite(word.end)
                    && word.end > word.start
                )
                .sort((a, b) => a.start - b.start)
            : [];

        const groupedSegments = [];
        let current = null;

        const flushCurrent = () => {
            if (!current || current.words.length === 0) return;
            groupedSegments.push({
                id: groupedSegments.length,
                start: current.start,
                end: current.end,
                text: current.words.join(' ')
            });
            current = null;
        };

        timedWords.forEach(word => {
            if (!current) {
                current = {
                    start: word.start,
                    end: word.end,
                    words: [word.text]
                };
                return;
            }

            const gap = word.start - current.end;
            const duration = word.end - current.start;
            const previousText = current.words[current.words.length - 1] || '';
            const sentenceEnded = /[.!?]$/.test(previousText);
            const shouldStartNewSegment =
                gap > 1.2
                || duration > 12
                || current.words.length >= 32
                || (sentenceEnded && duration > 4);

            if (shouldStartNewSegment) {
                flushCurrent();
                current = {
                    start: word.start,
                    end: word.end,
                    words: [word.text]
                };
                return;
            }

            current.words.push(word.text);
            current.end = word.end;
        });

        flushCurrent();
        return groupedSegments;
    };

    const waitForVideoMetadata = async (videoElement) => {
        const readDuration = () => {
            const value = Number(videoElement.duration);
            return Number.isFinite(value) && value > 0 ? value : null;
        };

        const availableDuration = readDuration();
        if (availableDuration !== null) {
            return availableDuration;
        }

        return await new Promise((resolve, reject) => {
            let timeoutId = null;

            const cleanup = () => {
                videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                videoElement.removeEventListener('error', onError);
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                }
            };

            const onLoadedMetadata = () => {
                const duration = readDuration();
                if (duration === null) return;
                cleanup();
                resolve(duration);
            };

            const onError = () => {
                cleanup();
                reject(new Error('The recording metadata could not be read.'));
            };

            videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
            videoElement.addEventListener('error', onError);
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error('The recording duration could not be determined.'));
            }, 15000);
        });
    };

    const processRecordedWalkthrough = async (videoBlob) => {
        recLiveUi.style.display = 'none';
        recProgressUi.style.display = 'flex';

        try {
            // Upload the source file successfully and persist in db
            recProgressMsg.innerText = "Uploading walkthrough video...";
            recProgressBar.style.width = "5%";

            const extension = (videoBlob instanceof File && (videoBlob.name.endsWith('.mp4') || videoBlob.type === 'video/mp4')) ? 'mp4' : 'webm';
            const fileName = `walkthrough_${Date.now()}.${extension}`;

            // 1. Upload to storage
            const { error: uploadError } = await supabase.storage.from('guides').upload(fileName, videoBlob);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('guides').getPublicUrl(fileName);
            const finalVideoUrl = publicUrl;
            videoUrl = finalVideoUrl;

            // 2. Read media metadata before creating the source asset.
            // Creating an asset at zero seconds produces an empty timeline after reload.
            const duration = await waitForVideoMetadata(editorVideo);
            const fileSize = videoBlob.size || 0;

            // 3. Create draft guide row if it doesn't exist
            if (!existingGuide) {
                const { data: userAuth } = await supabase.auth.getUser();
                let accountId = null;
                if (userAuth?.user) {
                    try {
                        const { data: profile } = await supabase.from('profiles').select('account_id').eq('id', userAuth.user.id).single();
                        accountId = profile?.account_id;
                    } catch (e) {}

                    if (!accountId) {
                        try {
                            const { data: membership } = await supabase
                                .from('account_memberships')
                                .select('account_id')
                                .eq('user_id', userAuth.user.id)
                                .limit(1)
                                .maybeSingle();
                            accountId = membership?.account_id;
                        } catch (e) {}
                    }
                }
                const newCourse = await createCourse({
                    title: titleInput.value.trim() || 'Untitled Walkthrough',
                    description: descInput.value.trim(),
                    status: 'draft',
                    account_id: accountId,
                    content_json: {
                        is_system_simulation: true,
                        type: "video_walkthrough",
                        videoUrl: finalVideoUrl,
                        videoEdits: videoEdits,
                        renderStatus: "notRequired",
                        steps: []
                    }
                });
                existingGuide = newCourse;
                if (transcriptionUIController) {
                    transcriptionUIController.setGuideId(existingGuide.id);
                }
            }

            // 4. Create or idempotently retrieve the video_source_assets record using createSourceAsset
            const assetInput = {
                guideId: existingGuide.id,
                originalStoragePath: finalVideoUrl,
                durationSeconds: duration,
                fileSizeBytes: fileSize
            };

            const asset = await createSourceAsset(assetInput);
            sourceAssetId = asset.id;

            // 5. Store returned UUID and active source duration in transcriptionUIController, then initialize controllers
            if (transcriptionUIController) {
                transcriptionUIController.setSourceAsset(sourceAssetId, duration);
            }

            // Clear recordedVideoBlob so we don't upload again in saveGuide
            recordedVideoBlob = null;

            const transcribeBlob = async (blob, name, mime) => {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token || '';

                const formData = new FormData();
                formData.append('guideId', existingGuide?.id || '');
                formData.append('file', blob, name);

                try {
                    const transRes = await fetch('/api/transcribe', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });

                    if (transRes.ok) {
                        const transData = await transRes.json();
                        return {
                            ...transData,
                            requestId: transRes.headers.get('X-Request-ID') || crypto.randomUUID()
                        };
                    } else {
                        const errData = await transRes.json().catch(() => ({}));
                        const errMsg = errData.error?.message || errData.error || `Status ${transRes.status}`;
                        throw new Error(errMsg);
                    }
                } catch (err) {
                    throw err;
                }
            };

            // Step 1: Extract audio track client-side using Web Audio API to bypass 25MB Whisper limit
            recProgressMsg.innerText = "Extracting audio track locally...";
            recProgressBar.style.width = "20%";

            let clientSideExtractionSucceeded = false;
            let extractedWavBlob = null;

            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const fileReader = new FileReader();

                const arrayBuffer = await new Promise((resolve, reject) => {
                    fileReader.onload = () => resolve(fileReader.result);
                    fileReader.onerror = reject;
                    fileReader.readAsArrayBuffer(videoBlob);
                });

                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                console.log("Decoded AudioBuffer details:", {
                    numberOfChannels: audioBuffer.numberOfChannels,
                    sampleRate: audioBuffer.sampleRate,
                    length: audioBuffer.length,
                    duration: audioBuffer.duration
                });

                // Find peak amplitude to check for silence and normalize volume
                let maxVal = 0;
                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const channelData = audioBuffer.getChannelData(channel);
                    for (let i = 0; i < channelData.length; i++) {
                        const absVal = Math.abs(channelData[i]);
                        if (absVal > maxVal) {
                            maxVal = absVal;
                        }
                    }
                }

                console.log(`Peak audio amplitude detected: ${maxVal.toFixed(4)}`);

                if (maxVal < 0.001) {
                    throw new Error("Decoded audio buffer is silent or too quiet");
                }

                // Normalize audio if peak is below 0.8 to boost quiet speech
                if (maxVal < 0.8) {
                    const gain = 0.8 / maxVal;
                    console.log(`Normalizing audio with gain factor: ${gain.toFixed(2)}x`);
                    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                        const channelData = audioBuffer.getChannelData(channel);
                        for (let i = 0; i < channelData.length; i++) {
                            channelData[i] *= gain;
                        }
                    }
                }

                extractedWavBlob = bufferToWav(audioBuffer);
                audioCtx.close();
                clientSideExtractionSucceeded = true;

                // Expose debug WAV download link in the console
                const debugUrl = URL.createObjectURL(extractedWavBlob);
                console.log("DEBUG: Extracted WAV audio. Download and listen here:", debugUrl);

                console.log(`Audio successfully extracted locally! Size: ${(extractedWavBlob.size / (1024 * 1024)).toFixed(2)} MB`);
            } catch (extractError) {
                console.warn("Client-side audio extraction failed, will transcribe raw video directly:", extractError);
            }

            // Step 2: Speech to Text (Whisper)
            recProgressMsg.innerText = "Transcribing spoken walkthrough (1/2)...";
            recProgressBar.style.width = "40%";

            let segments = [];
            let transcriptionResult = null;
            let transcriptionError = null;

            const MAX_ALLOWED_SIZE = 3670016; // 3.5 MB matching MAX_FILE_BYTES in api/transcribe.js

            if (clientSideExtractionSucceeded && extractedWavBlob) {
                if (extractedWavBlob.size > MAX_ALLOWED_SIZE) {
                    console.warn(`Extracted WAV audio is too large (${(extractedWavBlob.size / (1024 * 1024)).toFixed(2)} MB) for synchronous Vercel transcription. Skipping API call.`);
                    transcriptionError = new Error(`The audio recording is too large (${(extractedWavBlob.size / (1024 * 1024)).toFixed(2)} MB) for instant AI structuring (limit is 3.5 MB).`);
                } else {
                    try {
                        console.log("Attempting transcription using client-side extracted WAV...");
                        transcriptionResult = await transcribeBlob(extractedWavBlob, 'audio.wav', 'audio/wav');
                        segments = buildSpeechSegments(transcriptionResult);
                        console.log(`Transcribed segments from WAV. Count: ${segments.length}`);
                    } catch (transError) {
                        console.warn("Transcription of extracted WAV failed:", transError);
                        transcriptionError = transError;
                    }
                }
            }

            // Only send the raw recording when browser audio extraction itself failed.
            // If the compact WAV reached the API, preserve its real error instead of masking it
            // with the much larger raw recording size.
            if (segments.length === 0 && !clientSideExtractionSucceeded) {
                if (videoBlob.size > MAX_ALLOWED_SIZE) {
                    console.warn(`Raw video file is too large (${(videoBlob.size / (1024 * 1024)).toFixed(2)} MB) for synchronous Vercel transcription. Skipping API call.`);
                    transcriptionError = new Error(`The video file is too large (${(videoBlob.size / (1024 * 1024)).toFixed(2)} MB) for instant AI structuring (limit is 3.5 MB).`);
                } else {
                    try {
                        console.log("Attempting transcription using raw video file...");
                        const rawName = videoBlob instanceof File ? videoBlob.name : 'walkthrough.webm';
                        const rawMime = videoBlob.type || 'video/webm';
                        transcriptionResult = await transcribeBlob(videoBlob, rawName, rawMime);
                        segments = buildSpeechSegments(transcriptionResult);
                        console.log(`Transcribed segments from raw video. Count: ${segments.length}`);
                        transcriptionError = null; // Clear previous errors since raw succeeded
                    } catch (rawTransError) {
                        console.error("Transcription of raw video failed too:", rawTransError);
                        transcriptionError = rawTransError;
                    }
                }
            }


            // Reuse the same word-timed transcription in the transcript review editor.
            // This avoids charging for a second transcription request after recording.
            if (transcriptionResult && Array.isArray(transcriptionResult.words) && transcriptionResult.words.length > 0) {
                const requestId = transcriptionResult.requestId || crypto.randomUUID();
                const rawWords = [...transcriptionResult.words]
                    .sort((a, b) => Number(a.start) - Number(b.start));
                const lastWordEnd = rawWords.reduce((latest, word) => {
                    const end = Number(word.end);
                    return Number.isFinite(end) ? Math.max(latest, end) : latest;
                }, 0);
                const transcriptDuration = Math.max(Number(duration) || 0, lastWordEnd);
                const transcriptWords = [];
                let previousWordEnd = 0;

                rawWords.forEach((rawWord, index) => {
                    const text = String(rawWord.word || rawWord.text || '').trim();
                    let start = Number(rawWord.start);
                    let end = Number(rawWord.end);

                    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) return;
                    start = Math.max(0, start, previousWordEnd);
                    end = Math.min(transcriptDuration, end);
                    if (end <= start) return;

                    transcriptWords.push({
                        id: `${requestId}_w${index}_${Math.round(start * 1000)}_${Math.round(end * 1000)}`,
                        text,
                        startSourceTime: start,
                        endSourceTime: end,
                        confidence: null,
                        speakerId: null
                    });
                    previousWordEnd = end;
                });

                if (transcriptWords.length > 0 && transcriptionUIController?.transcriptionJobController) {
                    const canonicalTranscript = {
                        schemaVersion: 1,
                        sourceAssetId,
                        language: String(transcriptionResult.language || 'en').toLowerCase(),
                        duration: transcriptDuration,
                        words: transcriptWords
                    };

                    try {
                        await transcriptionUIController.transcriptionJobController.startManualImport(
                            requestId,
                            canonicalTranscript
                        );
                        await transcriptionUIController.transcriptionJobController.approve();
                        if (transcriptionUIController.transcriptViewerController) {
                            await transcriptionUIController.transcriptViewerController.initialize();
                        }
                    } catch (transcriptImportError) {
                        console.warn('Transcript review import failed; generated steps remain available:', transcriptImportError);
                    }
                }
            }

            // Step 2: Clean and structure steps with GPT-4o-mini
            recProgressMsg.innerText = "Structuring timeline steps with AI (2/2)...";
            recProgressBar.style.width = "75%";

            steps = [];
            if (segments.length > 0) {
                try {
                    const rawSteps = await cleanAndStructureSteps(segments);
                    steps = (rawSteps || []).map((s, idx) => ({
                        id: s.id || crypto.randomUUID(),
                        createdOrder: idx,
                        sourceTimestamp: parseFloat(s.timestamp) || 0.0,
                        instruction: s.instruction || "",
                        teachingText: s.teachingText || ""
                    }));
                    nextStepOrder = steps.length;
                    transcriptionError = null;
                } catch (gptError) {
                    console.warn("GPT step structuring error:", gptError);
                    transcriptionError = gptError;
                }
            }

            // Fallback if no steps structured
            if (steps.length === 0) {
                steps = [
                    {
                        id: crypto.randomUUID(),
                        createdOrder: 0,
                        sourceTimestamp: 0.0,
                        instruction: "Start Walkthrough",
                        teachingText: "Welcome to this interactive walkthrough guide."
                    }
                ];
                nextStepOrder = 1;
                if (transcriptionError) {
                    await fswAlert(`The recording was saved, but automatic transcription could not be completed: ${transcriptionError.message || transcriptionError} You can edit the guide manually below.`);
                } else {
                    await fswAlert("Speech was silent or too low. Walkthrough video loaded successfully! You can now manually add and customize your steps using the editor timeline.");
                }
            }

            hasUnsavedChanges = true;
            updateSaveStatusIndicator();

            // Activate Editor View
            editorStep.style.display = 'flex';
            setWorkspaceState('editing');
            saveBtn.disabled = false;
            draftBtn.disabled = false;

            renderTimelineSteps();

            // Restore capture UI states
            recSetupUi.style.display = 'block';
            recProgressUi.style.display = 'none';
        } catch (err) {
            console.error("Auto deconstruction error:", err);
            fswAlert("Failed to process recording: " + err.message);
            recSetupUi.style.display = 'block';
            recProgressUi.style.display = 'none';
        }
    };

    const cleanAndStructureSteps = async (segments) => {
        const payload = {
            model: "openai/gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "You are an AI assistant that cleans and structures recorded software tutorial transcripts. Your goal is to convert messy, spoken guidelines into a clean list of chronological steps for a software walkthrough timeline."
                },
                {
                    role: "user",
                    content: `Here is the transcribed audio timeline from a screen recording:
                    ${JSON.stringify(segments, null, 2)}

                    Please perform the following instructions:
                    1. Read through the segments chronologically.
                    2. Clean up the language: remove filler words (e.g. 'um', 'ah', 'like', 'alright', stutters, repetitions).
                    3. Group contiguous segments into logical steps. Each step should represent a single key click or action explained by the user.
                    4. For each step:
                       - Assign a 'timestamp' (float) representing the exact start time in seconds of the action.
                       - Write a short, action-focused 'instruction' (e.g. Click 'New Supplier').
                       - Write a polished 'teachingText' explaining what this action does, expanding on what the user said to make it sound professional and clear.

                    Return a JSON object in this format:
                    {
                      "steps": [
                        {
                          "timestamp": 3.4,
                          "instruction": "Click 'New Vendor'",
                          "teachingText": "Click the 'New Vendor' button at the top right to open the supplier registration form."
                        }
                      ]
                    }`
                }
            ]
        };

        const res = await fetch('/api/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.error?.message || errData.error || `status ${res.status}`;
            throw new Error(`AI step structuring failed: ${errMsg}`);
        }

        const data = await res.json();
        let textResponse = data.choices?.[0]?.message?.content;
        if (textResponse) {
            textResponse = textResponse.trim();
            if (textResponse.startsWith('```')) {
                textResponse = textResponse.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
            }
            const parsed = JSON.parse(textResponse);
            if (Array.isArray(parsed)) return parsed;
            return Array.isArray(parsed?.steps) ? parsed.steps : [];
        }
        return [];
    };


    const parseGeneratedStepTimestamp = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        const text = String(value ?? '').trim();
        if (!text) return Number.NaN;

        if (text.includes(':')) {
            const parts = text.split(':').map(part => Number(part));
            if (parts.every(Number.isFinite)) {
                if (parts.length === 2) {
                    return parts[0] * 60 + parts[1];
                }
                if (parts.length === 3) {
                    return parts[0] * 3600 + parts[1] * 60 + parts[2];
                }
            }
        }

        return Number.parseFloat(text);
    };

    const generateTimelineStepsFromSegments = async (
        segmentsToStructure,
        { preserveExistingSteps = false } = {}
    ) => {
        const existingStepsSnapshot = preserveExistingSteps
            ? steps.map(step => ({ ...step }))
            : [];
        const segmentStarts = segmentsToStructure
            .map(segment => Number(segment.start))
            .filter(Number.isFinite);
        const segmentEnds = segmentsToStructure
            .map(segment => Number(segment.end))
            .filter(Number.isFinite);

        if (existingStepsSnapshot.length > 0) {
            if (segmentStarts.length === 0) {
                throw new Error('The visible transcript does not contain usable timings.');
            }

            const repairTimes = segmentsToStructure
                .map(segment => {
                    const start = Number(segment.start);
                    const end = Number(segment.end);
                    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
                        return Number.NaN;
                    }
                    return start + Math.min(0.05, (end - start) / 2);
                })
                .filter(Number.isFinite);

            steps = existingStepsSnapshot.map((existingStep, index) => {
                const segmentIndex = existingStepsSnapshot.length <= 1
                    ? 0
                    : Math.round(
                        index * (repairTimes.length - 1) / (existingStepsSnapshot.length - 1)
                    );

                return {
                    ...existingStep,
                    sourceTimestamp: repairTimes[
                        Math.max(0, Math.min(repairTimes.length - 1, segmentIndex))
                    ]
                };
            });
            steps.sort((a, b) =>
                a.sourceTimestamp - b.sourceTimestamp || a.createdOrder - b.createdOrder
            );
            hasUnsavedChanges = true;
            updateSaveStatusIndicator();
            renderTimelineSteps();
            await flushStepAutosave();
            return steps.length;
        }

        const rawSteps = await cleanAndStructureSteps(segmentsToStructure);
        const parsedTimestamps = rawSteps.map(step =>
            parseGeneratedStepTimestamp(
                step.timestamp
                ?? step.sourceTimestamp
                ?? step.startTime
                ?? step.start
            )
        );
        const validTimestamps = parsedTimestamps.filter(timestamp =>
            Number.isFinite(timestamp) && timestamp >= 0
        );
        const uniqueTimestamps = new Set(
            validTimestamps.map(timestamp => timestamp.toFixed(3))
        );
        const shouldDistributeTimestamps =
            rawSteps.length > 1
            && segmentStarts.length > 1
            && (
                validTimestamps.length !== rawSteps.length
                || uniqueTimestamps.size <= 1
            );
        const maximumSourceTime = Math.max(
            Number(editorVideo.duration) || 0,
            ...segmentEnds,
            0
        );

        const structuredSteps = rawSteps
            .map((step, index) => {
                const proportionalSegmentIndex = rawSteps.length <= 1
                    ? 0
                    : Math.round(
                        index * (segmentStarts.length - 1) / (rawSteps.length - 1)
                    );
                const fallbackTimestamp = segmentStarts[
                    Math.max(0, Math.min(segmentStarts.length - 1, proportionalSegmentIndex))
                ] ?? 0;
                const parsedTimestamp = parsedTimestamps[index];
                const timestamp = shouldDistributeTimestamps
                    || !Number.isFinite(parsedTimestamp)
                    || parsedTimestamp < 0
                    || parsedTimestamp > maximumSourceTime
                    ? fallbackTimestamp
                    : parsedTimestamp;

                return {
                    id: step.id || crypto.randomUUID(),
                    createdOrder: index,
                    sourceTimestamp: Math.max(0, Math.min(maximumSourceTime, timestamp)),
                    instruction: String(step.instruction || '').trim(),
                    teachingText: String(step.teachingText || '').trim()
                };
            })
            .filter(step => step.instruction || step.teachingText)
            .sort((a, b) => a.sourceTimestamp - b.sourceTimestamp || a.createdOrder - b.createdOrder);

        if (structuredSteps.length === 0) {
            throw new Error('AI did not return any usable timeline steps.');
        }

        steps = structuredSteps;
        nextStepOrder = steps.length;
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        renderTimelineSteps();
        try {
            await flushStepAutosave();
        } catch (error) {
            hasUnsavedChanges = true;
            updateSaveStatusIndicator();
        }
        return steps.length;
    };



    const updateActiveStep = () => {
        const currentTime = editorVideo.currentTime;
        let activeStep = null;
        let maxTime = -1;

        steps.forEach(step => {
            if (step.sourceTimestamp <= currentTime && step.sourceTimestamp > maxTime) {
                maxTime = step.sourceTimestamp;
                activeStep = step;
            }
        });

        const activeId = activeStep ? activeStep.id : null;

        if (activeId !== lastActiveStepId) {
            if (lastActiveStepId) {
                const prevCard = timelineStepsList.querySelector(`[data-step-id="${lastActiveStepId}"]`);
                if (prevCard) {
                    prevCard.classList.remove('active');
                    const prevSeekBtn = prevCard.querySelector('.step-seek-btn');
                    if (prevSeekBtn) prevSeekBtn.removeAttribute('aria-current');
                }
            }
            if (activeId) {
                const newCard = timelineStepsList.querySelector(`[data-step-id="${activeId}"]`);
                if (newCard) {
                    newCard.classList.add('active');
                    const newSeekBtn = newCard.querySelector('.step-seek-btn');
                    if (newSeekBtn) newSeekBtn.setAttribute('aria-current', 'true');
                }
            }
            lastActiveStepId = activeId;
        }
    };

    const focusStep = (id, smooth = false, focusSelector = '.step-time-input') => {
        const card = timelineStepsList.querySelector(`[data-step-id="${id}"]`);
        if (!card) return;

        card.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });

        const input = card.querySelector(focusSelector);
        if (input) {
            input.focus();
            if (typeof input.select === 'function') {
                input.select();
            }
        }
    };

    const renderTimelineSteps = () => {
        const stepCountEl = document.getElementById('sys-step-count');
        if (stepCountEl) {
            stepCountEl.textContent = `(${steps.length})`;
        }

        const generateBtn = document.getElementById('sys-generate-steps-btn');
        if (generateBtn) {
            generateBtn.style.display = steps.length === 0 ? 'inline-block' : 'none';
        }

        const repairBtn = document.getElementById('sys-repair-steps-btn');
        if (repairBtn) {
            // Only show repair button if there are steps with validation issues
            const needsRepair = steps.some(s => s.startTime < 0 || (s.endTime !== null && s.endTime < s.startTime));
            repairBtn.style.display = needsRepair ? 'inline-block' : 'none';
        }

        timelineStepsList.innerHTML = '';
        const duration = editorVideo.duration || 0.0;
        const hasOnlyStarterStep = steps.length === 1
            && Number(steps[0].sourceTimestamp || 0) === 0
            && steps[0].instruction === 'Start Walkthrough';

        if (generateStepsBtn) {
            const repairsExistingSteps = steps.length > 0 && !hasOnlyStarterStep;
            generateStepsBtn.innerText = repairsExistingSteps
                ? 'Repair Step Timings'
                : 'Generate AI Steps';
            generateStepsBtn.title = repairsExistingSteps
                ? 'Repair timestamps from the transcript without changing actions or detailed notes'
                : 'Create timeline steps from the transcript';
        }

        renderTimelineMarkers();
        drawWaveform();

        steps.forEach((step, index) => {
            let srcTime = parseFloat(step.sourceTimestamp);
            if (!Number.isFinite(srcTime)) {
                console.warn("Invalid step sourceTimestamp found during render, defaulting to 0:", step);
                srcTime = 0.0;
                step.sourceTimestamp = 0.0;
            }
            const mapping = localStepToVisibleTime(srcTime);
            const visibleTime = parseFloat(mapping.visibleTime.toFixed(1));

            const card = document.createElement('div');
            card.className = 'timeline-step-card';
            card.setAttribute('data-step-id', step.id);
            if (mapping.isRemoved) {
                card.style.opacity = '0.55';
                card.style.border = '1px dashed #ef4444';
            }

            // Header Row
            const headerRow = document.createElement('div');
            headerRow.style = "display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.4rem;";

            const leftCol = document.createElement('div');
            leftCol.style = "display: flex; align-items: center; gap: 0.5rem;";

            const seekBtn = document.createElement('button');
            seekBtn.className = 'step-seek-btn';
            seekBtn.type = 'button';
            seekBtn.setAttribute('aria-label', `Step ${index + 1}, seek to ${visibleTime} seconds`);
            seekBtn.innerText = `Step ${index + 1}`;

            const seekText = document.createElement('span');
            seekText.style = "font-size: 0.75rem; color: var(--text-muted);";
            seekText.innerText = ` · Go to ${visibleTime}s${mapping.isRemoved ? ' (Removed)' : ''}`;

            leftCol.appendChild(seekBtn);
            leftCol.appendChild(seekText);

            const rightCol = document.createElement('div');
            rightCol.style = "display: flex; align-items: center; gap: 0.4rem;";

            const syncBtn = document.createElement('button');
            syncBtn.className = 'sys-sync-time-btn';
            syncBtn.type = 'button';
            syncBtn.title = "Set to current video time";
            syncBtn.innerText = "Set to current time";

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-ghost sys-delete-step-btn'; deleteBtn.style.color = 'var(--danger-color)';
            deleteBtn.type = 'button';
            deleteBtn.setAttribute('aria-label', `Delete Step ${index + 1}`);
            deleteBtn.title = `Delete Step ${index + 1}`;
            deleteBtn.innerText = "Delete";

            rightCol.appendChild(syncBtn);
            rightCol.appendChild(deleteBtn);

            headerRow.appendChild(leftCol);
            headerRow.appendChild(rightCol);
            card.appendChild(headerRow);

            if (mapping.isRemoved) {
                const removedWarning = document.createElement('div');
                removedWarning.style = "background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; color: #ef4444; font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.5rem;";
                removedWarning.innerHTML = `<div>⚠️ This step falls inside removed video</div>`;

                const restoreBtn = document.createElement('button');
                restoreBtn.type = 'button';
                restoreBtn.innerText = "Move to start of removed section";
                restoreBtn.className = "btn-ghost";
                restoreBtn.style = "font-size: 0.75rem; border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; align-self: flex-start;";
                restoreBtn.onclick = () => {
                    const newSourceTime = localVisibleToSourceTime(visibleTime);
                    step.sourceTimestamp = newSourceTime;
                    hasUnsavedChanges = true;
                    updateSaveStatusIndicator();
                    renderTimelineSteps();
                    scheduleStepAutosave();
                };

                removedWarning.appendChild(restoreBtn);
                card.appendChild(removedWarning);
            }

            // Timestamp row
            const timeRow = document.createElement('div');
            timeRow.style = "display: flex; align-items: center; gap: 0.5rem;";
            const timeLabel = document.createElement('label');
            timeLabel.style = "font-size: 0.7rem; color: var(--text-muted);";
            timeLabel.innerText = "Timestamp (sec):";

            const timeInput = document.createElement('input');
            timeInput.type = 'number';
            timeInput.className = 'step-time-input';
            timeInput.step = '0.1';
            timeInput.value = visibleTime;
            if (mapping.isRemoved) {
                timeInput.style.color = '#ef4444';
                timeInput.style.borderColor = '#ef4444';
            }

            timeRow.appendChild(timeLabel);
            timeRow.appendChild(timeInput);
            card.appendChild(timeRow);

            // User Action
            const actionDiv = document.createElement('div');
            const actionLabel = document.createElement('label');
            actionLabel.style = "display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.25rem;";
            actionLabel.innerText = "User Action:";

            const actionInput = document.createElement('input');
            actionInput.type = 'text';
            actionInput.className = 'step-instruction-input';
            actionInput.placeholder = "Describe what the user should do";
            actionInput.value = step.instruction;

            actionDiv.appendChild(actionLabel);
            actionDiv.appendChild(actionInput);
            card.appendChild(actionDiv);

            // Detailed Explanation
            const teachingDiv = document.createElement('div');
            const teachingLabel = document.createElement('label');
            teachingLabel.style = "display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.25rem;";
            teachingLabel.innerText = "Detailed Explanation:";

            const teachingInput = document.createElement('textarea');
            teachingInput.className = 'step-teaching-input';
            teachingInput.rows = 2;
            teachingInput.placeholder = "Explain how or why the user should complete this action";
            teachingInput.value = step.teachingText;

            teachingDiv.appendChild(teachingLabel);
            teachingDiv.appendChild(teachingInput);
            card.appendChild(teachingDiv);

            timelineStepsList.appendChild(card);
        });

        lastActiveStepId = null;
        updateActiveStep();
    };

    const createStepAtCurrentTime = () => {
        editorVideo.pause();
        const currentTime = parseFloat(editorVideo.currentTime.toFixed(1));

        const newStep = {
            id: crypto.randomUUID(),
            createdOrder: nextStepOrder++,
            sourceTimestamp: currentTime,
            instruction: "",
            teachingText: ""
        };

        steps.push(newStep);
        steps.sort((a, b) => a.sourceTimestamp - b.sourceTimestamp || a.createdOrder - b.createdOrder);

        renderTimelineSteps();

        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        scheduleStepAutosave();

        focusStep(newStep.id, true, '.step-instruction-input');
    };

    const deleteStep = (id) => {
        const index = steps.findIndex(s => s.id === id);
        if (index === -1) return;

        steps.splice(index, 1);
        renderTimelineSteps();

        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        scheduleStepAutosave();

        if (steps.length > 0) {
            const nextIndex = Math.min(index, steps.length - 1);
            const targetStep = steps[nextIndex];
            focusStep(targetStep.id, false);
        } else {
            addStepHereBtn.focus();
        }
    };

    const commitStepTimestamp = (id, inputEl) => {
        const step = steps.find(s => s.id === id);
        if (!step) return;

        const duration = editorVideo.duration || 0.0;
        const currentMapping = localSourceToVisibleTime(step.sourceTimestamp);
        const oldVisibleTime = parseFloat(currentMapping.visibleTime.toFixed(1));

        let newVisibleTime = parseFloat(inputEl.value);
        if (isNaN(newVisibleTime)) {
            inputEl.value = oldVisibleTime;
            return;
        }

        newVisibleTime = parseFloat(newVisibleTime.toFixed(1));
        if (newVisibleTime < 0) newVisibleTime = 0.0;

        const visibleDuration = localGetVisibleDuration();
        if (newVisibleTime > visibleDuration) {
            newVisibleTime = visibleDuration;
        }

        if (oldVisibleTime === newVisibleTime) {
            inputEl.value = newVisibleTime;
            return;
        }

        const sourceTime = localVisibleToSourceTime(newVisibleTime);
        step.sourceTimestamp = sourceTime;

        steps.sort((a, b) => a.sourceTimestamp - b.sourceTimestamp || a.createdOrder - b.createdOrder);

        renderTimelineSteps();

        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
        scheduleStepAutosave();

        focusStep(step.id, true, '.step-time-input');
    };

    const initPlaybackCoordinator = async () => {
        if (playbackCoordinator) {
            playbackCoordinator.dispose();
        }

        const setupCoordinator = () => {
            playbackCoordinator = new PlaybackCoordinator({
                media: editorVideo,
                getLegacyEdits: () => videoEdits,
                getSequence: () => {
                    const dur = editorVideo.duration || 0.0;
                    if (isTimelineSeqEditing && timelineEditorController) {
                        return timelineEditorController.getCommittedSequence();
                    }
                    return migrateLegacyEditsToSequence(sourceAssetId || 'active-source-asset', dur, videoEdits);
                },
                getSourceDuration: () => editorVideo.duration || 0.0,
                onStateChange: (state) => {
                    const visibleDur = state.visibleDuration;
                    const visibleTime = state.visibleTime;

                    editorVideoTime.innerText = `${formatTimeReadable(visibleTime)} / ${formatTimeReadable(visibleDur)}`;

                    const isPlaying = state.status === 'playing';
                    playPauseBtn.innerHTML = isPlaying ? '<span id="sys-play-icon">⏸</span> Pause' : '<span id="sys-play-icon">▶</span> Play';

                    updatePlayheadPosition();
                    updateActiveStep();
                },
                onClipChange: (clipId) => {},
                onError: (err) => {
                    console.error("Coordinator Playback Error:", err);
                }
            });

            const renderTranscriptionJobUI = async (state) => {
                const container = document.getElementById('sys-transcript-pipeline-controls');
                if (!container) return;

                container.innerHTML = '';

                // Call permission RPC as usability feature
                let hasEditAccess = false;
                if (existingGuide) {
                    const { data } = await supabase.rpc('can_edit_video_editor_guide', { p_guide_id: existingGuide.id });
                    hasEditAccess = !!data;
                } else {
                    hasEditAccess = (userRole === 'manager' || userRole === 'admin');
                }

                if (!hasEditAccess) {
                    container.style.display = 'none';
                    return;
                }
                container.style.display = 'flex';

                const workerAvailable = transcriptionUIController?.transcriptionService ? transcriptionUIController.transcriptionService.isAutomaticTranscriptionWorkerAvailable() : false;

                if (state.status === 'ready' || state.status === 'idle' || state.status === 'error') {
                    const generateBtn = document.getElementById('sys-generate-transcript-btn');
                    if (generateBtn && existingGuide?.id && sourceAssetId) {
                        generateBtn.style.display = 'block';
                    }
                    container.innerHTML = `
                        <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; width: 100%;">
                            Generate a transcript directly from the saved recording.
                        </div>
                    `;
                } else if (state.status === 'loading') {
                    container.innerHTML = `
                        <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%; text-align: center;">
                            <div class="loader" style="margin: 0 auto; border: 2px solid rgba(255,255,255,0.1); border-top: 2px solid var(--primary); border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite;"></div>
                            <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">Connecting to transcription services...</div>
                        </div>
                    `;
                } else if (state.status === 'processing') {
                    container.innerHTML = `
                        <div style="display: flex; flex-direction: column; gap: 0.25rem; width: 100%;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
                                <span>Processing: ${state.job?.progressStage || ''} (Attempt ${state.job?.attemptCount})</span>
                                <span id="sys-transcribe-cancel-btn" style="color: #ef4444; cursor: pointer; font-weight: 500;">Cancel</span>
                            </div>
                            <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                                <div style="width: 50%; height: 100%; background: var(--primary); transition: width 0.3s;"></div>
                            </div>
                            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">Preparing the transcript for review…</div>
                        </div>
                    `;
                } else if (state.status === 'awaiting_approval') {
                    const isConflict = state.existingTranscriptRevision !== state.job?.baseTranscriptRevision;
                    container.innerHTML = `
                        <div style="display: flex; flex-direction: column; gap: 0.5rem; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); padding: 0.5rem; border-radius: 4px; width: 100%;">
                            <div style="font-size: 0.8rem; color: #f59e0b; font-weight: 500;">Review Generated Transcript</div>
                            ${isConflict ? `
                                <div style="font-size: 0.7rem; color: #ef4444;">Warning: Active transcript changed. Approve disabled.</div>
                            ` : ''}
                            <div style="display: flex; gap: 0.5rem;">
                                <button id="sys-transcribe-approve-btn" class="btn-primary" style="flex: 1; font-size: 0.75rem; padding: 0.35rem 0.7rem;" ${isConflict ? 'disabled' : ''}>Approve</button>
                                <button id="sys-transcribe-reject-btn" class="btn-ghost" style="flex: 1; font-size: 0.75rem; padding: 0.35rem 0.7rem; border: 1px solid var(--glass-border); color: #ef4444;">Reject</button>
                            </div>
                        </div>
                    `;
                } else if (state.status === 'failed') {
                    container.innerHTML = `
                        <div style="display: flex; flex-direction: column; gap: 0.5rem; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.5rem; border-radius: 4px; width: 100%;">
                            <div style="font-size: 0.8rem; color: #ef4444; font-weight: 500;">Job Failed: ${state.job?.errorCode || 'Unknown Error'}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">${state.job?.errorMessageSafe || ''}</div>
                            <button id="sys-transcribe-retry-btn" class="btn-primary" style="font-size: 0.75rem; padding: 0.35rem 0.7rem;">Retry</button>
                        </div>
                    `;
                } else if (state.status === 'completed') {
                    if (!workerAvailable) {
                        container.innerHTML = `
                            <div style="font-size: 0.8rem; color: #10b981; font-weight: 500; text-align: center; width: 100%;">
                                Transcription completed
                            </div>
                        `;
                    } else {
                        container.innerHTML = `
                            <div style="display: flex; flex-direction: column; gap: 0.25rem; width: 100%;">
                                <div style="font-size: 0.8rem; color: #10b981; font-weight: 500;">Transcription Completed</div>
                                <button id="sys-transcribe-start-btn" class="btn-primary" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">Re-transcribe</button>
                            </div>
                        `;
                    }
                }

                // Attach listeners
                const startBtn = document.getElementById('sys-transcribe-start-btn');
                if (startBtn) {
                    startBtn.onclick = () => {
                        transcriptionUIController?.transcriptionJobController?.startTranscription(crypto.randomUUID());
                    };
                }

                const cancelBtn = document.getElementById('sys-transcribe-cancel-btn');
                if (cancelBtn) {
                    cancelBtn.onclick = () => {
                        transcriptionUIController?.transcriptionJobController?.cancel();
                    };
                }

                const approveBtn = document.getElementById('sys-transcribe-approve-btn');
                if (approveBtn && !approveBtn.disabled) {
                    approveBtn.onclick = () => {
                        transcriptionUIController?.handleApprove();
                    };
                }

                const rejectBtn = document.getElementById('sys-transcribe-reject-btn');
                if (rejectBtn) {
                    rejectBtn.onclick = () => {
                        transcriptionUIController?.transcriptionJobController?.reject();
                    };
                }

                const retryBtn = document.getElementById('sys-transcribe-retry-btn');
                if (retryBtn) {
                    retryBtn.onclick = () => {
                        transcriptionUIController?.transcriptionJobController?.retry();
                    };
                }

                // Setup manual import input listeners
                transcriptionUIController?.setupUIListeners();
            };

            {
                console.log("[DEBUG] Initializing Transcript Viewer");
                const transcriptPanel = document.getElementById('sys-transcript-panel');
                if (transcriptPanel) {
                    transcriptPanel.style.display = 'flex';
                }

                const duration = editorVideo.duration || 0.0;
                if (!transcriptionUIController) {
                    transcriptionUIController = new TranscriptionUIController({
                        supabase,
                        guideId: existingGuide?.id || null,
                        editorVideo,
                        playbackCoordinator,
                        videoEdits,
                        isTimelineSeqEditing,
                        timelineEditorController,
                        renderTranscriptState,
                        updateWordHighlights,
                        onStateChange: (jobState) => {
                            console.log("[DEBUG] onStateChange called:", jobState);
                            renderTranscriptionJobUI(jobState);
                        }
                    });
                    window.transcriptionUIController = transcriptionUIController;
                }

                transcriptionUIController.setSourceAsset(sourceAssetId, duration);
                if (!sourceAssetId) {
                    console.log("[DEBUG] No sourceAssetId, forcing error state UI");
                    renderTranscriptionJobUI({status: 'error'}).catch(e => console.error("[DEBUG] render error", e));
                }
                transcriptionUIController.setupUIListeners();

                const demoTranscriptBtn = document.getElementById('sys-demo-transcript-btn');
                if (demoTranscriptBtn) {
                    demoTranscriptBtn.onclick = () => {
                        if (transcriptionUIController) {
                            transcriptionUIController.loadDemoTranscript();
                            const transcriptPanel = document.getElementById('sys-transcript-panel');
                            if (transcriptPanel) {
                                transcriptPanel.style.display = 'flex';
                            }
                            fswAlert('Demo transcript loaded');
                        }
                    };
                }

                const followBtn = document.getElementById('sys-transcript-follow-btn');
                if (followBtn) {
                    const onFollowClick = () => {
                        if (transcriptionUIController?.transcriptViewerController) {
                            const cur = transcriptionUIController.transcriptViewerController.getState().followPlayback;
                            transcriptionUIController.transcriptViewerController.setFollowPlayback(!cur);
                            if (!cur) {
                                const activeId = transcriptionUIController.transcriptViewerController.getState().activeWordId;
                                if (activeId) {
                                    const activeEl = document.getElementById(`sys-word-${activeId}`);
                                    if (activeEl) {
                                        scrollWordIntoViewIfOutside(activeEl);
                                    }
                                }
                            }
                        }
                    };
                    followBtn.addEventListener('click', onFollowClick);
                    followBtn._onClick = onFollowClick;
                }
            }

            playbackCoordinator.load().catch(err => {
                console.error("Failed to load playback coordinator:", err);
            });
        };

        if (isTimelineSeqEditing) {
            const dur = editorVideo.duration || 0.0;
            const loadAndInit = async () => {
                if (!sourceAssetId && existingGuide && existingGuide.content_json?.videoUrl) {
                    try {
                        const asset = await createSourceAsset({
                            guideId: existingGuide.id,
                            originalStoragePath: existingGuide.content_json.videoUrl,
                            durationSeconds: dur,
                            fileSizeBytes: 0
                        });
                        sourceAssetId = asset.id;
                        if (transcriptionUIController) {
                            transcriptionUIController.setSourceAsset(sourceAssetId, dur);
                        }
                    } catch (e) {
                        console.error("Failed to dynamically create source asset:", e);
                    }
                }

                const targetSourceAssetId = sourceAssetId || 'active-source-asset';

                if (sourceAssetId && dur > 0) {
                    const { error: durationRepairError } = await supabase
                        .from('video_source_assets')
                        .update({ duration_seconds: dur })
                        .eq('id', sourceAssetId);

                    if (durationRepairError) {
                        console.warn('Could not repair the saved source duration:', durationRepairError);
                    }
                }

                const projectState = await loadProjectState(
                    existingGuide?.id || 'active-source-asset',
                    targetSourceAssetId,
                    videoEdits
                );

                const originalSequence = projectState.sequence;
                let seq = originalSequence;
                const savedClips = Array.isArray(seq?.clips) ? seq.clips : [];
                const savedClipsAreValid =
                    savedClips.length > 0
                    && savedClips.every(clip => {
                        const sourceStart = Number(clip.sourceStart);
                        const sourceEnd = Number(clip.sourceEnd);
                        return Number.isFinite(sourceStart)
                            && Number.isFinite(sourceEnd)
                            && sourceStart >= 0
                            && sourceEnd > sourceStart
                            && sourceEnd <= dur + 0.01;
                    });
                const savedVisibleDuration = savedClipsAreValid
                    ? savedClips.reduce(
                        (total, clip) => total + (Number(clip.sourceEnd) - Number(clip.sourceStart)),
                        0
                    )
                    : 0;
                let sequenceWasRepaired = false;

                if (dur > 0 && (!savedClipsAreValid || savedVisibleDuration <= 0.001)) {
                    const repairedSequence = migrateLegacyEditsToSequence(
                        targetSourceAssetId,
                        dur,
                        videoEdits
                    );
                    const repairedVisibleDuration = repairedSequence.clips.reduce(
                        (total, clip) => total + Math.max(0, Number(clip.sourceEnd) - Number(clip.sourceStart)),
                        0
                    );

                    if (repairedVisibleDuration > 0.001) {
                        console.warn('Repairing and persisting an invalid saved timeline from the guide video edits.');
                        seq = repairedSequence;
                        sequenceWasRepaired = true;
                    }
                }

                if (sequenceWasRepaired) {
                    const repairCreatedAt = new Date().toISOString();
                    const repairCommand = {
                        id: crypto.randomUUID(),
                        type: 'RestoreRemovedRange',
                        payload: {
                            projectId: projectState.id,
                            sourceAssetId: targetSourceAssetId,
                            revisionBefore: projectState.revision,
                            revisionAfter: projectState.revision + 1,
                            createdAt: repairCreatedAt,
                            sourceStart: 0,
                            sourceEnd: dur,
                            repairReason: 'invalid_saved_sequence'
                        },
                        inversePayload: {
                            beforeSequence: originalSequence
                        }
                    };

                    try {
                        const repairResult = await persistEditorProjectUpdate(
                            projectState.id,
                            projectState.revision,
                            seq,
                            [repairCommand],
                            existingGuide?.id || projectState.guideId,
                            targetSourceAssetId,
                            projectState.persistenceState,
                            crypto.randomUUID()
                        );
                        projectState.id = repairResult.projectId;
                        projectState.revision = repairResult.revision;
                        projectState.sequence = seq;
                        projectState.persistenceState = 'created';
                    } catch (repairError) {
                        console.error('The repaired timeline could not be persisted:', repairError);
                    }
                }

                if (existingGuide) {
                    existingGuide.revision = projectState.revision;
                }

                if (!autosaveController) {
                    autosaveController = new AutosaveController({
                        projectId: projectState.id || existingGuide?.id || 'active-source-asset',
                        initialRevision: projectState.revision,
                        initialSequence: seq,
                        persistenceState: projectState.persistenceState,
                        saveFn: async (projId, revision, seqVal, cmds, persistenceState, creationRequestId) => {
                            return await persistEditorProjectUpdate(
                                projId,
                                revision,
                                seqVal,
                                cmds,
                                existingGuide?.id || projId,
                                sourceAssetId || 'active-source-asset',
                                persistenceState,
                                creationRequestId
                            );
                        },
                        onStatusChange: (status) => {
                            const statusBadge = document.getElementById('sys-save-status');
                            if (!statusBadge) return;
                            statusBadge.style.display = 'inline-flex';
                            if (status === 'dirty' || status === 'saving' || status === 'retrying') {
                                statusBadge.className = 'save-status-badge unsaved';
                                statusBadge.innerText = '● Saving...';
                            } else if (status === 'saved' || status === 'idle') {
                                statusBadge.className = 'save-status-badge saved';
                                statusBadge.innerText = '✓ All changes saved';
                                hasUnsavedChanges = false;
                            } else if (status === 'conflict') {
                                statusBadge.className = 'save-status-badge conflict';
                                statusBadge.innerText = '⚠️ Version conflict detected. Local work preserved.';
                                if (timelineEditorController) {
                                    timelineEditorController.handleRevisionConflict();
                                }
                            } else {
                                statusBadge.className = 'save-status-badge error';
                                statusBadge.innerText = '❌ Save error';
                            }
                        }
                    });
                }

                if (!timelineEditorController) {
                    timelineEditorController = new TimelineEditorController({
                        projectId: projectState.id || existingGuide?.id || 'active-source-asset',
                        sourceAssetId: sourceAssetId || 'active-source-asset',
                        sourceDuration: dur,
                        initialSequence: seq,
                        initialRevision: projectState.revision,
                        autosaveController,
                        legacyEdits: videoEdits,
                        onStateChange: (persState, transState) => {
                            const gaps = getSequenceGaps(persState.sequence, dur);
                            videoEdits.trimStart = 0.0;
                            videoEdits.trimEnd = null;
                            videoEdits.cuts = [];

                            for (const gap of gaps) {
                                if (gap.type === 'trimStart') {
                                    videoEdits.trimStart = gap.end;
                                } else if (gap.type === 'trimEnd') {
                                    videoEdits.trimEnd = gap.start;
                                } else {
                                    videoEdits.cuts.push({
                                        id: gap.id,
                                        start: gap.start,
                                        end: gap.end
                                    });
                                }
                            }

                            renderActiveEdits();
                            renderTimelineSteps();
                            renderTimelineMarkers();
                            drawWaveform();
                            updateUndoRedoButtons();
                            if (transcriptionUIController?.transcriptViewerController) {
                                transcriptionUIController.transcriptViewerController.refreshSequence(persState.sequence);
                            }
                        }
                    });
                    updateUndoRedoButtons();
                }

                setupCoordinator();
            };

            try {
                await loadAndInit();
            } catch (err) {
                console.error("Failed to load project state:", err);
                setupCoordinator();
            }
        } else {
            setupCoordinator();
        }
    };

    const handleGlobalKeyDown = (e) => {
        if (!isTimelineSeqEditing || !timelineEditorController) return;

        if ((e.key === 'Backspace' || e.key === 'Delete') && selectedTranscriptKeys && selectedTranscriptKeys.size > 0) {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                // Do nothing if typing
            } else {
                e.preventDefault();
                handleRemoveSelection();
                return;
            }
        }

        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
            return;
        }

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            timelineEditorController.undo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            timelineEditorController.redo();
        } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            timelineEditorController.redo();
        }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    const handleClose = () => {
        const followBtn = document.getElementById('sys-transcript-follow-btn');
        if (followBtn && followBtn._onClick) {
            followBtn.removeEventListener('click', followBtn._onClick);
        }
        if (transcriptionUIController) {
            transcriptionUIController.dispose();
            transcriptionUIController = null;
        }
        if (playbackCoordinator) {
            playbackCoordinator.dispose();
            playbackCoordinator = null;
        }
        if (timelineEditorController) {
            timelineEditorController.dispose();
            timelineEditorController = null;
        }
        if (autosaveController) {
            autosaveController.dispose();
            autosaveController = null;
        }
        clearTimeout(transcriptNoticeTimer);
        delete window.__fswTimingDiagnostics;
        window.removeEventListener('keydown', handleGlobalKeyDown);
        onClose();
    };

    const seekToStep = (sourceTimestamp) => {
        if (playbackCoordinator) {
            playbackCoordinator.seekSourceTime(sourceTimestamp);
        } else {
            editorVideo.currentTime = sourceTimestamp;
        }
    };

    // Event Delegations
    timelineStepsList.addEventListener('click', (e) => {
        const card = e.target.closest('[data-step-id]');
        if (!card) return;
        const id = card.getAttribute('data-step-id');

        if (e.target.closest('.step-seek-btn')) {
            const step = steps.find(s => s.id === id);
            if (step) seekToStep(step.sourceTimestamp);
        } else if (e.target.closest('.sys-sync-time-btn')) {
            const step = steps.find(s => s.id === id);
            if (step) {
                const currentTime = parseFloat(editorVideo.currentTime.toFixed(1));
                step.sourceTimestamp = currentTime;
                steps.sort((a, b) => a.sourceTimestamp - b.sourceTimestamp || a.createdOrder - b.createdOrder);
                renderTimelineSteps();
                focusStep(id, false);
                hasUnsavedChanges = true;
                updateSaveStatusIndicator();
                scheduleStepAutosave();
            }
        } else if (e.target.closest('.sys-delete-step-btn')) {
            deleteStep(id);
        }
    });

    timelineStepsList.addEventListener('input', (e) => {
        const card = e.target.closest('[data-step-id]');
        if (!card) return;
        const id = card.getAttribute('data-step-id');
        const step = steps.find(s => s.id === id);
        if (!step) return;

        if (e.target.classList.contains('step-instruction-input')) {
            step.instruction = e.target.value;
            hasUnsavedChanges = true;
            updateSaveStatusIndicator();
            scheduleStepAutosave();
        } else if (e.target.classList.contains('step-teaching-input')) {
            step.teachingText = e.target.value;
            hasUnsavedChanges = true;
            updateSaveStatusIndicator();
            scheduleStepAutosave();
        }
    });

    timelineStepsList.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('step-time-input')) {
            const card = e.target.closest('[data-step-id]');
            if (card) {
                const id = card.getAttribute('data-step-id');
                commitStepTimestamp(id, e.target);
            }
        }
    });

    timelineStepsList.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('step-time-input')) {
            e.preventDefault();
            const card = e.target.closest('[data-step-id]');
            if (card) {
                const id = card.getAttribute('data-step-id');
                commitStepTimestamp(id, e.target);
                e.target.focus();
                e.target.select();
            }
        }
    });

    // Add step button
    addStepHereBtn.addEventListener('click', () => {
        createStepAtCurrentTime();
    });

    // Sync time display & active highlighting
    editorVideo.addEventListener('timeupdate', () => {
        if (playbackCoordinator) {
            return;
        }
        const duration = editorVideo.duration || 0.0;
        const rawTime = editorVideo.currentTime;

        // Handle cuts skipping
        const nextTime = getNextVisibleTime(rawTime, videoEdits, duration);
        if (nextTime !== rawTime) {
            editorVideo.currentTime = nextTime;
            return;
        }

        const visibleDuration = localGetVisibleDuration();
        const mapping = localSourceToVisibleTime(rawTime);

        editorVideoTime.innerText = `${formatTimeReadable(mapping.visibleTime)} / ${formatTimeReadable(visibleDuration)}`;
        updateActiveStep();
    });

    editorVideo.addEventListener('seeked', () => {
        if (playbackCoordinator) {
            return;
        }
        updateActiveStep();
    });

    let durationLoaded = false;
    editorVideo.addEventListener('loadedmetadata', async () => {
        durationLoaded = true;
        await initPlaybackCoordinator();
        let orderChanged = false;
        steps.forEach(s => {
            if (s.sourceTimestamp > editorVideo.duration) {
                s.sourceTimestamp = parseFloat(editorVideo.duration.toFixed(1));
                orderChanged = true;
            }
        });
        if (orderChanged) {
            steps.sort((a, b) => a.sourceTimestamp - b.sourceTimestamp || a.createdOrder - b.createdOrder);
        }

        renderTimelineSteps();

        if (existingGuide?.id) {
            await captureTimingDiagnostic('edit_open_ready_render');
        }

        if (latestTranscriptForStepRepair) {
            requestStepTimestampRepair(latestTranscriptForStepRepair);
        }

        if (recordedVideoBlob) {
            loadAndDecodeAudio(recordedVideoBlob);
        } else if (videoUrl) {
            loadAndDecodeAudio(videoUrl);
        }
    });

    // Metadata changes detection
    titleInput.addEventListener('input', () => {
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
    });
    descInput.addEventListener('input', () => {
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
    });
    tagsInput.addEventListener('input', () => {
        hasUnsavedChanges = true;
        updateSaveStatusIndicator();
    });

    cancelBtn.addEventListener('click', async () => {
        if (hasUnsavedChanges) {
            const confirmLeave = await fswConfirm("You have unsaved changes. Are you sure you want to discard them and exit?");
            if (!confirmLeave) return;
        }
        window.removeEventListener('beforeunload', preventUnload);
        handleClose();
    });

    if (toggleMetaBtn) {
        toggleMetaBtn.addEventListener('click', () => {
            if (metaStep.style.maxHeight === '0px' || metaStep.style.maxHeight === '0' || metaStep.style.maxHeight === '') {
                guideDetailsFields.style.display = 'flex';
                metaStep.style.maxHeight = '1000px';
                metaStep.style.opacity = '1';
                metaStep.style.margin = '0 0 1rem 0';
                metaStep.style.padding = '0';
                toggleMetaBtn.innerHTML = 'Guide Details <span style="font-size: 0.7rem;">▲</span>';
            } else {
                metaStep.style.maxHeight = '0';
                metaStep.style.opacity = '0';
                metaStep.style.margin = '0';
                metaStep.style.padding = '0';
                setTimeout(() => {
                    if (metaStep.style.maxHeight === '0px' || metaStep.style.maxHeight === '0' || metaStep.style.maxHeight === '') {
                        guideDetailsFields.style.display = 'none';
                    }
                }, 300);
                toggleMetaBtn.innerHTML = 'Guide Details <span style="font-size: 0.7rem;">▼</span>';
            }
        });
    }

    if (replaceVideoBtn) {
        replaceVideoBtn.addEventListener('click', async () => {
            const confirmReplace = await fswConfirm("Replacing the recording will delete all current transcript and timeline steps. Are you sure you want to proceed?");
            if (!confirmReplace) return;

            // Revert back to setup state
            if (toggleMetaBtn) toggleMetaBtn.style.display = 'none';
            if (replaceVideoBtn) replaceVideoBtn.style.display = 'none';
            if (builderSubtitle) builderSubtitle.style.display = 'block';

            if (walkthroughSetupWrapper) walkthroughSetupWrapper.style.display = 'flex';
            if (guideDetailsFields) guideDetailsFields.style.display = 'flex';

            if (metaStep) {
                metaStep.style.maxHeight = '1000px';
                metaStep.style.opacity = '1';
                metaStep.style.margin = '0 0 1rem 0';
            }
            if (editorStep) editorStep.style.display = 'none';

            // Clear current video data
            editorVideo.src = '';
            editorVideo.removeAttribute('src');
            videoUrl = '';
            steps = [];
            videoEdits = { schemaVersion: 1, trimStart: 0.0, trimEnd: null, cuts: [] };
            renderTimelineSteps();
            const wordsContainer = document.getElementById('sys-transcript-content');
            if (wordsContainer) wordsContainer.innerHTML = '';

            hasUnsavedChanges = true;
            updateSaveStatusIndicator();
        });
    }

    // PRE-POPULATE IF EDITING
    if (existingGuide) {
        titleInput.value = existingGuide.title || '';
        descInput.value = existingGuide.description || '';
        tagsInput.value = (existingGuide.tags || []).join(', ');

        const loadExisting = async () => {
             try {
                  const suppliedGuideSteps = snapshotRawSteps(existingGuide.content_json);
                  const { data: latestGuide, error: latestGuideError } = await supabase
                      .from('courses')
                      .select('*')
                      .eq('id', existingGuide.id)
                      .maybeSingle();

                  if (latestGuideError) {
                      console.warn('Could not refresh the latest saved guide before editing:', latestGuideError);
                  } else if (latestGuide) {
                      Object.assign(existingGuide, latestGuide);
                  }

                  let cJson = existingGuide.content_json;
                  if (typeof cJson === 'string') {
                      try { cJson = JSON.parse(cJson); } catch (e) {}
                  }
                  existingGuide.content_json = cJson;

                  // Resolve sourceAssetId deterministically from the database project-to-source relationship
                  const { data: project } = await supabase
                      .from('video_editor_projects')
                      .select('source_asset_id')
                      .eq('guide_id', existingGuide.id)
                      .maybeSingle();

                  if (project?.source_asset_id) {
                      sourceAssetId = project.source_asset_id;
                  } else {
                      const { data: assets } = await supabase
                          .from('video_source_assets')
                          .select('id')
                          .eq('guide_id', existingGuide.id)
                          .eq('original_storage_path', cJson?.videoUrl || '')
                          .maybeSingle();
                      if (assets) {
                          sourceAssetId = assets.id;
                      }
                  }

                  videoEdits = cJson?.videoEdits || { schemaVersion: 1, trimStart: 0.0, trimEnd: null, cuts: [] };
                  videoEdits.trimStart = parseFloat(videoEdits.trimStart) || 0.0;
                  if (videoEdits.trimEnd !== null && videoEdits.trimEnd !== undefined) {
                      let parsedEnd = parseFloat(videoEdits.trimEnd);
                      videoEdits.trimEnd = Number.isFinite(parsedEnd) ? parsedEnd : null;
                  }

                  let rawCuts = videoEdits.cuts || [];
                  if (!Array.isArray(rawCuts) && typeof rawCuts === 'object') {
                      rawCuts = Object.values(rawCuts);
                  }
                  videoEdits.cuts = (Array.isArray(rawCuts) ? rawCuts : [])
                      .map(c => ({
                          start: parseFloat(c?.start),
                          end: parseFloat(c?.end)
                      }))
                      .filter(c => Number.isFinite(c.start) && Number.isFinite(c.end));
                  renderStatus = cJson?.renderStatus || "notRequired";
                  publicationStatus = existingGuide.status || "draft";

                  const rawSteps = cJson?.steps || [];
                  steps = (rawSteps || []).map((s, idx) => {
                      let parsedTime = s.sourceTimestamp !== undefined ? parseFloat(s.sourceTimestamp) : parseFloat(s.timestamp);
                      if (!Number.isFinite(parsedTime)) {
                          parsedTime = 0.0;
                      }
                      return {
                          id: s.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
                          createdOrder: s.createdOrder !== undefined ? s.createdOrder : idx,
                          sourceTimestamp: parsedTime,
                          instruction: s.instruction || "",
                          teachingText: s.teachingText || ""
                      };
                  });

                  await captureTimingDiagnostic('edit_open_database_read', {
                      guideRow: latestGuide || existingGuide,
                      context: {
                          suppliedGuideSteps,
                          latestGuideReadError: latestGuideError
                              ? {
                                  message: latestGuideError.message,
                                  code: latestGuideError.code || null
                              }
                              : null
                      }
                  });

                  if (latestTranscriptForStepRepair) {
                      requestStepTimestampRepair(latestTranscriptForStepRepair);
                  }

                  let maxOrder = -1;
                  steps.forEach(s => {
                      if (s.createdOrder > maxOrder) maxOrder = s.createdOrder;
                  });
                  nextStepOrder = maxOrder + 1;

                  videoUrl = cJson?.videoUrl || '';

                  if (videoUrl) {
                      editorVideo.src = videoUrl;
                      editorStep.style.display = 'flex';
            setWorkspaceState('editing');
            saveBtn.disabled = false;
            draftBtn.disabled = false;

                      timelineStepsList.innerHTML = `
                          <div style="display: flex; align-items: center; justify-content: center; min-height: 120px; color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 1rem;">
                              Loading saved step timings…
                          </div>
                      `;

                      hasUnsavedChanges = false;
                      updateSaveStatusIndicator();
                  }
             } catch (e) {
                  console.error("loadExisting error:", e);
             }
        };
        loadExisting();
    }

    const uploadBase64ToStorage = async (base64String, fileName) => {
        const byteString = atob(base64String.split(',')[1]);
        const mimeString = base64String.split(',')[0].split(':')[1].split(';')[0];

        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }

        const blob = new Blob([ab], { type: mimeString });
        const { error } = await supabase.storage.from('guides').upload(fileName, blob);
        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage.from('guides').getPublicUrl(fileName);
        return publicUrl;
    };

    const saveGuide = async (targetStatus) => {
        const title = titleInput.value.trim();
        if (!title) {
            await fswAlert('Please enter a Guide Title');
            return;
        }

        if (steps.length === 0) {
            await fswAlert('Please add at least one step to your walkthrough timeline.');
            return;
        }

        await flushStepAutosave();

        if (isTimelineSeqEditing && autosaveController) {
            if (autosaveController.getStatus() === 'conflict') {
                await fswAlert("Cannot save guide due to a version conflict. Please resolve the conflict first.");
                return;
            }
            await autosaveController.flush();
        }

        const isPublish = targetStatus === 'live';

        if (isPublish && transcriptionUIController && transcriptionUIController.transcriptionJobController) {
            const jobState = transcriptionUIController.transcriptionJobController.getState();
            if (jobState.status === 'failed' || jobState.status === 'error') {
                await fswAlert("Cannot publish guide because the transcript generation failed. Please regenerate the transcript before publishing.");
                return;
            }
        }

        const primaryBtn = isPublish ? saveBtn : draftBtn;
        const secondaryBtn = isPublish ? draftBtn : saveBtn;
        const originalText = isPublish ? 'Publish Guide' : 'Save Draft';

        try {
            primaryBtn.innerText = isPublish ? 'Publishing...' : 'Saving...';
            primaryBtn.disabled = true;
            secondaryBtn.disabled = true;

            let finalVideoUrl = videoUrl;
            if (recordedVideoBlob) {
                primaryBtn.innerText = 'Uploading walkthrough video...';
                const extension = (recordedVideoBlob instanceof File && (recordedVideoBlob.name.endsWith('.mp4') || recordedVideoBlob.type === 'video/mp4')) ? 'mp4' : 'webm';
                const fileName = `walkthrough_${Date.now()}.${extension}`;
                const { error: uploadError } = await supabase.storage.from('guides').upload(fileName, recordedVideoBlob);
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabase.storage.from('guides').getPublicUrl(fileName);
                finalVideoUrl = publicUrl;

                // Clear state so we don't upload again
                recordedVideoBlob = null;
                videoUrl = finalVideoUrl;
            }

            let thumbnail_url = '';
            try {
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = editorVideo.videoWidth || 640;
                thumbCanvas.height = editorVideo.videoHeight || 360;
                const tCtx = thumbCanvas.getContext('2d');
                tCtx.drawImage(editorVideo, 0, 0, thumbCanvas.width, thumbCanvas.height);
                const thumbBase64 = thumbCanvas.toDataURL('image/jpeg', 0.8);
                const thumbName = `thumb_${Date.now()}.jpg`;
                thumbnail_url = await uploadBase64ToStorage(thumbBase64, thumbName);
            } catch (e) {
                console.warn("Failed to generate video thumbnail, using default:", e);
                thumbnail_url = existingGuide?.thumbnail_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400";
            }

            const duration = editorVideo.duration || 0.0;

            if (isPublish) {
                renderStatus = "notRequired";
            }

            const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
            const finalContent = {
                is_system_simulation: true,
                type: "video_walkthrough",
                videoUrl: finalVideoUrl,
                videoEdits: videoEdits,
                renderStatus: renderStatus,
                steps: steps.map(s => {
                    const mapping = localStepToVisibleTime(s.sourceTimestamp);
                    return {
                        id: s.id,
                        createdOrder: s.createdOrder,
                        sourceTimestamp: s.sourceTimestamp,
                        timestamp: parseFloat(mapping.visibleTime.toFixed(1)),
                        instruction: s.instruction,
                        teachingText: s.teachingText
                    };
                })
            };

            let savedGuide = null;
            if (existingGuide) {
                savedGuide = await updateCourse(existingGuide.id, {
                    title: title,
                    description: descInput.value,
                    thumbnail_url: thumbnail_url,
                    tags: tags,
                    content_json: finalContent,
                    status: targetStatus
                });
            } else {
                savedGuide = await createCourse({
                    title: title,
                    description: descInput.value,
                    thumbnail_url: thumbnail_url,
                    tags: tags,
                    content_json: finalContent,
                    status: targetStatus
                });
            }

            if (existingGuide && savedGuide) {
                Object.assign(existingGuide, savedGuide, {
                    content_json: finalContent
                });
            }

            primaryBtn.innerText = 'Success!';
            hasUnsavedChanges = false;
            updateSaveStatusIndicator();

            setTimeout(handleClose, 1000);

        } catch (err) {
            console.error('Saving failed:', err);
            await fswAlert(err.message || 'Failed to save software guide.');
            primaryBtn.innerText = originalText;
            primaryBtn.disabled = false;
            secondaryBtn.disabled = false;
        }
    };

    draftBtn.addEventListener('click', () => saveGuide('draft'));
    saveBtn.addEventListener('click', () => saveGuide('live'));
};
