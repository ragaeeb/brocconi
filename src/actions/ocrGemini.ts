import type { OCROptions, OCRResult, PageImageFile } from '@/types.js';
import type { GeminiAPI } from '@/utils/api.js';

import { getRandomGeminiApiKey } from '@/utils/config.js';
import logger from '@/utils/logger.js';
import { file } from 'bun';
import { setTimeout } from 'node:timers/promises';

const FOOTNOTES_MARKER = '<FOOTNOTES>';

export const performOCROnPages = async (
    gemini: GeminiAPI,
    data: OCRResult,
    files: PageImageFile[],
    options: OCROptions,
) => {
    logger.info(`performOCROnPages: ${files.length} files`);

    const emptyPages: PageImageFile[] = [];
    const deletePromises: Promise<void>[] = [];

    for (let i = 0; i < files.length; i++) {
        try {
            const { file: filePath, page } = files[i];
            const response = await gemini.ocrImage(filePath);

            if (response.text) {
                logger.info(`✅ Adding page: ${page}\n`);

                const [body, footnotes] = options.isolateFooters
                    ? response.text.split(FOOTNOTES_MARKER).map((value) => value.trim())
                    : [response.text.trim()];

                data.pages.push({
                    accessed: new Date(),
                    body,
                    ...(footnotes && { footnotes }),
                    ...(response.modelVersion !== data.aiModelId && { aiModelId: response.modelVersion }),
                    page,
                    part: options.part,
                });
                deletePromises.push(file(filePath).delete());
            } else {
                logger.warn(`Page ${page} was empty!`);
                emptyPages.push(files[i]);
            }
        } catch (err: any) {
            if (err.message?.includes('Too Many Requests')) {
                logger.error(`Rate limiting detected. Cycling to next API key...`);
                await gemini.init(getRandomGeminiApiKey());
                i--; // try this request again with another API key
            } else if (err.message?.includes('model is overloaded')) {
                logger.error(`${err.message}: Sleeping for 1 minute...`);
                i--; // try this request again
                await setTimeout(60 * 1000);
            } else {
                logger.error(err, 'Error');
                throw err;
            }
        }
    }

    if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
    }

    return emptyPages;
};
