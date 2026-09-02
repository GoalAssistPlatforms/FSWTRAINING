import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { normaliseWhisperResponse } from '../domain/transcriptionNormalisation';
import { WorkerError, WorkerErrorCodes } from './workerErrors';
import type {
  AudioExtractor,
  SourceAssetLoader,
  TranscriptNormaliser,
  TranscriptionProvider
} from './workerTypes';

const SOURCE_TEMP_PREFIX = 'altius-transcription-source-';
const AUDIO_TEMP_PREFIX = 'altius-transcription-audio-';
const DEFAULT_MAX_SOURCE_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_MAX_PROVIDER_BYTES = 24 * 1024 * 1024;
const DEFAULT_CHUNK_SECONDS = 15 * 60;

type FetchLike = typeof fetch;

type ProcessResult = {
  stdout: string;
  stderr: string;
};

type ProcessRunner = (
  command: string,
  args: string[],
  abortSignal: AbortSignal
) => Promise<ProcessResult>;

export type AudioChunkManifest = {
  schemaVersion: 1;
  duration: number;
  chunks: Array<{
    path: string;
    startTime: number;
    duration: number;
  }>;
};

const isAbortError = (error: any) =>
  error?.name === 'AbortError' || error?.code === 'ABORT_ERR';

const safeRemoveTempWorkspace = async (path: string, prefix: string) => {
  const workspace = dirname(path);
  const requiredPrefix = join(tmpdir(), prefix);
  if (!workspace.startsWith(requiredPrefix)) {
    throw new Error('Refusing to remove a path outside the transcription workspace.');
  }
  await rm(workspace, { recursive: true, force: true });
};

export const runProcess: ProcessRunner = async (command, args, abortSignal) => {
  if (abortSignal.aborted) {
    const error = new Error('Media processing was aborted.');
    error.name = 'AbortError';
    throw error;
  }

  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';

    const appendBounded = (current: string, chunk: Buffer) =>
      `${current}${chunk.toString('utf8')}`.slice(-65536);

    child.stdout.on('data', chunk => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on('data', chunk => {
      stderr = appendBounded(stderr, chunk);
    });

    const onAbort = () => {
      child.kill('SIGTERM');
      const error = new Error('Media processing was aborted.');
      error.name = 'AbortError';
      reject(error);
    };
    abortSignal.addEventListener('abort', onAbort, { once: true });

    child.once('error', error => {
      abortSignal.removeEventListener('abort', onAbort);
      reject(error);
    });
    child.once('close', code => {
      abortSignal.removeEventListener('abort', onAbort);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}. ${stderr}`));
      }
    });
  });
};

class ByteLimitTransform extends Transform {
  private bytesRead = 0;

  constructor(private readonly maximumBytes: number) {
    super();
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
    this.bytesRead += chunk.length;
    if (this.bytesRead > this.maximumBytes) {
      callback(new WorkerError(WorkerErrorCodes.AUDIO_TOO_LARGE, 'The source video exceeds the configured worker limit.'));
      return;
    }
    callback(null, chunk);
  }
}

export class SupabaseSourceAssetLoader implements SourceAssetLoader {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly supabaseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly maximumSourceBytes = DEFAULT_MAX_SOURCE_BYTES
  ) {}

  async downloadAsset(assetId: string, abortSignal: AbortSignal): Promise<{ localPath: string; duration: number }> {
    try {
      const { data: asset, error } = await this.supabase
        .from('video_source_assets')
        .select('original_storage_path, duration_seconds, file_size_bytes')
        .eq('id', assetId)
        .maybeSingle();

      if (error) {
        throw new WorkerError(WorkerErrorCodes.SOURCE_DOWNLOAD_FAILED, 'The source asset lookup failed.');
      }
      if (!asset) {
        throw new WorkerError(WorkerErrorCodes.SOURCE_NOT_FOUND, 'The source asset was not found.');
      }

      const duration = Number(asset.duration_seconds);
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new WorkerError(WorkerErrorCodes.SOURCE_NOT_READY, 'The source duration is not available.');
      }

      const declaredSize = Number(asset.file_size_bytes || 0);
      if (Number.isFinite(declaredSize) && declaredSize > this.maximumSourceBytes) {
        throw new WorkerError(WorkerErrorCodes.AUDIO_TOO_LARGE, 'The source video exceeds the configured worker limit.');
      }

      const sourcePath = String(asset.original_storage_path || '').trim();
      if (!sourcePath) {
        throw new WorkerError(WorkerErrorCodes.SOURCE_NOT_FOUND, 'The source video location is missing.');
      }

      let downloadUrl = sourcePath;
      if (/^https:\/\//i.test(sourcePath)) {
        const allowedOrigin = new URL(this.supabaseUrl).origin;
        if (new URL(sourcePath).origin !== allowedOrigin) {
          throw new WorkerError(WorkerErrorCodes.SOURCE_NOT_FOUND, 'The source video location is not trusted.');
        }
      } else {
        const { data: signed, error: signingError } = await this.supabase.storage
          .from('guides')
          .createSignedUrl(sourcePath, 15 * 60);
        if (signingError || !signed?.signedUrl) {
          throw new WorkerError(WorkerErrorCodes.SOURCE_DOWNLOAD_FAILED, 'A source download URL could not be created.');
        }
        downloadUrl = signed.signedUrl;
      }

      const response = await this.fetchImpl(downloadUrl, { signal: abortSignal });
      if (!response.ok || !response.body) {
        throw new WorkerError(WorkerErrorCodes.SOURCE_DOWNLOAD_FAILED, 'The source video could not be downloaded.');
      }

      const responseSize = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(responseSize) && responseSize > this.maximumSourceBytes) {
        throw new WorkerError(WorkerErrorCodes.AUDIO_TOO_LARGE, 'The source video exceeds the configured worker limit.');
      }

      const workspace = await mkdtemp(join(tmpdir(), SOURCE_TEMP_PREFIX));
      const sourceExtension = extname(new URL(downloadUrl).pathname).toLowerCase();
      const safeExtension = ['.mp4', '.webm', '.mov', '.m4v'].includes(sourceExtension)
        ? sourceExtension
        : '.video';
      const localPath = join(workspace, `source${safeExtension}`);

      try {
        await pipeline(
          Readable.fromWeb(response.body as any),
          new ByteLimitTransform(this.maximumSourceBytes),
          createWriteStream(localPath, { flags: 'wx' })
        );
      } catch (streamError) {
        await rm(workspace, { recursive: true, force: true });
        throw streamError;
      }

      return { localPath, duration };
    } catch (error: any) {
      if (error instanceof WorkerError || isAbortError(error)) throw error;
      throw new WorkerError(WorkerErrorCodes.SOURCE_DOWNLOAD_FAILED, 'The source video could not be downloaded.');
    }
  }

  async dispose(localPath: string): Promise<void> {
    await safeRemoveTempWorkspace(localPath, SOURCE_TEMP_PREFIX);
  }
}

export class FfmpegAudioExtractor implements AudioExtractor {
  constructor(
    private readonly ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg',
    private readonly ffprobePath = process.env.FFPROBE_PATH || 'ffprobe',
    private readonly processRunner: ProcessRunner = runProcess,
    private readonly chunkSeconds = DEFAULT_CHUNK_SECONDS
  ) {}

  private async probeDuration(path: string, abortSignal: AbortSignal): Promise<number> {
    const result = await this.processRunner(
      this.ffprobePath,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
      abortSignal
    );
    const duration = Number(result.stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('The media duration could not be determined.');
    }
    return duration;
  }

  async extractAudio(videoPath: string, abortSignal: AbortSignal): Promise<{ audioPath: string; duration: number }> {
    const workspace = await mkdtemp(join(tmpdir(), AUDIO_TEMP_PREFIX));
    const outputPattern = join(workspace, 'audio_chunk_%04d.mp3');

    try {
      const duration = await this.probeDuration(videoPath, abortSignal);
      await this.processRunner(
        this.ffmpegPath,
        [
          '-hide_banner',
          '-loglevel', 'error',
          '-y',
          '-i', videoPath,
          '-map', '0:a:0',
          '-vn',
          '-ac', '1',
          '-ar', '16000',
          '-b:a', '32k',
          '-f', 'segment',
          '-segment_time', String(this.chunkSeconds),
          '-reset_timestamps', '1',
          outputPattern
        ],
        abortSignal
      );

      const chunkNames = (await readdir(workspace))
        .filter(name => /^audio_chunk_\d{4}\.mp3$/.test(name))
        .sort();
      if (chunkNames.length === 0) {
        throw new Error('No speech audio chunks were created.');
      }

      let startTime = 0;
      const chunks: AudioChunkManifest['chunks'] = [];
      for (const chunkName of chunkNames) {
        const chunkPath = join(workspace, chunkName);
        const chunkDuration = await this.probeDuration(chunkPath, abortSignal);
        chunks.push({ path: chunkPath, startTime, duration: chunkDuration });
        startTime += chunkDuration;
      }

      const manifest: AudioChunkManifest = {
        schemaVersion: 1,
        duration,
        chunks
      };
      const manifestPath = join(workspace, 'manifest.json');
      await writeFile(manifestPath, JSON.stringify(manifest), { encoding: 'utf8', flag: 'wx' });
      return { audioPath: manifestPath, duration };
    } catch (error: any) {
      await rm(workspace, { recursive: true, force: true });
      if (isAbortError(error)) throw error;
      throw new WorkerError(WorkerErrorCodes.AUDIO_EXTRACTION_FAILED, 'The audio track could not be extracted.');
    }
  }

  async dispose(audioPath: string): Promise<void> {
    await safeRemoveTempWorkspace(audioPath, AUDIO_TEMP_PREFIX);
  }
}

export const stitchProviderChunks = (
  manifest: AudioChunkManifest,
  responses: any[]
) => {
  const words: Array<{ word: string; start: number; end: number }> = [];
  let previousEnd = 0;

  manifest.chunks.forEach((chunk, chunkIndex) => {
    const rawWords = Array.isArray(responses[chunkIndex]?.words)
      ? responses[chunkIndex].words
      : [];
    rawWords.forEach((rawWord: any) => {
      const text = String(rawWord?.word || rawWord?.text || '').trim();
      let start = chunk.startTime + Number(rawWord?.start);
      let end = chunk.startTime + Number(rawWord?.end);
      if (!text || !Number.isFinite(start) || !Number.isFinite(end)) return;

      start = Math.max(0, start, previousEnd);
      end = Math.min(manifest.duration, end);
      if (end <= start) return;

      words.push({ word: text, start, end });
      previousEnd = end;
    });
  });

  return {
    language: String(responses.find(response => response?.language)?.language || 'en').toLowerCase(),
    words
  };
};

export class OpenRouterChunkedTranscriptionProvider implements TranscriptionProvider {
  constructor(
    private readonly openai: OpenAI,
    private readonly model = 'openai/whisper-1',
    private readonly maximumProviderBytes = DEFAULT_MAX_PROVIDER_BYTES,
    private readonly timeoutMilliseconds = 10 * 60 * 1000
  ) {}

  async transcribe(audioPath: string, idempotencyKey: string, abortSignal: AbortSignal) {
    const startedAt = Date.now();
    try {
      const manifest = JSON.parse(await readFile(audioPath, 'utf8')) as AudioChunkManifest;
      if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.chunks) || manifest.chunks.length === 0) {
        throw new WorkerError(WorkerErrorCodes.PROVIDER_INVALID_RESPONSE, 'The extracted audio manifest is invalid.');
      }

      const responses = [];
      const requestIds: string[] = [];
      for (let index = 0; index < manifest.chunks.length; index++) {
        if (abortSignal.aborted) {
          const abortError = new Error('Transcription was aborted.');
          abortError.name = 'AbortError';
          throw abortError;
        }

        const chunk = manifest.chunks[index];
        const chunkStat = await stat(chunk.path);
        if (chunkStat.size <= 0 || chunkStat.size > this.maximumProviderBytes) {
          throw new WorkerError(WorkerErrorCodes.AUDIO_TOO_LARGE, 'An extracted audio chunk exceeds the provider limit.');
        }

        const response: any = await this.openai.audio.transcriptions.create(
          {
            file: createReadStream(chunk.path),
            model: this.model,
            response_format: 'verbose_json',
            timestamp_granularities: ['word']
          },
          {
            signal: abortSignal,
            timeout: this.timeoutMilliseconds,
            headers: {
              'Idempotency-Key': `${idempotencyKey}:chunk:${index}`
            }
          }
        );
        responses.push(response);
        if (response?._request_id) requestIds.push(String(response._request_id));
      }

      const result = stitchProviderChunks(manifest, responses);
      return {
        result,
        requestId: requestIds.join(',') || idempotencyKey,
        metadata: {
          model: this.model,
          durationMilliseconds: Date.now() - startedAt,
          wordCount: result.words.length,
          providerStatus: 'completed'
        }
      };
    } catch (error: any) {
      if (error instanceof WorkerError || isAbortError(error)) throw error;
      if (error?.status === 401 || error?.status === 403) {
        throw new WorkerError(WorkerErrorCodes.PROVIDER_AUTHENTICATION_FAILED, 'The transcription provider rejected the worker credentials.');
      }
      if (error?.status === 429) {
        throw new WorkerError(WorkerErrorCodes.PROVIDER_RATE_LIMITED, 'The transcription provider rate limit was reached.');
      }
      if (error?.name === 'APIConnectionTimeoutError' || error?.code === 'ETIMEDOUT') {
        throw new WorkerError(WorkerErrorCodes.PROVIDER_TIMEOUT, 'The transcription provider timed out.');
      }
      if (error?.status >= 500 || error?.code === 'ECONNRESET' || error?.code === 'ENOTFOUND') {
        throw new WorkerError(WorkerErrorCodes.PROVIDER_UNAVAILABLE, 'The transcription provider is unavailable.');
      }
      throw new WorkerError(WorkerErrorCodes.PROVIDER_INVALID_RESPONSE, 'The transcription provider returned an invalid response.');
    }
  }
}

export class WhisperTranscriptNormaliser implements TranscriptNormaliser {
  async normalise(providerResult: any, sourceAssetId: string, authDuration: number, jobId: string) {
    try {
      const rawWords = Array.isArray(providerResult?.words) ? providerResult.words : [];
      let previousEnd = 0;
      const words = rawWords.flatMap((word: any) => {
        const text = String(word?.word || word?.text || '').trim();
        let start = Math.max(0, Number(word?.start), previousEnd);
        let end = Math.min(authDuration, Number(word?.end));
        if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
        previousEnd = end;
        return [{ word: text, start, end }];
      });

      return normaliseWhisperResponse(jobId, sourceAssetId, authDuration, {
        language: providerResult?.language || 'en',
        words
      });
    } catch (error: any) {
      if (error instanceof WorkerError) throw error;
      throw new WorkerError(WorkerErrorCodes.TRANSCRIPT_NORMALISATION_FAILED, 'The transcript could not be normalised.');
    }
  }
}
