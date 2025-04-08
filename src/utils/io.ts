import type { PageImageFile } from '@/types.js';

import { $, spawn } from 'bun';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import logger from './logger.js';

export const exportPdfToImages = async (pdf: string) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brocconi'));
    const command = ['pdftoppm', '-cropbox', '-jpeg', '-q', '-r', '300', pdf, `${tempDir}/`];

    logger.info(`Exporting pdf ${pdf} with ${command.toString()}`);
    const exitCode = await spawn(command).exited;

    if (exitCode === 0) {
        return tempDir;
    }

    await fs.rm(tempDir, { recursive: true });
    throw new Error(`pdftoppm exited with code ${exitCode}`);
};

export const openFolder = async (path: string) => {
    const platform = process.platform;

    try {
        if (platform === 'win32') {
            await $`explorer ${path}`;
        } else if (platform === 'darwin') {
            await $`open ${path}`;
        } else {
            await $`xdg-open ${path}`;
        }
        return true;
    } catch (error) {
        console.error(`Failed to open folder: ${error}`);
        return false;
    }
};

export const getImagesToOCR = async (imagesDirectory: string): Promise<PageImageFile[]> => {
    const files = (await fs.readdir(imagesDirectory))
        .filter((f) => f.endsWith('.jpg'))
        .toSorted()
        .map((file) => path.join(imagesDirectory, file));

    return files
        .map((file) => {
            const name = path.parse(file).name.split('-').at(-1) as string;
            return { file, page: parseInt(name) };
        })
        .filter((image) => {
            return image.page > 0;
        });
};
