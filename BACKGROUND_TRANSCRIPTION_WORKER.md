# Background transcription worker

The worker processes uploaded walkthrough videos outside the browser and outside the synchronous web request. It streams the saved source video to temporary disk, extracts mono speech audio with FFmpeg, divides that audio into fifteen minute MP3 files, transcribes each file with Whisper through OpenRouter and stores one stitched transcript for review.

Like the rest of the platform, the worker only ever talks to OpenRouter. It never calls OpenAI directly.

## Required deployment configuration

The worker container requires these secrets:

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `OPENROUTER_API_KEY`

The service role key must be configured only on the worker. It must never be added to the browser deployment.

Optional worker settings are:

1. `PORT`, default `8080`
2. `TRANSCRIPTION_WORKER_POLL_MS`, default `3000`
3. `TRANSCRIPTION_WORKER_LEASE_SECONDS`, default `180`
4. `TRANSCRIPTION_WORKER_MAX_SOURCE_BYTES`, default `5368709120`
5. `TRANSCRIPTION_WORKER_APP_URL`, default `https://fswtraining.vercel.app` (sent to OpenRouter as the referring application)
6. `FFMPEG_PATH`, default `ffmpeg`
7. `FFPROBE_PATH`, default `ffprobe`

## Build and run

```bash
docker build --file Dockerfile.transcription-worker --tag training-transcription-worker .
docker run --env-file worker.env --publish 8080:8080 training-transcription-worker
```

The image bundles the worker and its JavaScript dependencies into a single file at build time, so the runtime layer contains only Node, FFmpeg and that bundle. To run it without Docker, install FFmpeg and use `npm run build:transcription-worker` followed by `npm run worker:transcription`.

The health endpoint is `GET /health`. It returns `200` while the worker is running and `503` once it has been asked to stop. The response includes the time and outcome of the last poll and a `consecutiveErrors` counter, which should normally be `0`.

## Safe rollout order

1. Confirm the video transcription migrations through `20260720_relax_transcript_optional_metadata.sql` are present in the target Supabase project.
2. Deploy one worker instance with the required secrets.
3. Confirm `/health` returns status `ok`.
4. Create a transcription job and confirm it reaches `awaiting_approval`.
5. Set `VITE_TRANSCRIPTION_WORKER_ENABLED=true` in the Vercel project environment and redeploy the web app. This is a build time flag, so a redeploy is required for it to take effect.
6. Test a large video from upload through transcript approval and timeline step generation.

Keep the web feature flag disabled if no healthy worker is running. The existing in-browser path remains available while the flag is disabled, and is still used as the fallback for guides that were recorded before the flag was enabled.

## Behaviour

- One job is processed at a time per worker instance. Run more instances to process more jobs in parallel; the database lease prevents two workers from picking up the same job.
- A job can be cancelled from the editor at any stage. The worker checks for cancellation between stages and aborts any download, FFmpeg process or provider request that is in flight.
- On `SIGTERM` the worker finishes the job it is working on, stops polling and then exits, so a redeploy never abandons a half-processed job.
- If a poll fails for a reason outside a job (for example the database being unreachable) the worker logs the error, backs off for up to a minute and keeps running rather than exiting.

## Data handling

Source videos and extracted audio are stored only in isolated temporary directories. Both are deleted after every successful or failed job. Logs include job identifiers and safe error codes but never include access tokens, storage URLs, audio content or transcript text.
