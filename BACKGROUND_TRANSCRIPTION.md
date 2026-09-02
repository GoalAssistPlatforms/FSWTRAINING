# Background transcription

Walkthrough videos are transcribed by a Vercel Workflow, the same mechanism that already runs background course generation. Nothing extra needs hosting: the run executes inside the existing Vercel deployment.

## How a job flows

1. The editor creates a transcription job (`create_video_transcription_job`) and calls `POST /api/transcription/start`.
2. The endpoint checks the caller may edit the guide (`prepare_video_transcription_start`) and starts `transcribeVideoInBackground` from `server/workflows/videoTranscription.js`.
3. The run claims the job under a lease, streams the video's audio track through FFmpeg into one mono 16 kHz MP3, and stores it next to the video in the `guides` bucket (`video_source_assets.audio_storage_path`).
4. The audio is transcribed in parallel 15-minute pieces with Whisper through OpenRouter (`openai/whisper-1`), then stitched, normalised, validated and recorded for review with the existing `record_video_transcription_result` function.
5. The editor polls the job as before and shows the transcript for approval.

Cancelling from the editor is honoured between stages. Transient failures follow the retry policy already built into `record_video_transcription_failure`: the run sleeps until the next attempt is due and claims the job again. A manual retry from the editor starts a new run.

## Configuration

Server environment (Vercel project):

- `OPENROUTER_API_KEY` — already required by the other AI features. The worker never calls OpenAI directly.
- `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — already required by course generation.
- `BACKGROUND_TRANSCRIPTION_MAX_SECONDS` (optional, default `10800`) — longest recording accepted. Audio extraction is one function invocation, so this should stay well inside the plan's function duration limit (300 s on Hobby).
- `FFMPEG_PATH` (optional) — overrides the bundled `ffmpeg-static` binary.

Build-time flag for the web app:

- `VITE_BACKGROUND_TRANSCRIPTION_ENABLED=true` switches the editor from in-browser transcription to the background run. It is read at build time, so a redeploy is needed for it to take effect.

## Rollout

1. Apply `src/migrations/20260902_video_transcription_workflow.sql` to the Supabase project (the earlier video transcription migrations through `20260720` must already be present).
2. Deploy. FFmpeg ships inside the server function via `ffmpeg-static`; no separate service is needed.
3. Set `VITE_BACKGROUND_TRANSCRIPTION_ENABLED=true` in the Vercel project and redeploy.
4. Record or open a guide, generate a transcript, and watch the run under Observability → Workflows in the Vercel dashboard.

Leave the flag unset to keep the previous in-browser behaviour.

## Data handling

Temporary audio is written to the function's temp directory and deleted after each step. The extracted speech audio is kept in storage alongside the source video so retries and re-transcriptions do not re-read the video. Logs never contain tokens, transcript text or audio.
