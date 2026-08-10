import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vercel function budget', () => {
    it('keeps legacy handlers out of the top level api directory', () => {
        expect(existsSync(resolve(process.cwd(), 'api'))).toBe(false);
    });
});
