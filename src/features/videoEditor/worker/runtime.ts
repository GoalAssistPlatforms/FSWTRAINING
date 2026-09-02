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
  OpenRouterChunkedTranscriptionProvider,
  SupabaseSourceAssetLoader,
  WhisperTranscriptNormaliser
} from './runtimeAdapters';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_APP_URL = 'https://fswtraining.vercel.app';
const MAXIMUM_ERROR_BACKOFF_MS = 60000;

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

// Sleeps for the given time, but returns immediately once the worker is asked to stop so
// a shutdown never has to wait out a poll interval or an error backoff.
const delay = async (milliseconds: number, stopSignal: AbortSignal) => {
  if (stopSignal.aborted) return;
  await new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer);
      stopSignal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    stopSignal.addEventListener('abort', finish, { once: true });
  });
};

export const runWorkerProcess = async () => {
  const supabaseUrl = requireEnvironment('SUPABASE_URL');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const openrouterApiKey = requireEnvironment('OPENROUTER_API_KEY');
  const appUrl = String(process.env.TRANSCRIPTION_WORKER_APP_URL || DEFAULT_APP_URL).trim();
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

  // All AI traffic goes through OpenRouter, matching the web API handlers.
  const openrouter = new OpenAI({
    apiKey: openrouterApiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      'HTTP-Referer': appUrl,
      'X-Title': 'FSW Training Platform'
    }
  });

  const logger = new SafeWorkerLogger();
  const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
  const health = {
    startedAt: new Date().toISOString(),
    lastTickAt: null as string | null,
    lastResult: 'starting',
    consecutiveErrors: 0,
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

  const stopController = new AbortController();
  const stop = (signal: string) => {
    if (stopController.signal.aborted) return;
    logger.info(`Received ${signal}, finishing the current job before stopping.`);
    health.stopping = true;
    stopController.abort();
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve());
  });

  logger.info('Transcription worker started.');
  const dependencies = {
    repo: new PostgresWorkerRepository(supabase),
    loader: new SupabaseSourceAssetLoader(supabase, supabaseUrl, fetch, maximumSourceBytes),
    extractor: new FfmpegAudioExtractor(),
    provider: new OpenRouterChunkedTranscriptionProvider(openrouter),
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
    while (!stopController.signal.aborted) {
      try {
        const result = await runTranscriptionWorkerTick(dependencies);
        health.lastTickAt = new Date().toISOString();
        health.lastResult = result.type;
        health.consecutiveErrors = 0;
        if (result.type === 'NO_JOBS') {
          await delay(pollMilliseconds, stopController.signal);
        }
      } catch (error: any) {
        // A tick already records job level failures itself. Anything reaching here is a bug or
        // an infrastructure outage, so log it and back off rather than letting the process die.
        health.lastTickAt = new Date().toISOString();
        health.lastResult = 'unexpected_error';
        health.consecutiveErrors += 1;
        logger.error('Worker tick failed unexpectedly.', {
          name: error?.name || 'Error',
          message: error?.message || 'Unknown error',
          consecutiveErrors: health.consecutiveErrors
        });
        const backoff = Math.min(pollMilliseconds * 2 ** health.consecutiveErrors, MAXIMUM_ERROR_BACKOFF_MS);
        await delay(backoff, stopController.signal);
      }
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    logger.info('Transcription worker stopped.');
  }
};
