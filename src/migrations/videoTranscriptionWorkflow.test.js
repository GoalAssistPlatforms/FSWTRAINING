import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'src/migrations/20260902_video_transcription_workflow.sql'), 'utf8');

describe('video transcription workflow migration', () => {
    it('records which workflow run owns a job', () => {
        expect(migration).toContain('add column if not exists workflow_run_id text');
    });

    it('lets the web app start a run only for queued jobs it may edit', () => {
        expect(migration).toContain('function public.prepare_video_transcription_start');
        expect(migration).toContain('public.can_edit_video_editor_guide(v_job.guide_id)');
        expect(migration).toContain('grant execute on function public.prepare_video_transcription_start(uuid) to authenticated');
        expect(migration).toContain("workflow_run_id = 'starting'");
    });

    it('lets only the service role claim a specific job, reusing the lease rules', () => {
        expect(migration).toContain('function public.claim_video_transcription_job');
        expect(migration).toContain('grant execute on function public.claim_video_transcription_job(uuid, text, integer) to service_role');
        expect(migration).toContain('p_lease_duration_seconds < 15 or p_lease_duration_seconds > 300');
        expect(migration).toContain("v_job.status := 'extracting_audio'");
        expect(migration).toContain('insert into public.video_transcription_attempts');
    });

    it('detaches the run when a job is manually retried', () => {
        expect(migration).toMatch(/retry_video_transcription_job[\s\S]*workflow_run_id = null/);
    });
});
