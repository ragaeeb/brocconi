import { spawn } from 'bun';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Page } from '../types.js';

export const exportPdfToImages = async (pdf: string) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brocconi'));

    const exitCode = await spawn(['pdftoppm', '-cropbox', '-jpeg', '-q', '-r', '300', pdf, `${tempDir}/`]).exited;

    if (exitCode !== 0) {
        fs.rm(tempDir, { recursive: true });
        throw new Error(`pdftoppm exited with code ${exitCode}`);
    }

    return tempDir;
};

const getImagesToOCR = async (imagesDirectory: string) => {
    const files = (await fs.readdir(imagesDirectory)).toSorted().map((file) => path.join(imagesDirectory, file));
    return files;
};

export const getUnprocessedImages = async (imagesDirectory: string, processedPages: Page[]) => {
    const files = (await getImagesToOCR(imagesDirectory)).map((file) => {
        const name = path.parse(file).name.split('-').at(-1) as string;
        return { file, page: parseInt(name) };
    });

    const pageIds = new Set(processedPages.map((p) => p.page));

    return files.filter((f) => !pageIds.has(f.page));
};
