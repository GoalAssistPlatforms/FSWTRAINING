import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  FfmpegAudioExtractor,
  OpenAIChunkedTranscriptionProvider,
  SupabaseSourceAssetLoader,
  WhisperTranscriptNormaliser,
  runProcess,
  stitchProviderChunks,
  type AudioChunkManifest
} from '../../worker/runtimeAdapters';

describe('background transcription runtime adapters', () => {
  const workspaces: string[] = [];

  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map(path => rm(path, { recursive: true, force: true })));
    vi.restoreAllMocks();
  });

  it('stitches chunk word timings into one chronological transcript', () => {
    const manifest: AudioChunkManifest = {
      schemaVersion: 1,
      duration: 20,
      chunks: [
        { path: '/tmp/one.mp3', startTime: 0, duration: 10 },
        { path: '/tmp/two.mp3', startTime: 10, duration: 10 }
      ]
    };

    const result = stitchProviderChunks(manifest, [
      { language: 'EN', words: [{ word: 'first', start: 1, end: 2 }] },
      { words: [{ word: 'second', start: 0.5, end: 1.5 }] }
    ]);

    expect(result.language).toBe('en');
    expect(result.words).toEqual([
      { word: 'first', start: 1, end: 2 },
      { word: 'second', start: 10.5, end: 11.5 }
    ]);
  });

  it('streams a stored source video to disk without buffering it as one browser object', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        original_storage_path: 'https://project.supabase.co/storage/v1/object/public/guides/source.mp4',
        duration_seconds: 120,
        file_size_bytes: 11
      },
      error: null
    });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle }))
        }))
      }))
    };
    const response = new Response('video bytes', {
      status: 200,
      headers: { 'content-length': '11' }
    });
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const loader = new SupabaseSourceAssetLoader(
      supabase as any,
      'https://project.supabase.co',
      fetchImpl
    );

    const result = await loader.downloadAsset('asset-one', new AbortController().signal);
    expect(result.duration).toBe(120);
    expect(await readFile(result.localPath, 'utf8')).toBe('video bytes');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/public/guides/source.mp4',
      { signal: expect.any(AbortSignal) }
    );

    await loader.dispose(result.localPath);
  });

  it('extracts compact audio chunks and creates a manifest', async () => {
    let probeCalls = 0;
    const runner = vi.fn(async (command: string, args: string[]) => {
      if (command === 'ffprobe') {
        probeCalls += 1;
        return { stdout: probeCalls === 1 ? '1801\n' : probeCalls === 2 ? '900\n' : '901\n', stderr: '' };
      }

      const outputPattern = args.at(-1)!;
      await writeFile(outputPattern.replace('%04d', '0000'), 'audio one');
      await writeFile(outputPattern.replace('%04d', '0001'), 'audio two');
      return { stdout: '', stderr: '' };
    });
    const extractor = new FfmpegAudioExtractor('ffmpeg', 'ffprobe', runner, 900);

    const result = await extractor.extractAudio('/tmp/source.mp4', new AbortController().signal);
    const manifest = JSON.parse(await readFile(result.audioPath, 'utf8'));

    expect(result.duration).toBe(1801);
    expect(manifest.chunks).toHaveLength(2);
    expect(manifest.chunks[1].startTime).toBe(900);
    expect(runner).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-b:a', '32k', '-segment_time', '900']),
      expect.any(AbortSignal)
    );

    await extractor.dispose(result.audioPath);
  });

  it.runIf(existsSync('/usr/bin/ffmpeg') && existsSync('/usr/bin/ffprobe'))(
    'processes a real video through FFmpeg into bounded speech chunks',
    async () => {
      const workspace = await mkdtemp(join(tmpdir(), 'runtime-ffmpeg-test-'));
      workspaces.push(workspace);
      const sourcePath = join(workspace, 'source.mp4');
      const signal = new AbortController().signal;
      await runProcess('/usr/bin/ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=black:s=160x90:r=10:d=3',
        '-f', 'lavfi',
        '-i', 'sine=frequency=1000:sample_rate=16000:duration=3',
        '-shortest',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        sourcePath
      ], signal);

      const extractor = new FfmpegAudioExtractor('/usr/bin/ffmpeg', '/usr/bin/ffprobe', runProcess, 1);
      const result = await extractor.extractAudio(sourcePath, signal);
      const manifest = JSON.parse(await readFile(result.audioPath, 'utf8'));

      expect(result.duration).toBeGreaterThanOrEqual(3);
      expect(manifest.chunks.length).toBeGreaterThanOrEqual(3);
      await extractor.dispose(result.audioPath);
    }
  );

  it('transcribes each extracted chunk without loading the video into browser memory', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'runtime-provider-test-'));
    workspaces.push(workspace);
    const first = join(workspace, 'first.mp3');
    const second = join(workspace, 'second.mp3');
    await writeFile(first, 'first audio');
    await writeFile(second, 'second audio');
    const manifestPath = join(workspace, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      duration: 20,
      chunks: [
        { path: first, startTime: 0, duration: 10 },
        { path: second, startTime: 10, duration: 10 }
      ]
    }));

    const create = vi.fn()
      .mockResolvedValueOnce({ _request_id: 'request-one', language: 'en', words: [{ word: 'one', start: 1, end: 2 }] })
      .mockResolvedValueOnce({ _request_id: 'request-two', language: 'en', words: [{ word: 'two', start: 1, end: 2 }] });
    const provider = new OpenAIChunkedTranscriptionProvider({
      audio: { transcriptions: { create } }
    } as any);

    const response = await provider.transcribe(
      manifestPath,
      'transcription-job:one:attempt:1',
      new AbortController().signal
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(response.result.words[1]).toEqual({ word: 'two', start: 11, end: 12 });
    expect(response.metadata.wordCount).toBe(2);
  });

  it('clips provider timing drift to the authoritative source duration', async () => {
    const normaliser = new WhisperTranscriptNormaliser();
    const transcript = await normaliser.normalise(
      {
        language: 'en',
        words: [
          { word: 'near', start: 9.5, end: 9.8 },
          { word: 'end', start: 9.8, end: 10.2 }
        ]
      },
      'asset-one',
      10,
      'job-one'
    );

    expect(transcript.duration).toBe(10);
    expect(transcript.words[1].endSourceTime).toBe(10);
    expect(transcript.words[1].id).toBe('job-one_w1_9800_10000');
  });
});
