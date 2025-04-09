import { CatsaJanga } from 'catsa-janga';

import type { OCROptions, OCRResult } from './types.js';

import { performOCROnPages } from './actions/ocrGemini.js';
import { performOCRSpaceFallback } from './actions/ocrSpace.js';
import { COLORED_MODELS, GeminiAPI } from './utils/api.js';
import { getOCRSpaceKey, getRandomGeminiApiKey } from './utils/config.js';
import { getImagesToOCR, waitForUserInterruption } from './utils/io.js';
import logger from './utils/logger.js';

const getImagesToProcess = async (imagesDirectory: string, pageNumbers: number[]) => {
    const pageIds = new Set(pageNumbers);
    return (await getImagesToOCR(imagesDirectory)).filter((f) => !pageIds.has(f.page));
};

export const ocrImages = async (imagesDirectory: string, outputFile: string, options: OCROptions) => {
    const gemini = new GeminiAPI({ ocrPrompt: options.prompt });

    try {
        const data: OCRResult = {
            aiModelId: COLORED_MODELS[0].model,
            pages: [],
            prompt: options.prompt,
            startTimestamp: new Date(),
            timestamp: new Date(),
        };

        const progressSaver = new CatsaJanga<OCRResult>({
            getData: () => ({
                ...data,
                pages: data.pages.toSorted((a, b) => a.page - b.page),
                timestamp: new Date(),
            }),
            logger,
            outputFile,
        });

        Object.assign(data, await progressSaver.restore());

        try {
            while (true) {
                await gemini.init(getRandomGeminiApiKey());

                logger.info('⏳ You have 5 seconds to press ENTER to choose a use API key...');
                const isInterruptedByUser = await waitForUserInterruption(5000);

                if (!isInterruptedByUser) {
                    logger.info('✅ Proceeding with API key');
                    break;
                }
            }

            if (options.resetBeforeStart) {
                await gemini.deleteAllFiles(); // cleanup for previous errors
            }

            let emptyPages = await performOCROnPages(
                gemini,
                data,
                await getImagesToProcess(
                    imagesDirectory,
                    data.pages.map((p) => p.page),
                ),
                options,
            );

            if (emptyPages.length > 0 && getOCRSpaceKey()) {
                logger.warn(`Trying ocr.space fallback for pages ${emptyPages.map((p) => p.page).toString()}`);
                emptyPages = await performOCRSpaceFallback(data, emptyPages, options.part);
            }

            return emptyPages;
        } finally {
            await progressSaver.saveProgress();
        }
    } finally {
        await gemini.destroy();
    }
};
