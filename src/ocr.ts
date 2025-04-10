import { file } from 'bun';
import { CatsaJanga } from 'catsa-janga';
import logSymbols from 'log-symbols';

import type { OCROptions, OCRResult, PageImageFile } from './types.js';

import { GeminiAPI, GeminiErrorMessage } from './utils/api.js';
import { getRandomGeminiApiKey } from './utils/config.js';
import { getImagesToOCR } from './utils/io.js';
import logger from './utils/logger.js';

const performOCROnPages = async (gemini: GeminiAPI, data: OCRResult, files: PageImageFile[]) => {
    logger.info(`${logSymbols.info} performOCROnPages: ${files.length} files`);

    const emptyPages: PageImageFile[] = [];
    const deletePromises: Promise<void>[] = [];

    for (let i = 0; i < files.length; i++) {
        try {
            const { file: filePath, page } = files[i];
            const response = await gemini.ocrImage(filePath);

            if (response.text) {
                logger.info(`${logSymbols.success} Adding page: ${page}\n`);

                data.pages.push({
                    body: response.text.trim(),
                    createdAt: new Date(),
                    modelId: response.modelVersion,
                    page,
                });

                deletePromises.push(file(filePath).delete());
            } else {
                logger.warn(`${logSymbols.warning} Page ${page} was empty!`);
                emptyPages.push(files[i]);
            }
        } catch (err: any) {
            if (err instanceof Error && err.cause === GeminiErrorMessage.RateLimit) {
                logger.warn(`${logSymbols.warning} Rate limiting detected. Cycling to next API key...`);
                await gemini.init(getRandomGeminiApiKey());
                i--; // try this request again with another API key
            } else {
                throw err;
            }
        }
    }

    if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
    }

    return emptyPages;
};

export const ocrImages = async (imagesDirectory: string, outputFile: string, options: OCROptions) => {
    const gemini = new GeminiAPI({ assets: options.assets, ocrPrompt: options.prompt });
    const data: OCRResult = {
        createdAt: new Date(),
        pages: [],
        prompt: options.prompt,
        updatedAt: new Date(),
    };
    const progressSaver = new CatsaJanga<OCRResult>({
        getData: () => ({
            ...data,
            pages: data.pages.toSorted((a, b) => a.page - b.page),
            updatedAt: new Date(),
        }),
        logger,
        outputFile,
    });
    Object.assign(data, await progressSaver.restore());

    try {
        const pageIds = new Set(data.pages.map((p) => p.page));
        const [images] = await Promise.all([
            getImagesToOCR(imagesDirectory),
            gemini.init(options.apiKey || getRandomGeminiApiKey()),
        ]);

        if (options.clearBeforeStart) {
            await gemini.deleteAllFiles(); // cleanup for previous errors
        }

        const emptyPages = await performOCROnPages(
            gemini,
            data,
            images.filter((f) => !pageIds.has(f.page)),
        );

        if (emptyPages.length > 0) {
            throw new Error(`Some pages could not be processed, please revise`, {
                cause: emptyPages.map((p) => p.page).join(', '),
            });
        }
    } finally {
        await Promise.all([progressSaver.saveProgress(), gemini.destroy()]);
    }
};
