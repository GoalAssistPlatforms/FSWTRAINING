import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const supabaseMocks = vi.hoisted(() => ({
    rpc: vi.fn()
}));

vi.mock('./supabase.js', () => ({
    supabase: {
        rpc: supabaseMocks.rpc
    }
}));

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: {},
    getDocument: vi.fn()
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
    default: 'pdf-worker.js'
}));

import {
    chunkCourseSourcePages,
    extractCourseSourceFile,
    mergeCourseSourceFiles,
    retrieveCourseSourceContext,
    validateCourseSourceFiles
} from './courseSources.js';

function makeFile(name, size, lastModified = 1) {
    return { name, size, lastModified };
}

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('course source file selection', () => {
    it('accumulates files selected in separate batches and removes duplicates', () => {
        const first = makeFile('policy.pdf', 1000);
        const second = makeFile('procedure.md', 2000);

        const merged = mergeCourseSourceFiles([first], [first, second]);

        expect(merged).toEqual([first, second]);
    });

    it('rejects unsupported and oversized source files', () => {
        expect(() => validateCourseSourceFiles([
            makeFile('spreadsheet.xlsx', 1000)
        ])).toThrow('Unsupported file type');

        expect(() => validateCourseSourceFiles([
            makeFile('large.pdf', 21 * 1024 * 1024)
        ])).toThrow('20 MB or smaller');
    });
});

describe('course source text processing', () => {
    it('chunks each page with overlap while retaining page references', () => {
        const words = Array.from({ length: 720 }, (_, index) => `word${index}`);
        const chunks = chunkCourseSourcePages([
            { pageNumber: 4, text: words.join(' ') }
        ]);

        expect(chunks).toHaveLength(3);
        expect(chunks[0]).toMatchObject({ chunkIndex: 0, pageStart: 4, pageEnd: 4, wordCount: 350 });
        expect(chunks[1].content.startsWith('word310 ')).toBe(true);
        expect(chunks[2].content.endsWith('word719')).toBe(true);
    });

    it('extracts readable text files without treating them as binary data', async () => {
        const result = await extractCourseSourceFile({
            name: 'policy.md',
            text: vi.fn().mockResolvedValue('# Policy\nFollow the approved process.')
        });

        expect(result.pageCount).toBe(1);
        expect(result.text).toContain('approved process');
        expect(result.pages[0].pageNumber).toBe(1);
    });
});

describe('course source retrieval', () => {
    it('falls back to the nearest chunks without expanding to every document summary', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ index: 0, embedding: [0.1, 0.2] }] })
        }));
        supabaseMocks.rpc
            .mockResolvedValueOnce({ data: [], error: null })
            .mockResolvedValueOnce({
                data: [{
                    document_name: 'Policy.pdf',
                    page_start: 7,
                    page_end: 7,
                    content: 'The nearest bounded source section.'
                }],
                error: null
            });

        const context = await retrieveCourseSourceContext('job-1', 'manager responsibilities', 6);

        expect(supabaseMocks.rpc).toHaveBeenCalledTimes(2);
        expect(supabaseMocks.rpc.mock.calls[1][1].match_threshold).toBe(-1);
        expect(context).toContain('Policy.pdf, page 7');
        expect(context).toContain('nearest bounded source section');
    });

    it('qualifies the pgvector cosine operator for the restricted function search path', () => {
        const migration = readFileSync(
            new URL('../migrations/20260810_course_source_documents.sql', import.meta.url),
            'utf8'
        );
        const qualifiedOperator = 'OPERATOR(public.<=>)';

        expect(migration.match(/OPERATOR\(public\.<=>\)/g)).toHaveLength(3);
        expect(migration.replaceAll(qualifiedOperator, '')).not.toContain('<=>');
    });
});
