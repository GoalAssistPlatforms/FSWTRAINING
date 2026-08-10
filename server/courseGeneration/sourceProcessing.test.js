import { afterEach, describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';

const originalDOMMatrix = globalThis.DOMMatrix;

afterEach(() => {
    if (originalDOMMatrix === undefined) {
        delete globalThis.DOMMatrix;
    } else {
        globalThis.DOMMatrix = originalDOMMatrix;
    }
});

describe('server source PDF processing', () => {
    it('loads PDF.js without browser APIs and extracts page text', async () => {
        delete globalThis.DOMMatrix;
        const { extractPdfPages } = await import('./sourceProcessing.js');
        const document = new jsPDF();
        document.text('Anti bribery training source', 20, 20);

        const extracted = await extractPdfPages(Buffer.from(document.output('arraybuffer')));

        expect(extracted.pageCount).toBe(1);
        expect(extracted.pages).toEqual([{
            pageNumber: 1,
            text: 'Anti bribery training source'
        }]);
    });
});
