const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';
export const FSW_PRONUNCIATION_DICTIONARY_NAME = 'FSW Training Pronunciations';

const DEFAULT_PRONUNCIATION_RULES = Object.freeze([
  {
    type: 'alias',
    string_to_replace: 'myhrtoolkit',
    alias: 'my hr tool kit'
  }
]);

export function getFswVoiceConfiguration() {
  const defaultApiKey = process.env.ELEVENLABS_API_KEY;
  const defaultVoiceId = process.env.ELEVENLABS_VOICE_ID;
  const fswApiKey = process.env.ELEVENLABS_API_KEY_FSW || process.env.ELVENLABS_API_KEY_FSW;
  const fswVoiceId = process.env.ELEVENLABS_VOICE_ID_FSW;

  const apiKey = fswApiKey || defaultApiKey;
  const voiceId = fswVoiceId || defaultVoiceId;

  if (!apiKey) throw new Error('Missing ElevenLabs API key for the FSW voice.');
  if (!voiceId) throw new Error('Missing ElevenLabs voice ID for the FSW voice.');

  return { apiKey, voiceId };
}

async function elevenLabsRequest(path, { apiKey, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${ELEVENLABS_BASE_URL}${path}`, {
    method,
    headers: {
      'xi-api-key': apiKey,
      ...headers
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`ElevenLabs request failed with ${response.status}: ${errorText || response.statusText}`);
    error.statusCode = response.status;
    throw error;
  }

  return response;
}

async function elevenLabsJson(path, options) {
  const response = await elevenLabsRequest(path, options);
  return response.json();
}

export async function getFswVoiceDetails() {
  const { apiKey, voiceId } = getFswVoiceConfiguration();
  return elevenLabsJson(`/v1/voices/${encodeURIComponent(voiceId)}`, { apiKey });
}

export async function getFswVoiceSettings() {
  const { apiKey, voiceId } = getFswVoiceConfiguration();
  return elevenLabsJson(`/v1/voices/${encodeURIComponent(voiceId)}/settings`, { apiKey });
}

export async function updateFswVoiceSettings({ preset = 'natural', speed = 1 } = {}) {
  const { apiKey, voiceId } = getFswVoiceConfiguration();
  const normalisedSpeed = Math.max(0.7, Math.min(1.2, Number(speed) || 1));

  const presets = {
    natural: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true
    },
    expressive: {
      stability: 0.35,
      similarity_boost: 0.75,
      style: 0.2,
      use_speaker_boost: true
    },
    consistent: {
      stability: 0.72,
      similarity_boost: 0.82,
      style: 0,
      use_speaker_boost: true
    }
  };

  const selected = presets[preset] || presets.natural;
  await elevenLabsJson(`/v1/voices/${encodeURIComponent(voiceId)}/settings/edit`, {
    apiKey,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...selected, speed: normalisedSpeed })
  });

  return getFswVoiceSettings();
}

async function listPronunciationDictionaries(apiKey) {
  const all = [];
  let cursor = null;

  do {
    const query = new URLSearchParams({ page_size: '100', include_archived: 'false' });
    if (cursor) query.set('cursor', cursor);
    const page = await elevenLabsJson(`/v1/pronunciation-dictionaries?${query.toString()}`, { apiKey });
    all.push(...(page.pronunciation_dictionaries || []));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  return all;
}

async function createDefaultPronunciationDictionary(apiKey) {
  return elevenLabsJson('/v1/pronunciation-dictionaries/add-from-rules', {
    apiKey,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: FSW_PRONUNCIATION_DICTIONARY_NAME,
      description: 'Pronunciations used by the FSW training narrator.',
      rules: DEFAULT_PRONUNCIATION_RULES
    })
  });
}

export async function getFswPronunciationDictionary({ createIfMissing = true } = {}) {
  const { apiKey } = getFswVoiceConfiguration();
  const dictionaries = await listPronunciationDictionaries(apiKey);
  let dictionary = dictionaries.find(item => item.name === FSW_PRONUNCIATION_DICTIONARY_NAME);

  if (!dictionary && createIfMissing) {
    dictionary = await createDefaultPronunciationDictionary(apiKey);
  }

  if (!dictionary) return null;

  const dictionaryId = dictionary.id;
  return elevenLabsJson(`/v1/pronunciation-dictionaries/${encodeURIComponent(dictionaryId)}`, { apiKey });
}

export async function getFswPronunciationLocator() {
  const dictionary = await getFswPronunciationDictionary({ createIfMissing: true });
  if (!dictionary?.id || !dictionary?.latest_version_id) return null;
  return {
    pronunciation_dictionary_id: dictionary.id,
    version_id: dictionary.latest_version_id
  };
}

export async function setFswPronunciationRules(rules = []) {
  const { apiKey } = getFswVoiceConfiguration();
  const dictionary = await getFswPronunciationDictionary({ createIfMissing: true });
  if (!dictionary?.id) throw new Error('Could not resolve the FSW pronunciation dictionary.');

  const cleanedRules = (Array.isArray(rules) ? rules : [])
    .map(rule => {
      if (rule?.type === 'phoneme' && rule.string_to_replace && rule.phoneme && rule.alphabet) {
        return {
          type: 'phoneme',
          string_to_replace: String(rule.string_to_replace).trim().slice(0, 200),
          phoneme: String(rule.phoneme).trim().slice(0, 500),
          alphabet: String(rule.alphabet).trim().slice(0, 20)
        };
      }
      const phrase = String(rule?.string_to_replace || '').trim().slice(0, 200);
      const alias = String(rule?.alias || '').trim().slice(0, 500);
      if (!phrase || !alias) return null;
      return { type: 'alias', string_to_replace: phrase, alias };
    })
    .filter(Boolean)
    .slice(0, 200);

  await elevenLabsJson(`/v1/pronunciation-dictionaries/${encodeURIComponent(dictionary.id)}/set-rules`, {
    apiKey,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: cleanedRules })
  });

  return getFswPronunciationDictionary({ createIfMissing: false });
}

export async function generateFswPreview(text) {
  const { apiKey, voiceId } = getFswVoiceConfiguration();
  const locator = await getFswPronunciationLocator().catch(error => {
    console.warn('Voice preview will continue without pronunciation dictionary.', error);
    return null;
  });

  const payload = {
    text: String(text || '').trim().slice(0, 2000),
    model_id: 'eleven_turbo_v2_5'
  };
  if (locator) payload.pronunciation_dictionary_locators = [locator];

  const response = await elevenLabsRequest(`/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    apiKey,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return Buffer.from(await response.arrayBuffer());
}

export async function uploadFswPvcSamples(files = []) {
  const { apiKey, voiceId } = getFswVoiceConfiguration();
  if (!files.length) throw new Error('Select at least one voice recording.');

  const form = new FormData();
  files.forEach(file => {
    const blob = new Blob([file.buffer], { type: file.type || 'audio/mpeg' });
    form.append('files[]', blob, file.name || 'voice-recording.mp3');
  });

  return elevenLabsJson(`/v1/voices/pvc/${encodeURIComponent(voiceId)}/samples`, {
    apiKey,
    method: 'POST',
    body: form
  });
}

export async function deleteFswPvcSample(sampleId) {
  const { apiKey, voiceId } = getFswVoiceConfiguration();
  return elevenLabsJson(`/v1/voices/pvc/${encodeURIComponent(voiceId)}/samples/${encodeURIComponent(sampleId)}`, {
    apiKey,
    method: 'DELETE'
  });
}

export async function getFswPvcSampleAudio(sampleId) {
  const { apiKey, voiceId } = getFswVoiceConfiguration();
  const result = await elevenLabsJson(`/v1/voices/pvc/${encodeURIComponent(voiceId)}/samples/${encodeURIComponent(sampleId)}/audio`, {
    apiKey
  });
  return {
    buffer: Buffer.from(result.audio_base_64 || '', 'base64'),
    mediaType: result.media_type || 'audio/mpeg',
    durationSecs: result.duration_secs || null
  };
}

export async function trainFswPvcVoice() {
  const { apiKey, voiceId } = getFswVoiceConfiguration();
  return elevenLabsJson(`/v1/voices/pvc/${encodeURIComponent(voiceId)}/train`, {
    apiKey,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
}

export async function buildFswVoiceSummary() {
  const [voice, settings, dictionary] = await Promise.all([
    getFswVoiceDetails(),
    getFswVoiceSettings(),
    getFswPronunciationDictionary({ createIfMissing: true })
  ]);

  const samples = Array.isArray(voice.samples) ? voice.samples : [];
  const totalDurationSecs = samples.reduce((total, sample) => total + (Number(sample.duration_secs) || 0), 0);

  return {
    voice: {
      voiceId: voice.voice_id,
      name: voice.name || 'FSW Narrator',
      category: voice.category || null,
      previewUrl: voice.preview_url || null,
      fineTuning: voice.fine_tuning || null
    },
    samples: samples.map(sample => ({
      sampleId: sample.sample_id,
      fileName: sample.file_name || 'Voice recording',
      mimeType: sample.mime_type || null,
      sizeBytes: Number(sample.size_bytes) || null,
      durationSecs: Number(sample.duration_secs) || null
    })),
    totalDurationSecs,
    settings,
    pronunciations: (dictionary?.rules || []).map(rule => ({ ...rule })),
    pronunciationDictionaryId: dictionary?.id || null,
    pronunciationDictionaryVersionId: dictionary?.latest_version_id || null
  };
}
