# Background transcription worker

The worker processes uploaded walkthrough videos outside the browser and outside the synchronous web request. It streams the saved source video to temporary disk, extracts mono speech audio with FFmpeg, divides that audio into fifteen minute MP3 files, transcribes each file and stores one stitched transcript for review.

## Required deployment configuration

The worker container requires these secrets:

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `OPENAI_API_KEY`

The service role key must be configured only on the worker. It must never be added to the browser deployment.

Optional worker settings are:

1. `PORT`, default `8080`
2. `TRANSCRIPTION_WORKER_POLL_MS`, default `3000`
3. `TRANSCRIPTION_WORKER_LEASE_SECONDS`, default `180`
4. `TRANSCRIPTION_WORKER_MAX_SOURCE_BYTES`, default `5368709120`
5. `FFMPEG_PATH`, default `ffmpeg`
6. `FFPROBE_PATH`, default `ffprobe`

## Build and run

```bash
docker build --file Dockerfile.transcription-worker --tag training-transcription-worker .
docker run --env-file worker.env --publish 8080:8080 training-transcription-worker
```

The health endpoint is `GET /health`.

## Safe rollout order

1. Confirm the video transcription migrations through `20260720_relax_transcript_optional_metadata.sql` are present in the target Supabase project.
2. Deploy one worker instance with the required secrets.
3. Confirm `/health` returns status `ok`.
4. Create a transcription job and confirm it reaches `awaiting_approval`.
5. Set `VITE_TRANSCRIPTION_WORKER_ENABLED=true` in the web deployment and redeploy it.
6. Test a large video from upload through transcript approval and timeline step generation.

Keep the web feature flag disabled if no healthy worker is running. The existing synchronous path remains available while the flag is disabled.

## Data handling

Source videos and extracted audio are stored only in isolated temporary directories. Both are deleted after every successful or failed job. Logs include job identifiers and safe error codes but never include access tokens, storage URLs, audio content or transcript text.
