import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const NARRATION_LOUDNESS_FILTER = 'loudnorm=I=-16:TP=-1.5:LRA=11';

export function narrationNormalisationArgs() {
    return [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', 'pipe:0',
        '-af', NARRATION_LOUDNESS_FILTER,
        '-codec:a', 'libmp3lame',
        '-b:a', '128k',
        '-f', 'mp3',
        'pipe:1'
    ];
}

export async function normaliseNarrationAudio(audioBuffer) {
    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
        throw new Error('Narration audio must be a non-empty Buffer.');
    }
    if (!ffmpegPath) {
        throw new Error('FFmpeg binary is unavailable.');
    }

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, narrationNormalisationArgs(), {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const output = [];
        const errors = [];

        ffmpeg.stdout.on('data', chunk => output.push(chunk));
        ffmpeg.stderr.on('data', chunk => errors.push(chunk));
        ffmpeg.on('error', reject);
        ffmpeg.on('close', code => {
            if (code !== 0) {
                reject(new Error(`Narration loudness normalisation failed with FFmpeg exit code ${code}: ${Buffer.concat(errors).toString('utf8')}`));
                return;
            }

            const normalisedAudio = Buffer.concat(output);
            if (normalisedAudio.length === 0) {
                reject(new Error('Narration loudness normalisation produced empty audio.'));
                return;
            }
            resolve(normalisedAudio);
        });

        ffmpeg.stdin.on('error', error => {
            if (error.code !== 'EPIPE') reject(error);
        });
        ffmpeg.stdin.end(audioBuffer);
    });
}
