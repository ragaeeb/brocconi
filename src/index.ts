#!/usr/bin/env bun

import { file } from 'bun';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import type { OCRResult } from './types.js';

import { GeminiAPI, GeminiModels } from './utils/api.js';
import { getNextApiKey } from './utils/apiKeys.js';
import { exportPdfToImages, getUnprocessedImages } from './utils/io.js';
import logger from './utils/logger.js';
import { ProgressSaver } from './utils/progressSaver.js';

const FOOTNOTES_MARKER = '<FOOTNOTES>';

const ocrImages = async (pdf: string, outputFile: string) => {
    const [prompt, imagesDirectory] = await Promise.all([
        file(path.join('training', 'prompt.txt')).text(),
        exportPdfToImages(pdf),
    ]);

    try {
        const data: OCRResult = {
            aiModelId: GeminiModels.FlashV2,
            pages: [],
            prompt,
            startTimestamp: new Date(),
            timestamp: new Date(),
        };

        const progressSaver = new ProgressSaver<OCRResult>({
            getData: () => ({
                ...data,
                pages: data.pages.toSorted((a, b) => a.page - b.page),
                timestamp: new Date(),
            }),
            logger,
            outputFile,
        });

        Object.assign(data, await progressSaver.restore());

        const imageFiles = await getUnprocessedImages(imagesDirectory, data.pages);

        logger.info(`${imageFiles.length} left to process`);

        const gemini = new GeminiAPI({ ocrPrompt: prompt });
        await gemini.init(getNextApiKey());

        for (let i = 0; i < imageFiles.length; i++) {
            try {
                const { file, page } = imageFiles[i];
                const text = await gemini.ocrImage(file);

                if (text) {
                    logger.info(`Adding page: ${page}`);

                    const [body, footnotes] = text.split(FOOTNOTES_MARKER).map((value) => value.trim());

                    data.pages.push({
                        accessed: new Date(),
                        body,
                        ...(footnotes && { footnotes }),
                        page,
                        part: 1,
                    });
                } else {
                    logger.warn(`Page ${page} was empty! Skipping...`);
                }
            } catch (err: any) {
                if (err.message?.includes('many requests')) {
                    logger.error(`${err.status} code detected. Cycling to next API key...`);
                    await gemini.init(getNextApiKey());
                    i--; // try this request again with another API key
                } else {
                    logger.error(err, 'Error');
                    throw err;
                }
            }
        }

        await progressSaver.saveProgress();
    } finally {
        await fs.rm(imagesDirectory, { recursive: true });
    }
};

if (process.argv.length > 3) {
    await ocrImages(process.argv[2], process.argv[3]);
} else {
    logger.error('A PDF and output file must be specified');
}
