import { createCourse, updateCourse } from '../api/courses.js';
import { fetchSystemTags } from '../api/guides.js';
import { supabase } from '../api/supabase.js';
import { fswAlert, fswConfirm } from '../utils/dialog';

export const renderSystemBuilder = () => {
    return `
    <div class="glass fade-in" style="padding: 2rem; border-radius: var(--radius-lg); position: relative; min-height: 80vh; display: flex; flex-direction: column;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem; margin-bottom: 1rem;">
            <div>
                <h2 style="margin: 0; color: white;">Interactive Guide Builder</h2>
                <p style="margin: 0.5rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">Create a step-by-step interactive software guide.</p>
            </div>
            <div style="display: flex; gap: 1rem;">
                <button id="sys-cancel-btn" class="btn-ghost">Cancel</button>
                <button id="sys-save-btn" class="btn-primary" disabled>Publish Guide</button>
            </div>
        </div>

        <!-- Meta Setup -->
        <div id="sys-meta-step" style="display: flex; gap: 3.5rem; align-items: stretch; width: 100%; box-sizing: border-box;">
            <div style="flex: 1; display: flex; flex-direction: column;">
                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Interactive Guide Title</label>
                <input type="text" id="sys-title" placeholder="e.g. Sage 50: Raising a Purchase Order" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; box-sizing: border-box; outline: none;">
                
                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Short Description</label>
                <textarea id="sys-desc" rows="4" placeholder="Briefly explain what the user will learn to do..." style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 1rem; resize: none; box-sizing: border-box; outline: none; flex: 1; min-height: 110px;"></textarea>
                
                <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Tags (comma separated)</label>
                <input type="text" id="sys-tags" list="sys-tags-list" placeholder="e.g. Sage 50, Sales" style="width: 100%; padding: 0.8rem; border-radius: var(--radius-md); border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 0; box-sizing: border-box; outline: none;">
                <datalist id="sys-tags-list"></datalist>
            </div>

            <div style="flex: 1; display: flex; flex-direction: column;">
                 <label style="color: var(--text-muted); display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Walkthrough Setup</label>
                 
                 <!-- Screen Record Zone -->
                 <div id="sys-panel-record" style="display: flex; flex: 1; border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 1.5rem; background: rgba(0,0,0,0.15); flex-direction: column; align-items: center; justify-content: center; gap: 1rem; text-align: center; min-height: 220px;">
                     <div id="rec-setup-ui" style="width: 100%;">
                         <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🎙️ Screen & Voice Walkthrough</div>
                         <p style="color: var(--text-muted); font-size: 0.8rem; margin: 0 0 1.2rem 0; max-width: 380px; margin-left: auto; margin-right: auto; line-height: 1.4;">Record your screen and speak out loud explaining what you are doing. The AI will automatically clean up your speech, create structured timeline steps, and build an interactive video walkthrough!</p>
                         <button id="sys-start-rec-btn" class="btn-primary" style="display: inline-flex; align-items: center; gap: 0.6rem; background: #ef4444; border-color: #ef4444; color: white; cursor: pointer;">
                             <span style="display: inline-block; width: 10px; height: 10px; background: white; border-radius: 50%; animation: pulse-dot 1.5s infinite;"></span>
                             Start Walkthrough Recording
                         </button>
                     </div>
                     
                     <div id="rec-live-ui" style="display: none; flex-direction: column; align-items: center; gap: 0.6rem;">
                          <div style="color: #ef4444; font-weight: bold; display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem;">
                              <span style="display: inline-block; width: 12px; height: 12px; background: #ef4444; border-radius: 50%; animation: pulse-dot 1s infinite;"></span>
                              RECORDING WALKTHROUGH...
                          </div>
                          <div id="rec-timer" style="font-size: 1.5rem; font-family: monospace; color: white;">00:00</div>
                          
                          <!-- Live mic volume indicator -->
                          <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.1rem; margin-bottom: 0.4rem;">
                              <span style="font-size: 0.75rem; color: var(--text-muted);">🎙️ Mic Level:</span>
                              <div style="width: 100px; height: 8px; background: rgba(255,255,255,0.15); border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                                  <div id="rec-volume-bar" style="height: 100%; width: 0%; background: #10b981; border-radius: 4px; transition: width 0.08s ease;"></div>
                              </div>
                          </div>

                          <button id="sys-stop-rec-btn" class="btn-ghost" style="border: 1px solid #ef4444; color: #ef4444; padding: 0.5rem 1.5rem; font-weight: 600; cursor: pointer; border-radius: 4px;">
                              Stop Recording
                          </button>
                      </div>
                     
                     <div id="rec-progress-ui" style="display: none; flex-direction: column; align-items: center; gap: 0.8rem; width: 100%;">
                         <div class="loader" style="border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid var(--primary); border-radius: 50%; width: 32px; height: 32px; animation: spin 1s linear infinite;"></div>
                         <div id="rec-progress-msg" style="color: white; font-size: 0.95rem; font-weight: 600;">AI Auto-Pilot processing walkthrough...</div>
                         <div style="background: rgba(255,255,255,0.1); border-radius: 10px; width: 80%; height: 6px; overflow: hidden; position: relative; margin-top: 0.5rem;">
                             <div id="rec-progress-bar" style="background: var(--primary); width: 10%; height: 100%; transition: width 0.4s;"></div>
                         </div>
                     </div>
                 </div>
            </div>
        </div>

        <!-- Timeline Video Walkthrough Editor -->
        <div id="sys-editor-step" style="display: none; flex-direction: column; flex: 1;">
            
             <!-- Editor Area -->
             <div style="display: flex; gap: 1.5rem; flex: 1; min-height: 520px;">
                 
                 <!-- Video Walkthrough Player -->
                 <div style="flex: 2; background: rgba(0,0,0,0.5); border-radius: var(--radius-md); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--glass-border);">
                     <div style="background: rgba(0,0,0,0.6); padding: 0.75rem 1rem; font-weight: bold; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
                         <span>🎥 Recorded Walkthrough</span>
                         <button id="sys-add-step-here-btn" class="btn-primary" style="padding: 0.3rem 0.8rem; font-size: 0.8rem; background: #10b981; border-color: #10b981; color: white; cursor: pointer; border-radius: 4px;">➕ Add Step at Current Time</button>
                     </div>
                     <video id="sys-editor-video" style="width: 100%; flex: 1; background: black; display: block;" controls></video>
                     <div style="padding: 0.75rem; background: rgba(0,0,0,0.3); font-size: 0.8rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--glass-border);">
                         <span>Current Time: <strong id="sys-editor-video-time" style="color: white; font-family: monospace;">0.00s</strong></span>
                         <span style="font-style: italic;">Scrub the video and adjust instruction cards!</span>
                     </div>
                 </div>

                 <!-- Sidebar Timeline Steps Controls -->
                 <div style="flex: 1.2; display: flex; flex-direction: column; gap: 1rem;">
                     <div class="glass" style="padding: 1rem; border-radius: var(--radius-md); flex: 1; display: flex; flex-direction: column; overflow: hidden; max-height: 580px;">
                         <h4 style="margin: 0 0 1rem 0; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--primary);">📝 Timeline Steps</h4>
                         
                         <!-- Scrollable Steps List -->
                         <div id="sys-timeline-steps-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; padding-right: 0.25rem;">
                             <!-- Dynamic Step Cards go here -->
                         </div>
                     </div>
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
    </style>
    `;
};

export const initSystemBuilder = (onClose, existingGuide = null) => {
    const cancelBtn = document.getElementById('sys-cancel-btn');
    const saveBtn = document.getElementById('sys-save-btn');
    const titleInput = document.getElementById('sys-title');
    const descInput = document.getElementById('sys-desc');
    const tagsInput = document.getElementById('sys-tags');
    const tagsList = document.getElementById('sys-tags-list');
    const metaStep = document.getElementById('sys-meta-step');
    const editorStep = document.getElementById('sys-editor-step');

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

    let steps = []; // [{ timestamp, instruction, teachingText }]
    let recordedVideoBlob = null;
    let videoUrl = null;

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

    cancelBtn.addEventListener('click', onClose);

    const loadImageObject = (src) => {
        return new Promise((resolve) => {
            if (!src) return resolve(null);
            const img = new Image();
            let resolved = false;
            const finish = (result) => {
                if (resolved) return;
                resolved = true;
                resolve(result);
            };
            img.crossOrigin = "anonymous";
            img.onload = () => finish(img);
            img.onerror = () => {
                console.error("Failed to load image", src);
                finish(null);
            };
            img.src = src;
            setTimeout(() => finish(null), 8000); // 8s timeout
        });
    };

    // PRE-POPULATE IF EDITING
    if (existingGuide) {
        titleInput.value = existingGuide.title || '';
        descInput.value = existingGuide.description || '';
        tagsInput.value = (existingGuide.tags || []).join(', ');
        
        const loadExisting = async () => {
             try {
                  let cJson = existingGuide.content_json;
                  if (typeof cJson === 'string') {
                      try { cJson = JSON.parse(cJson); } catch (e) {}
                  }
                  const jsonSlides = cJson?.slides || [];
                  
                  const loadedSlides = await Promise.all(jsonSlides.map(async (s) => {
                      if (!s) return null;
                      const img = await loadImageObject(s.imageUrl);
                      return {
                          id: s.id || `slide_${Math.random()}`,
                          imageUrl: s.imageUrl || '',
                          originalImage: img,
                          instruction: s.instruction || '',
                          teachingText: s.teachingText || '',
                          box: s.box ? { ...s.box } : null
                      };
                  }));
                  slides = loadedSlides.filter(Boolean);
                  
                  if (slides.length > 0) {
                      editorStep.style.display = 'flex';
                      editorStep.style.borderTop = '1px solid var(--glass-border)';
                      editorStep.style.paddingTop = '1.5rem';
                      saveBtn.disabled = false;
                      renderNav();
                      setActiveSlide(0);
                  } else {
                      console.warn("No slides found in the existing guide.");
                  }
             } catch (err) {
                  console.error("Error in loadExisting:", err);
                  fswAlert("Could not load previous slides: " + (err.message || err.toString()));
             }
        };
        loadExisting();
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
    const processRecordedWalkthrough = async (videoBlob) => {
        recLiveUi.style.display = 'none';
        recProgressUi.style.display = 'flex';

        try {
            // Step 1: Speech to Text (Whisper)
            recProgressMsg.innerText = "Transcribing spoken walkthrough (1/2)...";
            recProgressBar.style.width = "40%";

            let segments = [];
            try {
                // Convert Blob to base64
                const reader = new FileReader();
                reader.readAsDataURL(videoBlob);
                const fileBase64 = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result);
                });

                const transRes = await fetch('/api/transcribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileBase64: fileBase64,
                        model: 'whisper-1',
                        response_format: 'verbose_json'
                    })
                });

                if (transRes.ok) {
                    const transData = await transRes.json();
                    segments = transData.segments || [];
                } else {
                    console.warn(`Whisper transcription failed with status ${transRes.status}`);
                }
            } catch (transError) {
                console.warn("Speech-to-text transcription error:", transError);
            }

            // Step 2: Clean and structure steps with GPT-4o-mini
            recProgressMsg.innerText = "Structuring timeline steps with AI (2/2)...";
            recProgressBar.style.width = "75%";
            
            steps = [];
            if (segments.length > 0) {
                try {
                    steps = await cleanAndStructureSteps(segments);
                } catch (gptError) {
                    console.warn("GPT step structuring error:", gptError);
                }
            }
            
            // Fallback if no steps structured
            if (steps.length === 0) {
                steps = [
                    {
                        timestamp: 0.0,
                        instruction: "Start Walkthrough",
                        teachingText: "Welcome to this interactive walkthrough guide."
                    }
                ];
                await fswAlert("Speech was silent or too low. Walkthrough video loaded successfully! You can now manually add and customize your steps using the editor timeline.");
            }
            
            // Activate Editor View
            editorStep.style.display = 'flex';
            editorStep.style.borderTop = '1px solid var(--glass-border)';
            editorStep.style.paddingTop = '1.5rem';
            saveBtn.disabled = false;
            
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
            return parsed.steps || [];
        }
        return [];
    };

    const renderTimelineSteps = () => {
        timelineStepsList.innerHTML = '';
        
        steps.forEach((step, index) => {
            const card = document.createElement('div');
            card.className = 'glass';
            card.style = `padding: 1rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 0.75rem; background: rgba(0,0,0,0.25); cursor: pointer; transition: all 0.2s;`;
            
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.4rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-weight: bold; color: var(--primary); font-size: 0.85rem;">Step ${index + 1}</span>
                        <div style="display: flex; align-items: center; gap: 0.25rem;">
                            <input type="number" class="step-time-input" value="${step.timestamp}" step="0.1" style="width: 50px; background: rgba(0,0,0,0.5); border: 1px solid var(--glass-border); color: white; border-radius: 4px; padding: 2px; font-size: 0.75rem; text-align: center; font-family: monospace;">
                            <span style="font-size: 0.7rem; color: var(--text-muted);">sec</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.4rem;">
                        <button class="sys-sync-time-btn btn-ghost" style="padding: 0.2rem 0.4rem; font-size: 0.7rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer; color: white;" title="Sync to current video time">🎯 Sync</button>
                        <button class="sys-delete-step-btn btn-ghost" style="padding: 0.2rem 0.4rem; font-size: 0.7rem; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 4px; cursor: pointer;" title="Delete Step">🗑️</button>
                    </div>
                </div>
                
                <div>
                    <label style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.25rem;">User Action:</label>
                    <input type="text" class="step-instruction-input" value="${step.instruction.replace(/"/g, '&quot;')}" style="width: 100%; box-sizing: border-box; padding: 0.4rem; border-radius: 4px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.4); color: white; font-size: 0.8rem;">
                </div>

                <div>
                    <label style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.25rem;">Detailed Explanation:</label>
                    <textarea class="step-teaching-input" rows="2" style="width: 100%; box-sizing: border-box; padding: 0.4rem; border-radius: 4px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.4); color: white; font-size: 0.8rem; resize: none; font-family: inherit;">${step.teachingText}</textarea>
                </div>
            `;

            // Seek video when card header is clicked
            card.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
                    editorVideo.currentTime = step.timestamp;
                }
            });

            // Input bindings
            card.querySelector('.step-time-input').addEventListener('change', (e) => {
                step.timestamp = parseFloat(parseFloat(e.target.value).toFixed(1)) || 0;
                steps.sort((a, b) => a.timestamp - b.timestamp);
                renderTimelineSteps();
            });

            card.querySelector('.step-instruction-input').addEventListener('input', (e) => {
                step.instruction = e.target.value;
            });

            card.querySelector('.step-teaching-input').addEventListener('input', (e) => {
                step.teachingText = e.target.value;
            });

            // Sync to video current play time
            card.querySelector('.sys-sync-time-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                step.timestamp = parseFloat(editorVideo.currentTime.toFixed(1));
                steps.sort((a, b) => a.timestamp - b.timestamp);
                renderTimelineSteps();
            });

            // Delete step
            card.querySelector('.sys-delete-step-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                steps.splice(index, 1);
                renderTimelineSteps();
            });

            timelineStepsList.appendChild(card);
        });
    };

    // Add step button
    addStepHereBtn.addEventListener('click', () => {
        steps.push({
            timestamp: parseFloat(editorVideo.currentTime.toFixed(1)),
            instruction: "Click target area",
            teachingText: "Explain what to do next..."
        });
        steps.sort((a, b) => a.timestamp - b.timestamp);
        renderTimelineSteps();
    });

    // Sync time display
    editorVideo.addEventListener('timeupdate', () => {
        editorVideoTime.innerText = editorVideo.currentTime.toFixed(2) + "s";
    });

    // PRE-POPULATE IF EDITING
    if (existingGuide) {
        titleInput.value = existingGuide.title || '';
        descInput.value = existingGuide.description || '';
        tagsInput.value = (existingGuide.tags || []).join(', ');
        
        const loadExisting = async () => {
             try {
                  let cJson = existingGuide.content_json;
                  if (typeof cJson === 'string') {
                      try { cJson = JSON.parse(cJson); } catch (e) {}
                  }
                  steps = cJson?.steps || [];
                  videoUrl = cJson?.videoUrl || '';
                  
                  if (videoUrl) {
                      editorVideo.src = videoUrl;
                      editorStep.style.display = 'flex';
                      editorStep.style.borderTop = '1px solid var(--glass-border)';
                      editorStep.style.paddingTop = '1.5rem';
                      saveBtn.disabled = false;
                      renderTimelineSteps();
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

    // Publish logic
    saveBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        if (!title) {
            await fswAlert('Please enter a Guide Title');
            return;
        }

        if (steps.length === 0) {
            await fswAlert('Please add at least one step to your walkthrough timeline.');
            return;
        }

        try {
            saveBtn.innerText = 'Publishing...';
            saveBtn.disabled = true;

            let finalVideoUrl = videoUrl;
            if (recordedVideoBlob) {
                saveBtn.innerText = 'Uploading walkthrough video...';
                const fileName = `walkthrough_${Date.now()}.webm`;
                const { error: uploadError } = await supabase.storage.from('guides').upload(fileName, recordedVideoBlob);
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabase.storage.from('guides').getPublicUrl(fileName);
                finalVideoUrl = publicUrl;
            }

            // Create thumbnail from first frame
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
                thumbnail_url = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400";
            }

            const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
            const finalContent = {
                is_system_simulation: true,
                type: "video_walkthrough",
                videoUrl: finalVideoUrl,
                steps: steps.map(s => ({
                    timestamp: parseFloat(s.timestamp),
                    instruction: s.instruction,
                    teachingText: s.teachingText
                }))
            };

            if (existingGuide) {
                await updateCourse(existingGuide.id, {
                    title: title,
                    description: descInput.value,
                    thumbnail_url: thumbnail_url,
                    tags: tags,
                    content_json: finalContent
                });
            } else {
                await createCourse({
                    title: title,
                    description: descInput.value,
                    thumbnail_url: thumbnail_url,
                    tags: tags,
                    content_json: finalContent,
                    status: 'live'
                });
            }

            saveBtn.innerText = 'Success!';
            setTimeout(onClose, 1000);

        } catch (err) {
            console.error('Publishing failed:', err);
            fswAlert(err.message || 'Failed to publish software guide.');
            saveBtn.innerText = 'Error';
            saveBtn.disabled = false;
        }
    });
};
