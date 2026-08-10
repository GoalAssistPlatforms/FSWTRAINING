import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    new URL('./20260810_background_course_generation.sql', import.meta.url),
    'utf8'
);

describe('background course generation migration', () => {
    it('qualifies both the pgvector type and cosine operator for restricted search paths', () => {
        expect(migration).toContain('query_embedding public.vector(1536)');
        expect(migration.match(/OPERATOR\(public\.<=>\)/g)).toHaveLength(3);
        expect(migration.replaceAll('OPERATOR(public.<=>)', '')).not.toMatch(/\s<=>\s/);
    });

    it('keeps browser users read only while service workers own checkpoint updates', () => {
        expect(migration).toContain('revoke update on public.course_generation_jobs from authenticated');
        expect(migration).toContain('grant execute on function public.claim_background_course_generation(uuid) to service_role');
        expect(migration).toContain('alter publication supabase_realtime add table public.course_generation_jobs');
    });
});
