import { generateChatAudio } from './api/elevenlabs.js';

const DEFAULT_STATUS = 'Connected';

export const speechRecognitionErrorMessage = error => {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow microphone access in your browser and try again.';
    case 'audio-capture':
      return 'No microphone was found. Check your microphone and try again.';
    case 'no-speech':
      return 'I did not hear anything. Tap the microphone and try again.';
    case 'network':
      return 'Speech recognition could not connect. Check your connection and try again.';
    default:
      return 'I could not hear that clearly. Tap the microphone and try again.';
  }
};

export const extractInitialCallerMessage = root => {
  const firstMessage = root?.querySelector?.('#chat-messages > div');
  if (!firstMessage) return '';

  const bubble = firstMessage.children?.[1];
  return bubble?.textContent?.replace('Simulator Goal Achieved', '').trim() || '';
};

const setButtonRecordingState = (button, recording) => {
  if (!button) return;

  button.style.color = recording ? '#ef4444' : '#cbd5e1';
  button.style.borderColor = recording ? '#ef4444' : 'rgba(255,255,255,0.1)';
  button.style.background = recording ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)';
  button.style.animation = recording ? 'pulse-recording 1.5s infinite' : 'none';
};

const playCallerAudio = async (root, text) => {
  if (!text) return;

  const status = root.querySelector('#voice-status-text');
  const ripple = root.querySelector('#ai-speaking-ripple');
  const microphone = root.querySelector('#big-dictate-btn');

  if (status) status.textContent = 'Caller is speaking…';
  if (ripple) ripple.style.display = 'block';
  if (microphone) microphone.disabled = true;

  let audioUrl = null;
  try {
    audioUrl = await generateChatAudio(text);
    if (!audioUrl) throw new Error('No audio returned');

    await new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      audio.onended = resolve;
      audio.onerror = reject;
      audio.play().catch(reject);
    });

    if (status) status.textContent = DEFAULT_STATUS;
  } catch (error) {
    console.error('Initial caller audio failed:', error);
    if (status) status.textContent = 'Voice playback unavailable. You can still speak.';
  } finally {
    if (ripple) ripple.style.display = 'none';
    if (microphone) microphone.disabled = false;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }
};

const bindMicrophone = root => {
  const button = root.querySelector('#big-dictate-btn');
  if (!button || button.dataset.voiceTurnBound === 'true') return;
  button.dataset.voiceTurnBound = 'true';

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const status = root.querySelector('#voice-status-text');

  if (!Recognition) {
    button.style.display = 'none';
    if (status) status.textContent = 'Voice input is not supported in this browser. Switch to Text Chat.';
    return;
  }

  let activeRecognition = null;
  let isRecording = false;

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (button.disabled) return;

    if (isRecording && activeRecognition) {
      activeRecognition.stop();
      return;
    }

    const input = root.querySelector('#chat-input');
    const sendButton = root.querySelector('#send-btn');
    if (!input || !sendButton || sendButton.disabled) return;

    const recognition = new Recognition();
    activeRecognition = recognition;
    recognition.lang = 'en-GB';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let transcript = '';
    let recognitionFailed = false;

    recognition.onstart = () => {
      isRecording = true;
      setButtonRecordingState(button, true);
      if (status) status.textContent = 'Listening…';
    };

    recognition.onresult = event => {
      transcript = Array.from(event.results || [])
        .filter(result => result.isFinal !== false)
        .map(result => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
    };

    recognition.onerror = event => {
      recognitionFailed = true;
      console.error('Speech Recognition Error', event.error);
      if (status) status.textContent = speechRecognitionErrorMessage(event.error);
    };

    recognition.onend = () => {
      isRecording = false;
      activeRecognition = null;
      setButtonRecordingState(button, false);

      if (transcript) {
        input.value = transcript;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        if (status) status.textContent = 'Sending…';
        sendButton.click();
      } else if (!recognitionFailed && status) {
        status.textContent = speechRecognitionErrorMessage('no-speech');
      }
    };

    try {
      recognition.start();
    } catch (error) {
      isRecording = false;
      activeRecognition = null;
      setButtonRecordingState(button, false);
      console.error('Speech Recognition start failed:', error);
      if (status) status.textContent = 'Microphone could not start. Check permission and try again.';
    }
  }, true);
};

const initialiseVoiceCall = root => {
  const voiceUi = root.querySelector('#voice-call-ui');
  if (!voiceUi) return;

  bindMicrophone(root);

  const shell = voiceUi.closest('[data-mode]');
  const startedAsVoiceCall = shell?.dataset?.mode === 'call';
  if (!startedAsVoiceCall || shell.dataset.initialCallerAudioStarted === 'true') return;

  shell.dataset.initialCallerAudioStarted = 'true';
  requestAnimationFrame(() => {
    const openingMessage = extractInitialCallerMessage(root);
    playCallerAudio(root, openingMessage);
  });
};

export const initPhoneCallVoiceEnhancement = root => {
  if (!root) return () => {};

  let queued = false;
  let destroyed = false;

  const sync = () => {
    if (destroyed) return;
    initialiseVoiceCall(root);
  };

  sync();

  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  });

  observer.observe(root, {
    childList: true,
    subtree: true
  });

  return () => {
    destroyed = true;
    observer.disconnect();
  };
};
