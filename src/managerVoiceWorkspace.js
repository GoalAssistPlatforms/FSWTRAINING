import {
  deleteVoiceSample,
  generateVoicePreview,
  getVoiceSampleAudio,
  getVoiceSummary,
  saveVoicePronunciations,
  updateVoiceDelivery,
  uploadVoiceSamples
} from './api/voiceManagement.js';
import { fswAlert, fswConfirm } from './utils/dialog.js';

const STYLE_ID = 'manager-voice-workspace-styles';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .voice-workspace { display: flex; flex-direction: column; gap: 1.25rem; }
    .voice-workspace-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .voice-workspace-header h2 { margin: 0; font-size: 1.5rem; color: white; }
    .voice-workspace-header p { margin: 0.45rem 0 0; color: var(--text-muted); max-width: 720px; line-height: 1.5; }
    .voice-status-pill { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.75rem; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #d4d4d8; font-size: 0.78rem; font-weight: 700; }
    .voice-status-pill.ready { color: #86efac; border-color: rgba(34,197,94,0.32); background: rgba(34,197,94,0.08); }
    .voice-status-pill.training { color: #7dd3fc; border-color: rgba(56,189,248,0.32); background: rgba(56,189,248,0.08); }
    .voice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
    .voice-card { padding: 1.35rem; border-radius: var(--radius-lg); border: 1px solid var(--glass-border); background: rgba(13,17,23,0.72); box-shadow: 0 12px 30px rgba(0,0,0,0.18); }
    .voice-card.wide { grid-column: 1 / -1; }
    .voice-card h3 { margin: 0; color: white; font-size: 1.05rem; }
    .voice-card-copy { margin: 0.4rem 0 1rem; color: var(--text-muted); font-size: 0.86rem; line-height: 1.5; }
    .voice-field-label { display: block; margin-bottom: 0.45rem; color: #e4e4e7; font-size: 0.78rem; font-weight: 700; }
    .voice-input, .voice-select, .voice-textarea { width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; background: rgba(0,0,0,0.28); color: white; font: inherit; outline: none; }
    .voice-input, .voice-select { min-height: 42px; padding: 0.65rem 0.75rem; }
    .voice-textarea { min-height: 96px; padding: 0.75rem; resize: vertical; line-height: 1.45; }
    .voice-input:focus, .voice-select:focus, .voice-textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(18,142,205,0.12); }
    .voice-actions { display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap; }
    .voice-primary, .voice-secondary, .voice-danger { min-height: 38px; padding: 0.55rem 0.85rem; border-radius: 7px; font: inherit; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
    .voice-primary { border: 1px solid var(--primary); background: var(--primary); color: white; }
    .voice-secondary { border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: white; }
    .voice-danger { border: 1px solid rgba(248,113,113,0.3); background: rgba(127,29,29,0.12); color: #fecaca; }
    .voice-primary:disabled, .voice-secondary:disabled, .voice-danger:disabled { opacity: 0.5; cursor: wait; }
    .voice-progress { height: 8px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,0.07); }
    .voice-progress > div { height: 100%; border-radius: inherit; background: var(--primary); }
    .voice-recording-summary { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 0.65rem; color: #d4d4d8; font-size: 0.82rem; }
    .voice-recording-list, .voice-pronunciation-list { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; max-height: 320px; overflow-y: auto; padding-right: 0.2rem; }
    .voice-recording-row, .voice-pronunciation-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 0.75rem; align-items: center; padding: 0.75rem; border-radius: 9px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.025); }
    .voice-row-title { color: white; font-size: 0.84rem; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .voice-row-meta { margin-top: 0.18rem; color: var(--text-muted); font-size: 0.72rem; }
    .voice-inline-form { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) auto; gap: 0.65rem; align-items: end; }
    .voice-delivery-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .voice-note { margin-top: 0.65rem; color: var(--text-muted); font-size: 0.72rem; line-height: 1.45; }
    .voice-empty { padding: 1rem; border: 1px dashed rgba(255,255,255,0.12); border-radius: 9px; color: var(--text-muted); text-align: center; font-size: 0.8rem; }
    @media (max-width: 900px) {
      .voice-grid { grid-template-columns: 1fr; }
      .voice-card.wide { grid-column: auto; }
      .voice-inline-form, .voice-delivery-grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
}

export function formatVoiceDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total} sec`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function voiceTrainingStatus(voice) {
  const states = Object.values(voice?.fineTuning?.state || {}).map(value => String(value || '').toLowerCase());
  if (states.some(value => value.includes('fine_tuning') || value.includes('training') || value.includes('queued'))) {
    return { label: 'Training in progress', className: 'training' };
  }
  if (states.length && states.every(value => value === 'fine_tuned' || value.includes('fine_tuned'))) {
    return { label: 'Ready', className: 'ready' };
  }
  if (voice?.category === 'professional') return { label: 'Professional voice', className: 'ready' };
  return { label: 'Voice connected', className: '' };
}

export function voicePresetFromSettings(settings = {}) {
  const stability = Number(settings.stability);
  const style = Number(settings.style);
  if ((Number.isFinite(style) && style >= 0.12) || (Number.isFinite(stability) && stability <= 0.4)) return 'expressive';
  if (Number.isFinite(stability) && stability >= 0.65) return 'consistent';
  return 'natural';
}

function speedPresetFromSettings(settings = {}) {
  const speed = Number(settings.speed) || 1;
  if (speed <= 0.94) return '0.9';
  if (speed >= 1.06) return '1.1';
  return '1';
}

function pronunciationValue(rule) {
  if (rule?.type === 'phoneme') return rule.phoneme || '';
  return rule?.alias || '';
}

function renderSummary(summary) {
  const status = voiceTrainingStatus(summary.voice);
  const seconds = Number(summary.totalDurationSecs) || 0;
  const progress = Math.min(100, Math.round((seconds / (3 * 3600)) * 100));
  const preset = voicePresetFromSettings(summary.settings);
  const speed = speedPresetFromSettings(summary.settings);
  const samples = summary.samples || [];
  const rules = summary.pronunciations || [];

  return `
    <div class="voice-workspace">
      <div class="voice-workspace-header">
        <div>
          <h2>Voice</h2>
          <p>Improve the narrator used across your training. Add stronger source recordings, control key pronunciations and keep delivery consistent.</p>
        </div>
        <div class="voice-status-pill ${status.className}"><span>●</span>${status.label}</div>
      </div>

      <div class="voice-grid">
        <section class="voice-card wide">
          <h3>${summary.voice?.name || 'FSW Narrator'}</h3>
          <p class="voice-card-copy">Professional narration voice used when new lesson audio is generated.</p>
          <label class="voice-field-label" for="voice-preview-text">Preview your voice</label>
          <textarea id="voice-preview-text" class="voice-textarea" maxlength="1500">This is a preview of our training narrator. It should sound clear, natural and easy to follow.</textarea>
          <div class="voice-actions" style="margin-top:0.7rem;">
            <button id="voice-preview-btn" class="voice-primary" type="button">Play Preview</button>
            <span id="voice-preview-status" class="voice-note" style="margin:0;"></span>
          </div>
        </section>

        <section class="voice-card">
          <h3>Training Recordings</h3>
          <p class="voice-card-copy">Add clean recordings in a consistent speaking style to improve the Professional Voice Clone.</p>
          <div class="voice-recording-summary">
            <span>${samples.length} recording${samples.length === 1 ? '' : 's'}</span>
            <strong>${seconds ? formatVoiceDuration(seconds) : 'Duration not reported'}</strong>
          </div>
          <div class="voice-progress"><div style="width:${progress}%"></div></div>
          <div class="voice-note">ElevenLabs recommends roughly 2 to 3 hours of high quality, consistent material for the strongest result.</div>
          <input id="voice-recording-input" type="file" accept="audio/*" multiple hidden>
          <div class="voice-actions" style="margin-top:0.9rem;">
            <button id="voice-recording-choose" class="voice-secondary" type="button">Add Recordings</button>
            <button id="voice-recording-upload" class="voice-primary" type="button" disabled>Upload and Refine Voice</button>
          </div>
          <div id="voice-recording-selection" class="voice-note"></div>
          <div class="voice-recording-list">
            ${samples.length ? samples.map(sample => `
              <div class="voice-recording-row" data-sample-id="${sample.sampleId}">
                <div>
                  <div class="voice-row-title">${escapeHtml(sample.fileName)}</div>
                  <div class="voice-row-meta">${[sample.durationSecs ? formatVoiceDuration(sample.durationSecs) : '', sample.sizeBytes ? formatBytes(sample.sizeBytes) : ''].filter(Boolean).join(' · ') || 'Training sample'}</div>
                </div>
                <div class="voice-actions">
                  <button class="voice-secondary voice-sample-play" type="button">Play</button>
                  <button class="voice-danger voice-sample-remove" type="button">Remove</button>
                </div>
              </div>
            `).join('') : '<div class="voice-empty">No training recordings were returned by ElevenLabs.</div>'}
          </div>
        </section>

        <section class="voice-card">
          <h3>Pronunciations</h3>
          <p class="voice-card-copy">Teach the narrator how company names, systems and specialist terms should sound.</p>
          <div class="voice-inline-form">
            <div>
              <label class="voice-field-label" for="voice-pronunciation-word">Word or phrase</label>
              <input id="voice-pronunciation-word" class="voice-input" type="text" maxlength="200" placeholder="myhrtoolkit">
            </div>
            <div>
              <label class="voice-field-label" for="voice-pronunciation-alias">Say it like</label>
              <input id="voice-pronunciation-alias" class="voice-input" type="text" maxlength="500" placeholder="my hr tool kit">
            </div>
            <button id="voice-pronunciation-add" class="voice-primary" type="button">Add</button>
          </div>
          <div class="voice-note">These rules apply automatically to newly generated lesson narration and voice previews.</div>
          <div class="voice-pronunciation-list">
            ${rules.length ? rules.map((rule, index) => `
              <div class="voice-pronunciation-row" data-rule-index="${index}">
                <div>
                  <div class="voice-row-title">${escapeHtml(rule.string_to_replace || '')}</div>
                  <div class="voice-row-meta">Say as: ${escapeHtml(pronunciationValue(rule))}${rule.type === 'phoneme' ? ' · Advanced rule' : ''}</div>
                </div>
                <button class="voice-danger voice-pronunciation-remove" type="button">Remove</button>
              </div>
            `).join('') : '<div class="voice-empty">No custom pronunciations yet.</div>'}
          </div>
        </section>

        <section class="voice-card wide">
          <h3>Delivery</h3>
          <p class="voice-card-copy">Keep the controls simple while still giving managers useful influence over how new narration sounds.</p>
          <div class="voice-delivery-grid">
            <div>
              <label class="voice-field-label" for="voice-style-select">Narration style</label>
              <select id="voice-style-select" class="voice-select">
                <option value="natural" ${preset === 'natural' ? 'selected' : ''}>Natural</option>
                <option value="expressive" ${preset === 'expressive' ? 'selected' : ''}>More expressive</option>
                <option value="consistent" ${preset === 'consistent' ? 'selected' : ''}>More consistent</option>
              </select>
            </div>
            <div>
              <label class="voice-field-label" for="voice-speed-select">Speaking speed</label>
              <select id="voice-speed-select" class="voice-select">
                <option value="0.9" ${speed === '0.9' ? 'selected' : ''}>Slightly slower</option>
                <option value="1" ${speed === '1' ? 'selected' : ''}>Normal</option>
                <option value="1.1" ${speed === '1.1' ? 'selected' : ''}>Slightly faster</option>
              </select>
            </div>
          </div>
          <div class="voice-actions" style="margin-top:0.9rem;">
            <button id="voice-delivery-save" class="voice-primary" type="button">Save Delivery</button>
            <span class="voice-note" style="margin:0;">Changes apply to newly generated narration. Existing audio is unchanged.</span>
          </div>
        </section>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function initManagerVoiceWorkspace(root) {
  if (!root) return () => {};
  const tabCourses = root.querySelector('#tab-courses');
  const tabGuides = root.querySelector('#tab-guides');
  const tabTeam = root.querySelector('#tab-team');
  const tabFeedback = root.querySelector('#tab-feedback');
  if (!tabCourses || !tabGuides || !tabTeam || !tabFeedback) return () => {};

  ensureStyles();

  const tabBar = tabCourses.parentElement;
  const dashboard = tabBar?.parentElement;
  if (!tabBar || !dashboard) return () => {};

  const tabVoice = document.createElement('button');
  tabVoice.id = 'tab-voice';
  tabVoice.className = 'btn-ghost';
  tabVoice.style.border = '1px solid var(--glass-border)';
  tabVoice.textContent = 'Voice';
  tabBar.appendChild(tabVoice);

  const viewVoice = document.createElement('div');
  viewVoice.id = 'view-voice';
  viewVoice.style.display = 'none';
  dashboard.appendChild(viewVoice);

  const existingTabs = [tabCourses, tabGuides, tabTeam, tabFeedback];
  const existingViews = ['view-courses', 'view-guides', 'view-team', 'view-feedback']
    .map(id => root.querySelector(`#${id}`))
    .filter(Boolean);

  let loaded = false;
  let currentSummary = null;
  let activePreviewUrl = null;
  let activeSampleUrl = null;
  let destroyed = false;

  const setVoiceActive = active => {
    viewVoice.style.display = active ? 'block' : 'none';
    tabVoice.className = active ? 'btn-primary' : 'btn-ghost';
    tabVoice.style.border = active ? '' : '1px solid var(--glass-border)';
  };

  const load = async ({ force = false } = {}) => {
    if (loaded && !force) return;
    viewVoice.innerHTML = '<div class="voice-card" style="text-align:center;color:var(--text-muted);">Loading voice settings...</div>';
    try {
      currentSummary = await getVoiceSummary();
      if (destroyed) return;
      loaded = true;
      viewVoice.innerHTML = renderSummary(currentSummary);
      bindVoiceEvents();
    } catch (error) {
      console.error('Voice workspace failed to load.', error);
      viewVoice.innerHTML = `<div class="voice-card"><h3>Voice settings could not be loaded</h3><p class="voice-card-copy">${escapeHtml(error?.message || 'Please try again.')}</p><button id="voice-retry-load" class="voice-primary" type="button">Try Again</button></div>`;
      viewVoice.querySelector('#voice-retry-load')?.addEventListener('click', () => load({ force: true }));
    }
  };

  const refresh = async () => {
    loaded = false;
    await load({ force: true });
  };

  const bindVoiceEvents = () => {
    const previewButton = viewVoice.querySelector('#voice-preview-btn');
    const previewText = viewVoice.querySelector('#voice-preview-text');
    const previewStatus = viewVoice.querySelector('#voice-preview-status');
    previewButton?.addEventListener('click', async () => {
      const text = previewText?.value?.trim();
      if (!text) return;
      previewButton.disabled = true;
      previewButton.textContent = 'Generating...';
      if (previewStatus) previewStatus.textContent = '';
      try {
        if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
        activePreviewUrl = await generateVoicePreview(text);
        const audio = new Audio(activePreviewUrl);
        await audio.play();
        if (previewStatus) previewStatus.textContent = 'Playing preview';
      } catch (error) {
        await fswAlert(error?.message || 'Could not generate the voice preview.');
      } finally {
        previewButton.disabled = false;
        previewButton.textContent = 'Play Preview';
      }
    });

    const fileInput = viewVoice.querySelector('#voice-recording-input');
    const chooseButton = viewVoice.querySelector('#voice-recording-choose');
    const uploadButton = viewVoice.querySelector('#voice-recording-upload');
    const selection = viewVoice.querySelector('#voice-recording-selection');
    chooseButton?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      uploadButton.disabled = files.length === 0;
      if (selection) selection.textContent = files.length ? `${files.length} recording${files.length === 1 ? '' : 's'} selected` : '';
    });
    uploadButton?.addEventListener('click', async () => {
      const files = Array.from(fileInput?.files || []);
      if (!files.length) return;
      uploadButton.disabled = true;
      chooseButton.disabled = true;
      uploadButton.textContent = 'Uploading...';
      try {
        const result = await uploadVoiceSamples(files);
        if (result.trainingStarted) {
          await fswAlert('Recordings uploaded successfully. ElevenLabs has started refining the Professional Voice Clone.');
        } else {
          await fswAlert(`Recordings uploaded successfully, but retraining did not start automatically. ${result.trainingError || ''}`.trim());
        }
        await refresh();
      } catch (error) {
        await fswAlert(error?.message || 'Could not upload the voice recordings.');
        uploadButton.disabled = false;
        chooseButton.disabled = false;
        uploadButton.textContent = 'Upload and Refine Voice';
      }
    });

    viewVoice.querySelectorAll('.voice-sample-play').forEach(button => {
      button.addEventListener('click', async () => {
        const sampleId = button.closest('[data-sample-id]')?.dataset.sampleId;
        if (!sampleId) return;
        button.disabled = true;
        button.textContent = 'Loading...';
        try {
          if (activeSampleUrl) URL.revokeObjectURL(activeSampleUrl);
          activeSampleUrl = await getVoiceSampleAudio(sampleId);
          await new Audio(activeSampleUrl).play();
        } catch (error) {
          await fswAlert(error?.message || 'Could not play this recording.');
        } finally {
          button.disabled = false;
          button.textContent = 'Play';
        }
      });
    });

    viewVoice.querySelectorAll('.voice-sample-remove').forEach(button => {
      button.addEventListener('click', async () => {
        const sampleId = button.closest('[data-sample-id]')?.dataset.sampleId;
        if (!sampleId) return;
        if (!await fswConfirm('Remove this recording from the Professional Voice Clone?')) return;
        button.disabled = true;
        try {
          const result = await deleteVoiceSample(sampleId);
          if (!result.trainingStarted && result.trainingError) {
            await fswAlert(`The recording was removed, but retraining did not start automatically. ${result.trainingError}`);
          }
          await refresh();
        } catch (error) {
          await fswAlert(error?.message || 'Could not remove this recording.');
          button.disabled = false;
        }
      });
    });

    const wordInput = viewVoice.querySelector('#voice-pronunciation-word');
    const aliasInput = viewVoice.querySelector('#voice-pronunciation-alias');
    const addPronunciation = viewVoice.querySelector('#voice-pronunciation-add');
    addPronunciation?.addEventListener('click', async () => {
      const word = wordInput?.value?.trim();
      const alias = aliasInput?.value?.trim();
      if (!word || !alias) {
        await fswAlert('Enter both the word or phrase and how it should be said.');
        return;
      }
      addPronunciation.disabled = true;
      try {
        const existing = Array.from(currentSummary?.pronunciations || []);
        const filtered = existing.filter(rule => String(rule.string_to_replace || '').toLowerCase() !== word.toLowerCase());
        filtered.push({ type: 'alias', string_to_replace: word, alias });
        await saveVoicePronunciations(filtered);
        await refresh();
      } catch (error) {
        await fswAlert(error?.message || 'Could not save this pronunciation.');
        addPronunciation.disabled = false;
      }
    });

    viewVoice.querySelectorAll('.voice-pronunciation-remove').forEach(button => {
      button.addEventListener('click', async () => {
        const index = Number(button.closest('[data-rule-index]')?.dataset.ruleIndex);
        if (!Number.isInteger(index)) return;
        if (!await fswConfirm('Remove this pronunciation rule?')) return;
        button.disabled = true;
        try {
          const rules = Array.from(currentSummary?.pronunciations || []).filter((_, ruleIndex) => ruleIndex !== index);
          await saveVoicePronunciations(rules);
          await refresh();
        } catch (error) {
          await fswAlert(error?.message || 'Could not remove this pronunciation.');
          button.disabled = false;
        }
      });
    });

    const deliverySave = viewVoice.querySelector('#voice-delivery-save');
    deliverySave?.addEventListener('click', async () => {
      const preset = viewVoice.querySelector('#voice-style-select')?.value || 'natural';
      const speed = Number(viewVoice.querySelector('#voice-speed-select')?.value || 1);
      deliverySave.disabled = true;
      deliverySave.textContent = 'Saving...';
      try {
        await updateVoiceDelivery({ preset, speed });
        await fswAlert('Voice delivery settings saved. They will be used for newly generated narration.');
        await refresh();
      } catch (error) {
        await fswAlert(error?.message || 'Could not save the voice delivery settings.');
        deliverySave.disabled = false;
        deliverySave.textContent = 'Save Delivery';
      }
    });
  };

  const onVoiceClick = async () => {
    existingViews.forEach(view => { view.style.display = 'none'; });
    existingTabs.forEach(tab => {
      tab.classList.remove('btn-primary');
      tab.classList.add('btn-ghost');
    });
    setVoiceActive(true);
    await load();
  };

  const onExistingTabClick = () => setVoiceActive(false);
  tabVoice.addEventListener('click', onVoiceClick);
  existingTabs.forEach(tab => tab.addEventListener('click', onExistingTabClick));

  return () => {
    destroyed = true;
    tabVoice.removeEventListener('click', onVoiceClick);
    existingTabs.forEach(tab => tab.removeEventListener('click', onExistingTabClick));
    if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
    if (activeSampleUrl) URL.revokeObjectURL(activeSampleUrl);
    tabVoice.remove();
    viewVoice.remove();
  };
}
