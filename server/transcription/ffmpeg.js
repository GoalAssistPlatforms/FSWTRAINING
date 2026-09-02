import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { access, chmod, copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

// Speech audio settings: mono 16 kHz MP3 at 32 kbps is what Whisper works best with and keeps
// an hour of audio at roughly 14 MB.
export const AUDIO_ARGS = ['-vn', '-sn', '-dn', '-ac', '1', '-ar', '16000', '-codec:a', 'libmp3lame', '-b:a', '32k', '-f', 'mp3'];
const BASE_ARGS = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
const HTTP_INPUT_ARGS = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'];
const STDERR_LIMIT = 16384;

// Deployed workflow steps run as single-file bundles with no node_modules, so they fetch FFmpeg
// once per instance. The release is the one ffmpeg-static installs locally, so development and
// production run the same build, and the digests are the SHA-256 of the .gz assets as published
// on that GitHub release.
export const FFMPEG_RELEASE_TAG = 'b6.1.1';
export const FFMPEG_RELEASE_DIGESTS = Object.freeze({
    'linux-x64': 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa',
    'linux-arm64': '754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0'
});
const DEFAULT_DOWNLOAD_BASE_URL = 'https://github.com/eugeneware/ffmpeg-static/releases/download';

let resolvedBinary = null;
let resolving = null;

const abortError = () => {
    const error = new Error('Media processing was aborted.');
    error.name = 'AbortError';
    return error;
};

export const isAbortError = error => error?.name === 'AbortError';

const cacheDirectory = () => join(tmpdir(), 'fsw-ffmpeg');

// Works in the ESM server bundle, the CommonJS workflow step bundle and under Vitest.
const nodeRequire = (() => {
    try {
        if (typeof require === 'function') return require;
    } catch {
        // not CommonJS
    }
    try {
        return createRequire(import.meta.url);
    } catch {
        return null;
    }
})();

// The npm package is a convenience for local development. It is looked up dynamically so
// bundlers neither inline its lookup code nor copy the 80 MB binary into every server function.
function bundledBinaryPath() {
    if (!nodeRequire) return null;
    try {
        const packageName = 'ffmpeg-static';
        const path = nodeRequire(packageName);
        return typeof path === 'string' && path ? path : null;
    } catch {
        return null;
    }
}

async function isExecutable(path) {
    try {
        await access(path, constants.X_OK);
        return true;
    } catch {
        return false;
    }
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

// True when the file exists and this machine can actually execute it (wrong-architecture
// binaries and missing files both fail here).
async function runs(binary) {
    try {
        await runProcess(binary, ['-version']);
        return true;
    } catch {
        return false;
    }
}

// Returns a runnable path for a locally installed binary, copying it to the temp directory when
// the filesystem it lives on is read-only and the executable bit is missing.
async function makeRunnable(path) {
    try {
        await stat(path);
    } catch {
        return null;
    }

    if (!(await isExecutable(path))) {
        try {
            await chmod(path, 0o755);
        } catch {
            // read-only filesystem: fall through to the temp copy
        }
    }
    if (await isExecutable(path)) return (await runs(path)) ? path : null;

    const copyPath = join(cacheDirectory(), 'ffmpeg-bundled');
    try {
        await mkdir(cacheDirectory(), { recursive: true });
        await copyFile(path, copyPath);
        await chmod(copyPath, 0o755);
        return (await runs(copyPath)) ? copyPath : null;
    } catch {
        return null;
    }
}

class DigestingPassThrough extends Transform {
    constructor() {
        super();
        this.hash = createHash('sha256');
    }

    _transform(chunk, _encoding, callback) {
        this.hash.update(chunk);
        callback(null, chunk);
    }
}

// Downloads a gzipped binary, verifying the SHA-256 of the compressed bytes before the result is
// moved into place, so a partial or tampered download is never left where it could be executed.
export async function fetchVerifiedBinary({ url, sha256, destinationPath, fetchImpl = fetch, signal }) {
    const response = await fetchImpl(url, { signal, redirect: 'follow' });
    if (!response.ok || !response.body) {
        throw new Error(`FFmpeg download failed with HTTP ${response.status}.`);
    }

    await mkdir(dirname(destinationPath), { recursive: true });
    const partialPath = `${destinationPath}.${process.pid}.${Date.now()}.partial`;
    const digester = new DigestingPassThrough();
    try {
        await pipeline(
            Readable.fromWeb(response.body),
            digester,
            createGunzip(),
            createWriteStream(partialPath, { flags: 'wx' })
        );
        const digest = digester.hash.digest('hex');
        if (sha256 && digest !== sha256) {
            throw new Error('The FFmpeg download did not match the pinned checksum.');
        }
        await chmod(partialPath, 0o755);
        await rename(partialPath, destinationPath);
    } catch (error) {
        await rm(partialPath, { force: true });
        throw error;
    }
    return destinationPath;
}

export function describeDownloadTarget({ platform = process.platform, arch = process.arch, env = process.env } = {}) {
    const key = `${platform}-${arch}`;
    const sha256 = String(env.FFMPEG_DOWNLOAD_SHA256 || FFMPEG_RELEASE_DIGESTS[key] || '').trim();
    if (platform !== 'linux' || !sha256) return null;
    const base = String(env.FFMPEG_DOWNLOAD_BASE_URL || DEFAULT_DOWNLOAD_BASE_URL).replace(/\/+$/, '');
    return {
        key,
        sha256,
        url: `${base}/${FFMPEG_RELEASE_TAG}/ffmpeg-${key}.gz`,
        destinationPath: join(cacheDirectory(), `ffmpeg-${FFMPEG_RELEASE_TAG}-${key}`)
    };
}

async function locateBinary() {
    const override = String(process.env.FFMPEG_PATH || '').trim();
    if (override) return override;

    const bundled = bundledBinaryPath();
    if (bundled) {
        const runnable = await makeRunnable(bundled);
        if (runnable) return runnable;
    }

    const target = describeDownloadTarget();
    if (!target) {
        throw new Error(`FFmpeg is not available for ${process.platform}-${process.arch}. Set FFMPEG_PATH to a binary.`);
    }
    // An earlier invocation on this instance may already have fetched it.
    if (await runs(target.destinationPath)) return target.destinationPath;

    await fetchVerifiedBinary(target);
    if (!(await runs(target.destinationPath))) {
        throw new Error('The downloaded FFmpeg binary could not be executed.');
    }
    return target.destinationPath;
}

// Returns a runnable FFmpeg path: FFMPEG_PATH, then the locally installed ffmpeg-static binary,
// then a verified download of the pinned release (Linux only). Resolved once per process.
export async function resolveFfmpegPath() {
    if (resolvedBinary) return resolvedBinary;
    if (!resolving) {
        resolving = locateBinary()
            .then(path => {
                resolvedBinary = path;
                return path;
            })
            .finally(() => {
                resolving = null;
            });
    }
    return resolving;
}

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
