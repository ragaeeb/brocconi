import { file } from 'bun';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { OCRResult } from './types.js';

import { GeminiAPI, GeminiModels } from './utils/api.js';
import { getNextApiKey } from './utils/apiKeys.js';
import { exportPdfToImages, getImagesToOCR } from './utils/io.js';
import logger from './utils/logger.js';
import { ProgressSaver } from './utils/progressSaver.js';

const FOOTNOTES_MARKER = '<FOOTNOTES>';

const getPageData = (text: string, page: number, isolateFooters?: boolean) => {
    const [body, footnotes] = isolateFooters
        ? text.split(FOOTNOTES_MARKER).map((value) => value.trim())
        : [text.trim()];

    return {
        accessed: new Date(),
        body,
        ...(footnotes && { footnotes }),
        page,
        part: 1,
    };
};

const getImagesToProcess = async (imagesDirectory: string, pageNumbers: number[]) => {
    const pageIds = new Set(pageNumbers);
    return (await getImagesToOCR(imagesDirectory)).filter((f) => !pageIds.has(f.page));
};

export const ocrImages = async (pdf: string, outputFile: string, options: { isolateFooters?: boolean } = {}) => {
    const [prompt, imagesDirectory] = await Promise.all([
        file(path.join('training', options.isolateFooters ? 'prompt_footers.txt' : 'prompt_no_footers.txt')).text(),
        exportPdfToImages(pdf),
    ]);

    const gemini = new GeminiAPI({ ocrPrompt: prompt });

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

        const imageFiles = await getImagesToProcess(
            imagesDirectory,
            data.pages.map((p) => p.page),
        );

        logger.info(`${imageFiles.length} left to process`);

        await gemini.init(getNextApiKey());

        for (let i = 0; i < imageFiles.length; i++) {
            try {
                const { file, page } = imageFiles[i];
                const text = await gemini.ocrImage(file);

                if (text) {
                    logger.info(`Adding page: ${page}`);

                    data.pages.push(getPageData(text, page, options.isolateFooters));
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
        await Promise.all([gemini.destroy(), fs.rm(imagesDirectory, { recursive: true })]);
    }
};
