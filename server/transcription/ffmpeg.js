import { spawn } from 'node:child_process';
import { access, chmod, copyFile, mkdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStaticPath from 'ffmpeg-static';

// Speech audio settings: mono 16 kHz MP3 at 32 kbps is what Whisper works best with and keeps
// an hour of audio at roughly 14 MB.
export const AUDIO_ARGS = ['-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000', '-codec:a', 'libmp3lame', '-b:a', '32k', '-f', 'mp3'];
const BASE_ARGS = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
const HTTP_INPUT_ARGS = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'];
const STDERR_LIMIT = 16384;

let resolvedBinary = null;

const abortError = () => {
    const error = new Error('Media processing was aborted.');
    error.name = 'AbortError';
    return error;
};

export const isAbortError = error => error?.name === 'AbortError';

async function isExecutable(path) {
    try {
        await access(path, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

// Returns a runnable FFmpeg path. Prefers FFMPEG_PATH, then the ffmpeg-static binary bundled with
// the server. A bundle copied without its executable bit (read-only deployment filesystems) is
// copied once to the temp directory and made executable there.
export async function resolveFfmpegPath() {
    if (resolvedBinary) return resolvedBinary;

    const override = String(process.env.FFMPEG_PATH || '').trim();
    if (override) {
        resolvedBinary = override;
        return resolvedBinary;
    }

    if (!ffmpegStaticPath) throw new Error('FFmpeg is not available for this platform.');
    await stat(ffmpegStaticPath);

    if (await isExecutable(ffmpegStaticPath)) {
        resolvedBinary = ffmpegStaticPath;
        return resolvedBinary;
    }

    try {
        await chmod(ffmpegStaticPath, 0o755);
        if (await isExecutable(ffmpegStaticPath)) {
            resolvedBinary = ffmpegStaticPath;
            return resolvedBinary;
        }
    } catch {
        // Read-only filesystem: fall through to the temp copy.
    }

    const directory = join(tmpdir(), 'fsw-ffmpeg');
    await mkdir(directory, { recursive: true });
    const copyPath = join(directory, 'ffmpeg');
    await copyFile(ffmpegStaticPath, copyPath);
    await chmod(copyPath, 0o755);
    resolvedBinary = copyPath;
    return resolvedBinary;
}

// Runs a process to completion. Only stderr is captured (bounded), which is all FFmpeg reports
// at the error log level. Aborting the signal kills the process.
export const runProcess = (command, args, { signal } = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
        reject(abortError());
        return;
    }

    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => {
        stderr = `${stderr}${chunk.toString('utf8')}`.slice(-STDERR_LIMIT);
    });

    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });

    child.once('error', error => {
        signal?.removeEventListener('abort', onAbort);
        reject(error);
    });
    child.once('close', code => {
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted) {
            reject(abortError());
        } else if (code === 0) {
            resolve({ stderr });
        } else {
            const error = new Error(`${command} exited with code ${code}. ${stderr.trim()}`);
            error.code = 'FFMPEG_EXIT';
            error.exitCode = code;
            error.stderr = stderr;
            reject(error);
        }
    });
});

const isHttpInput = input => /^https?:\/\//i.test(input);

export function buildExtractArgs(input, outputPath) {
    return [
        ...BASE_ARGS,
        ...(isHttpInput(input) ? HTTP_INPUT_ARGS : []),
        '-i', input,
        '-map', '0:a:0',
        ...AUDIO_ARGS,
        outputPath
    ];
}

export function buildSliceArgs(inputPath, outputPath, startSeconds, durationSeconds) {
    return [
        ...BASE_ARGS,
        '-ss', String(startSeconds),
        '-t', String(durationSeconds),
        '-i', inputPath,
        ...AUDIO_ARGS,
        outputPath
    ];
}

export const classifyFfmpegFailure = error => {
    const text = String(error?.stderr || error?.message || '');
    if (/matches no streams|does not contain any stream/i.test(text)) return 'NO_AUDIO_STREAM';
    if (/Protocol not found|Unrecognized option 'reconnect'|https protocol/i.test(text)) return 'PROTOCOL_UNSUPPORTED';
    if (/HTTP error 4\d\d|Server returned 4\d\d|No such file|Invalid data found|Input\/output error|Connection|timed out/i.test(text)) return 'INPUT_UNAVAILABLE';
    return 'UNKNOWN';
};

// Pulls the speech track out of a video (local path or https URL, which FFmpeg streams without
// storing the video) into one MP3 file.
export async function extractSpeechAudio(input, outputPath, { signal, ffmpegPath, processRunner = runProcess } = {}) {
    const binary = ffmpegPath || await resolveFfmpegPath();
    await processRunner(binary, buildExtractArgs(input, outputPath), { signal });
    const output = await stat(outputPath);
    if (output.size === 0) {
        const error = new Error('FFmpeg produced an empty audio file.');
        error.code = 'FFMPEG_EXIT';
        throw error;
    }
    return { audioPath: outputPath, bytes: output.size };
}

// Cuts one time range out of an MP3, re-encoding so the boundaries are exact.
export async function sliceSpeechAudio(inputPath, outputPath, startSeconds, durationSeconds, { signal, ffmpegPath, processRunner = runProcess } = {}) {
    const binary = ffmpegPath || await resolveFfmpegPath();
    await processRunner(binary, buildSliceArgs(inputPath, outputPath, startSeconds, durationSeconds), { signal });
    const output = await stat(outputPath);
    return { audioPath: outputPath, bytes: output.size };
}
