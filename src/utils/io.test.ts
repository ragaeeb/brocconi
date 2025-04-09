import { describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getImagesToOCR, isImageEmpty } from './io';

describe('io', () => {
    describe('getImagesToOCR', () => {
        it('should filter out the blank images', async () => {
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brocconi-test-io'));

            try {
                await Promise.all([
                    fs.cp(path.join('training', 'blank.jpg'), path.join(dir, '-1.jpg')),
                    fs.cp(path.join('training', 'sample_with_footnotes.jpg'), path.join(dir, '-2.jpg')),
                    fs.writeFile(path.join(dir, 'sample.json'), JSON.stringify({})),
                ]);

                const result = await getImagesToOCR(dir);
                expect(result).toEqual([{ file: path.join(dir, '-2.jpg'), page: 2 }]);
            } finally {
                await fs.rm(dir, { recursive: true });
            }
        });
    });

    describe('isImageEmpty', () => {
        it('should detect a blank page', async () => {
            const actual = await isImageEmpty(path.join('training', 'blank.jpg'));
            expect(actual).toBeTrue();
        });

        it('should detect a regular page', async () => {
            const actual = await isImageEmpty(path.join('training', 'sample_with_footnotes.jpg'));
            expect(actual).toBeFalse();
        });
    });
});
