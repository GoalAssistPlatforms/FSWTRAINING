const REMOVABLE_NOTE_TEXT = [
  'These rules apply automatically to newly generated lesson narration and voice previews.',
  'Changes apply to newly generated narration. Existing audio is unchanged.'
];

function cleanText(value = '') {
  return String(value)
    .replace(/Recordings uploaded successfully\. ElevenLabs has started refining the Professional Voice Clone\./gi, 'Recordings uploaded. Voice refinement has started.')
    .replace(/No training recordings were returned by ElevenLabs\./gi, 'No training recordings.')
    .replace(/Professional Voice Clone/gi, 'voice')
    .replace(/ElevenLabs/gi, 'voice service');
}

function cleanTextNode(node) {
  if (!node?.nodeValue) return;
  const next = cleanText(node.nodeValue);
  if (next !== node.nodeValue) node.nodeValue = next;
}

function scrubProviderReferences(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    cleanTextNode(root);
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    cleanTextNode(node);
    node = walker.nextNode();
  }
}

function simplifyVoiceView(view) {
  if (!view) return;

  view.querySelector('.voice-workspace-header p')?.remove();
  view.querySelectorAll('.voice-card-copy').forEach(element => element.remove());

  view.querySelectorAll('.voice-note').forEach(note => {
    if (note.id === 'voice-preview-status' || note.id === 'voice-recording-selection') return;
    const text = note.textContent.trim();
    if (REMOVABLE_NOTE_TEXT.includes(text) || /recommends roughly|high quality|consistent material/i.test(text)) {
      note.remove();
    }
  });

  const recordingsHeading = Array.from(view.querySelectorAll('.voice-card h3'))
    .find(element => element.textContent.trim() === 'Training Recordings');
  if (recordingsHeading) recordingsHeading.textContent = 'Recordings';

  const previewLabel = view.querySelector('label[for="voice-preview-text"]');
  if (previewLabel) previewLabel.textContent = 'Preview';

  const uploadButton = view.querySelector('#voice-recording-upload');
  if (uploadButton && uploadButton.textContent.trim() === 'Upload and Refine Voice') {
    uploadButton.textContent = 'Upload';
  }

  const saveButton = view.querySelector('#voice-delivery-save');
  if (saveButton && saveButton.textContent.trim() === 'Save Delivery') {
    saveButton.textContent = 'Save';
  }

  view.querySelectorAll('.voice-status-pill').forEach(pill => {
    if (/professional voice|voice connected/i.test(pill.textContent)) {
      pill.innerHTML = '<span>●</span>Ready';
    }
  });

  view.querySelectorAll('.voice-empty').forEach(empty => {
    if (/no training recordings/i.test(empty.textContent)) empty.textContent = 'No recordings yet.';
  });

  scrubProviderReferences(view);
}

export function initManagerVoiceCopyCleanup(root = document.body) {
  if (!root || typeof MutationObserver === 'undefined') return () => {};

  let queued = false;
  let destroyed = false;

  const run = () => {
    if (destroyed) return;
    simplifyVoiceView(root.querySelector?.('#view-voice'));
    scrubProviderReferences(root);
  };

  const schedule = () => {
    if (queued || destroyed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      run();
    });
  };

  run();
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  return () => {
    destroyed = true;
    observer.disconnect();
  };
}
