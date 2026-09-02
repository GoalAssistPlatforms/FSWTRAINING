import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    buildExtractArgs,
    buildSliceArgs,
    classifyFfmpegFailure,
    extractSpeechAudio,
    resolveFfmpegPath,
    runProcess,
    sliceSpeechAudio
} from './ffmpeg.js';

describe('ffmpeg argument construction', () => {
    it('streams https sources with reconnect options and maps only the first audio track', () => {
        const source = 'https://project.supabase.co/storage/v1/object/public/guides/source.webm';
        const args = buildExtractArgs(source, '/tmp/out.mp3');
        expect(args).toContain('-reconnect');
        const inputIndex = args.indexOf('-i');
        expect(args.slice(inputIndex, inputIndex + 4)).toEqual(['-i', source, '-map', '0:a:0']);
        expect(args).toEqual(expect.arrayContaining(['-ac', '1', '-ar', '16000', '-b:a', '32k', '-f', 'mp3']));
        expect(args.at(-1)).toBe('/tmp/out.mp3');
    });

    it('does not add reconnect options for local files', () => {
        expect(buildExtractArgs('/tmp/source.mp4', '/tmp/out.mp3')).not.toContain('-reconnect');
    });

    it('seeks before decoding when slicing so long files are not decoded from the start', () => {
        const args = buildSliceArgs('/tmp/full.mp3', '/tmp/chunk.mp3', 899, 901);
        const seekIndex = args.indexOf('-ss');
        expect(seekIndex).toBeLessThan(args.indexOf('-i'));
        expect(args.slice(seekIndex, seekIndex + 4)).toEqual(['-ss', '899', '-t', '901']);
    });

    it('classifies the failures the workflow needs to tell apart', () => {
        expect(classifyFfmpegFailure({ stderr: "Stream map '0:a:0' matches no streams." })).toBe('NO_AUDIO_STREAM');
        expect(classifyFfmpegFailure({ stderr: 'https: Protocol not found' })).toBe('PROTOCOL_UNSUPPORTED');
        expect(classifyFfmpegFailure({ stderr: 'Server returned 404 Not Found' })).toBe('INPUT_UNAVAILABLE');
        expect(classifyFfmpegFailure({ stderr: 'something else' })).toBe('UNKNOWN');
    });

    it('rejects immediately when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const runner = vi.fn((...args) => runProcess(...args));
        await expect(extractSpeechAudio('/tmp/in.mp4', '/tmp/out.mp3', {
            signal: controller.signal,
            ffmpegPath: 'ffmpeg',
            processRunner: runner
        })).rejects.toMatchObject({ name: 'AbortError' });
    });
});

describe('ffmpeg pipeline with the bundled binary', () => {
    let workspace;
    let ffmpeg;

    beforeAll(async () => {
        workspace = await mkdtemp(join(tmpdir(), 'fsw-ffmpeg-test-'));
        ffmpeg = await resolveFfmpegPath();
    });

    afterAll(async () => {
        await rm(workspace, { recursive: true, force: true });
    });

    const makeClip = async (name, { withAudio = true, seconds = 4 } = {}) => {
        const path = join(workspace, name);
        const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-f', 'lavfi', '-i', `color=c=black:s=64x64:r=5:d=${seconds}`];
        if (withAudio) args.push('-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=16000:duration=${seconds}`);
        args.push('-shortest', '-c:v', 'mpeg4');
        if (withAudio) args.push('-c:a', 'aac');
        args.push(path);
        await runProcess(ffmpeg, args);
        return path;
    };

    it('extracts a compact mono MP3 from a video and slices an exact range from it', async () => {
        const clip = await makeClip('clip.mp4');
        const full = join(workspace, 'full.mp3');
        const extracted = await extractSpeechAudio(clip, full);
        // 32 kbps CBR is about 4 kB per second of audio.
        expect(extracted.bytes).toBeGreaterThan(3 * 4000);
        expect(extracted.bytes).toBeLessThan(6 * 4000);

        const chunk = join(workspace, 'chunk.mp3');
        const sliced = await sliceSpeechAudio(full, chunk, 1, 2);
        expect(sliced.bytes).toBeGreaterThan(1.5 * 4000);
        expect(sliced.bytes).toBeLessThan(2.6 * 4000);

        const header = await readFile(chunk);
        const isMp3 = header.subarray(0, 3).toString('latin1') === 'ID3'
            || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
        expect(isMp3).toBe(true);
    }, 60000);

    it('reports a missing audio track as NO_AUDIO_STREAM', async () => {
        const clip = await makeClip('silent.mp4', { withAudio: false });
        const out = join(workspace, 'silent.mp3');
        await expect(extractSpeechAudio(clip, out)).rejects.toSatisfy(error => classifyFfmpegFailure(error) === 'NO_AUDIO_STREAM');
        await expect(stat(out)).rejects.toBeTruthy();
    }, 60000);
});
