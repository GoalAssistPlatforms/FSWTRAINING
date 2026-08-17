import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { PostgresWorkerRepository } from './workerRepository';
import { SafeWorkerLogger } from './workerLogger';
import { runTranscriptionWorkerTick } from './transcriptionWorker';
import {
  FfmpegAudioExtractor,
  OpenAIChunkedTranscriptionProvider,
  SupabaseSourceAssetLoader,
  WhisperTranscriptNormaliser
} from './runtimeAdapters';

const readPositiveInteger = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

const requireEnvironment = (name: string) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const delay = async (milliseconds: number) => {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
};

export const runWorkerProcess = async () => {
  const supabaseUrl = requireEnvironment('SUPABASE_URL');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const openaiApiKey = requireEnvironment('OPENAI_API_KEY');
  const port = readPositiveInteger('PORT', 8080);
  const pollMilliseconds = readPositiveInteger('TRANSCRIPTION_WORKER_POLL_MS', 3000);
  const leaseDurationSeconds = readPositiveInteger('TRANSCRIPTION_WORKER_LEASE_SECONDS', 180);
  const maximumSourceBytes = readPositiveInteger('TRANSCRIPTION_WORKER_MAX_SOURCE_BYTES', 5 * 1024 * 1024 * 1024);

  if (leaseDurationSeconds < 15 || leaseDurationSeconds > 300) {
    throw new Error('TRANSCRIPTION_WORKER_LEASE_SECONDS must be between 15 and 300.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
  const logger = new SafeWorkerLogger();
  const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
  const health = {
    startedAt: new Date().toISOString(),
    lastTickAt: null as string | null,
    lastResult: 'starting',
    stopping: false
  };

  const server = createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    response.writeHead(health.stopping ? 503 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: health.stopping ? 'stopping' : 'ok', ...health }));
  });

  let stopping = false;
  const stop = () => {
    stopping = true;
    health.stopping = true;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve());
  });

  logger.info('Transcription worker started.');
  const dependencies = {
    repo: new PostgresWorkerRepository(supabase),
    loader: new SupabaseSourceAssetLoader(supabase, supabaseUrl, fetch, maximumSourceBytes),
    extractor: new FfmpegAudioExtractor(),
    provider: new OpenAIChunkedTranscriptionProvider(new OpenAI({ apiKey: openaiApiKey })),
    normaliser: new WhisperTranscriptNormaliser(),
    clock: {
      now: () => Date.now(),
      setTimeout: (callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds),
      clearTimeout: (id: any) => clearTimeout(id)
    },
    logger,
    workerId,
    leaseDurationSeconds
  };

  try {
    while (!stopping) {
      const result = await runTranscriptionWorkerTick(dependencies);
      health.lastTickAt = new Date().toISOString();
      health.lastResult = result.type;
      if (result.type === 'NO_JOBS') {
        await delay(pollMilliseconds);
      }
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    logger.info('Transcription worker stopped.');
  }
};
