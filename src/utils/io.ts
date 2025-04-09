import { $, spawn } from 'bun';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import pMap from 'p-map';
import sharp from 'sharp';

import type { PageImageFile } from '../types.js';

import logger from './logger.js';

export const exportPdfToImages = async (pdf: string) => {
    try {
        await $`which pdftoppm`.quiet();
    } catch (error) {
        logger.error(error);
        throw new Error('pdftoppm is not installed. Please install poppler-utils package.');
    }

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

export const isImageEmpty = async (path: string): Promise<boolean> => {
    try {
        const { data, info } = await sharp(path)
            .resize({ width: 1000 }) // optional: normalize resolution
            .grayscale()
            .threshold(150) // lower = keep more dark ink
            .raw()
            .toBuffer({ resolveWithObject: true });

        const blackPixels = data.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);
        const totalPixels = info.width * info.height;

        const blackRatio = blackPixels / totalPixels;
        return blackRatio < 0.0025;
    } catch (error) {
        logger.error(`Failed to process image ${path}: ${error}`);
    }

    return false;
};

export const getImagesToOCR = async (imagesDirectory: string): Promise<PageImageFile[]> => {
    logger.debug(`Scanning ${imagesDirectory} for images`);

    const files = (await fs.readdir(imagesDirectory))
        .filter((f) => f.endsWith('.jpg'))
        .toSorted()
        .map((file) => path.join(imagesDirectory, file))
        .map((file) => {
            const name = path.parse(file).name.split('-').at(-1) as string;
            return { file, page: parseInt(name) };
        })
        .filter((image) => {
            return image.page > 0;
        });

    logger.debug(`${files.length} images found, checking for blanks`);

    const results = await pMap(
        files,
        async (f) => {
            const isEmpty = await isImageEmpty(f.file);

            if (isEmpty) {
                return null;
            }

            return f;
        },
        { concurrency: 4 },
    );

    const validImages = results.filter(Boolean) as PageImageFile[];

    logger.info(`${validImages.length} valid images found`);

    return validImages;
};

export const waitForUserInterruption = async (timeoutMs = 3000): Promise<boolean> => {
    while (process.stdin.read()) {
        // Flush any existing stdin input by reading non-blocking
    }

    const timeout = setTimeout(timeoutMs).then(() => 'timeout');

    const input = (async () => {
        for await (const line of console) {
            return line;
        }
    })();

    let result;

    try {
        result = await Promise.race([timeout, input]);
    } finally {
        process.stdin.pause();
    }

    return result !== 'timeout';
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
        logger.error(`Failed to open folder: ${error}`);
        return false;
    }
};
