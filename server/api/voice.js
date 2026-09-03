import { createError, defineEventHandler, getQuery, readBody } from 'nitro/h3';
import { requireVoiceManager } from '../voiceManagement/auth.js';
import {
  buildFswVoiceSummary,
  deleteFswPvcSample,
  generateFswPreview,
  getFswPvcSampleAudio,
  setFswPronunciationRules,
  trainFswPvcVoice,
  updateFswVoiceSettings,
  uploadFswPvcSamples
} from '../voiceManagement/elevenLabs.js';

function normaliseError(error) {
  if (error?.statusCode) return error;
  return createError({
    statusCode: 502,
    statusMessage: 'Voice management request failed.',
    data: { message: String(error?.message || error || 'Unknown voice management error') }
  });
}

async function uploadStoredSamples(service, userId, uploads = []) {
  const safeUploads = (Array.isArray(uploads) ? uploads : [])
    .filter(upload => upload?.path && upload?.name)
    .slice(0, 20);
  if (!safeUploads.length) throw new Error('Select at least one voice recording.');

  const allowedPrefix = `voice-training/${userId}/`;
  safeUploads.forEach(upload => {
    if (!String(upload.path).startsWith(allowedPrefix)) {
      throw createError({ statusCode: 403, statusMessage: 'Invalid voice recording path.' });
    }
  });

  const files = [];
  try {
    for (const upload of safeUploads) {
      const { data, error } = await service.storage.from('course_assets').download(upload.path);
      if (error) throw error;
      files.push({
        name: String(upload.name).slice(0, 240),
        type: String(upload.type || data.type || 'audio/mpeg').slice(0, 120),
        buffer: Buffer.from(await data.arrayBuffer())
      });
    }

    const samples = await uploadFswPvcSamples(files);
    let trainingStarted = false;
    let trainingError = null;
    try {
      await trainFswPvcVoice();
      trainingStarted = true;
    } catch (error) {
      trainingError = String(error?.message || error || 'Training could not be started.');
      console.warn('Voice samples uploaded, but retraining could not be started automatically.', error);
    }

    return { samples, trainingStarted, trainingError };
  } finally {
    const paths = safeUploads.map(upload => upload.path);
    if (paths.length) {
      const { error } = await service.storage.from('course_assets').remove(paths);
      if (error) console.warn('Could not remove temporary voice training uploads.', error);
    }
  }
}

export default defineEventHandler(async event => {
  const { user, service } = await requireVoiceManager(event);
  const query = getQuery(event);
  const action = String(query.action || 'summary');
  const method = String(event.req.method || 'GET').toUpperCase();

  try {
    if (method === 'GET' && action === 'summary') {
      return buildFswVoiceSummary();
    }

    if (method === 'GET' && action === 'sampleAudio') {
      const sampleId = String(query.sampleId || '');
      if (!sampleId) throw createError({ statusCode: 400, statusMessage: 'Sample ID is required.' });
      const audio = await getFswPvcSampleAudio(sampleId);
      if (!audio.buffer.length) throw new Error('ElevenLabs returned empty sample audio.');
      return new Response(audio.buffer, {
        status: 200,
        headers: {
          'Content-Type': audio.mediaType,
          'Cache-Control': 'no-store'
        }
      });
    }

    if (method === 'POST' && action === 'preview') {
      const body = await readBody(event);
      const text = String(body?.text || '').trim();
      if (text.length < 2) throw createError({ statusCode: 400, statusMessage: 'Enter some text to preview.' });
      const audio = await generateFswPreview(text);
      return new Response(audio, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-store'
        }
      });
    }

    if (method === 'POST' && action === 'settings') {
      const body = await readBody(event);
      const settings = await updateFswVoiceSettings({
        preset: body?.preset,
        speed: body?.speed
      });
      return { settings };
    }

    if (method === 'POST' && action === 'pronunciations') {
      const body = await readBody(event);
      const dictionary = await setFswPronunciationRules(body?.rules || []);
      return {
        pronunciations: dictionary?.rules || [],
        pronunciationDictionaryId: dictionary?.id || null,
        pronunciationDictionaryVersionId: dictionary?.latest_version_id || null
      };
    }

    if (method === 'POST' && action === 'samples') {
      const body = await readBody(event);
      return uploadStoredSamples(service, user.id, body?.uploads || []);
    }

    if (method === 'POST' && action === 'train') {
      const result = await trainFswPvcVoice();
      return { trainingStarted: true, result };
    }

    if (method === 'DELETE' && action === 'sample') {
      const sampleId = String(query.sampleId || '');
      if (!sampleId) throw createError({ statusCode: 400, statusMessage: 'Sample ID is required.' });
      await deleteFswPvcSample(sampleId);

      let trainingStarted = false;
      let trainingError = null;
      try {
        await trainFswPvcVoice();
        trainingStarted = true;
      } catch (error) {
        trainingError = String(error?.message || error || 'Training could not be started.');
      }
      return { status: 'ok', trainingStarted, trainingError };
    }

    throw createError({ statusCode: 404, statusMessage: 'Voice management action not found.' });
  } catch (error) {
    console.error(`Voice management ${method} ${action} failed.`, error);
    throw normaliseError(error);
  }
});
