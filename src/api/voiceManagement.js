import { supabase } from './supabase.js';

async function authHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  return {
    Authorization: `Bearer ${session.access_token}`,
    ...extra
  };
}

async function readError(response) {
  try {
    const body = await response.json();
    return body?.data?.message || body?.statusMessage || body?.message || body?.error || `Request failed with ${response.status}`;
  } catch {
    return (await response.text()) || `Request failed with ${response.status}`;
  }
}

async function jsonRequest(url, options = {}) {
  const headers = await authHeaders({ 'Content-Type': 'application/json', ...(options.headers || {}) });
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getVoiceSummary() {
  const headers = await authHeaders();
  const response = await fetch('/api/voice?action=summary', { headers });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function generateVoicePreview(text) {
  const headers = await authHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch('/api/voice?action=preview', {
    method: 'POST',
    headers,
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error(await readError(response));
  const blob = await response.blob();
  if (!blob.size) throw new Error('The voice preview returned no audio.');
  return URL.createObjectURL(blob);
}

export async function updateVoiceDelivery({ preset, speed }) {
  return jsonRequest('/api/voice?action=settings', {
    method: 'POST',
    body: JSON.stringify({ preset, speed })
  });
}

export async function saveVoicePronunciations(rules) {
  return jsonRequest('/api/voice?action=pronunciations', {
    method: 'POST',
    body: JSON.stringify({ rules })
  });
}

function safeFileName(name) {
  return String(name || 'voice-recording')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 180);
}

export async function uploadVoiceSamples(files) {
  const selected = Array.from(files || []).filter(file => file?.size > 0);
  if (!selected.length) throw new Error('Select at least one recording.');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error('Your session has expired. Please sign in again.');

  const uploads = [];
  try {
    for (const file of selected) {
      const path = `voice-training/${user.id}/${Date.now()}_${crypto.randomUUID()}_${safeFileName(file.name)}`;
      const { error } = await supabase.storage
        .from('course_assets')
        .upload(path, file, {
          contentType: file.type || 'audio/mpeg',
          upsert: false
        });
      if (error) throw error;
      uploads.push({
        path,
        name: file.name || 'Voice recording',
        type: file.type || 'audio/mpeg'
      });
    }

    return await jsonRequest('/api/voice?action=samples', {
      method: 'POST',
      body: JSON.stringify({ uploads })
    });
  } catch (error) {
    if (uploads.length) {
      await supabase.storage.from('course_assets').remove(uploads.map(upload => upload.path)).catch(() => undefined);
    }
    throw error;
  }
}

export async function deleteVoiceSample(sampleId) {
  const headers = await authHeaders();
  const response = await fetch(`/api/voice?action=sample&sampleId=${encodeURIComponent(sampleId)}`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getVoiceSampleAudio(sampleId) {
  const headers = await authHeaders();
  const response = await fetch(`/api/voice?action=sampleAudio&sampleId=${encodeURIComponent(sampleId)}`, { headers });
  if (!response.ok) throw new Error(await readError(response));
  const blob = await response.blob();
  if (!blob.size) throw new Error('The recording preview returned no audio.');
  return URL.createObjectURL(blob);
}

export async function retrainVoice() {
  return jsonRequest('/api/voice?action=train', {
    method: 'POST',
    body: JSON.stringify({})
  });
}
