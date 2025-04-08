import type { PageImageFile } from '@/types.js';

import { spawn } from 'bun';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import logger from './logger.js';

export const exportPdfToImages = async (pdf: string) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brocconi'));
    const command = ['pdftoppm', '-cropbox', '-jpeg', '-q', '-r', '300', pdf, `${tempDir}/`];

    logger.info(`Exporting pdf ${pdf} with ${command.toString()}`);
    const exitCode = await spawn(command).exited;

    if (exitCode !== 0) {
        fs.rm(tempDir, { recursive: true });
        throw new Error(`pdftoppm exited with code ${exitCode}`);
    }

    return tempDir;
};

export const getImagesToOCR = async (imagesDirectory: string): Promise<PageImageFile[]> => {
    const files = (await fs.readdir(imagesDirectory))
        .filter((f) => f.endsWith('.jpg'))
        .toSorted()
        .map((file) => path.join(imagesDirectory, file));

    return files.map((file) => {
        const name = path.parse(file).name.split('-').at(-1) as string;
        return { file, page: parseInt(name) };
    });
};
