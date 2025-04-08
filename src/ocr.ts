import { file } from 'bun';
import { CatsaJanga } from 'catsa-janga';
import { setTimeout } from 'node:timers/promises';
import { ocrSpace } from 'ocr-space-api-wrapper';

import type { OCROptions, OCRResult, PageImageFile } from './types.js';

import { GeminiAPI, GeminiModel } from './utils/api.js';
import { getNextApiKey } from './utils/apiKeys.js';
import { getImagesToOCR } from './utils/io.js';
import logger from './utils/logger.js';

const FOOTNOTES_MARKER = '<FOOTNOTES>';

const getImagesToProcess = async (imagesDirectory: string, pageNumbers: number[]) => {
    const pageIds = new Set(pageNumbers);
    return (await getImagesToOCR(imagesDirectory)).filter((f) => !pageIds.has(f.page));
};

const performOCROnPages = async (gemini: GeminiAPI, data: OCRResult, files: PageImageFile[], options: OCROptions) => {
    logger.info(`performOCROnPages: ${files.length} files`);

    const emptyPages: PageImageFile[] = [];
    const deletePromises: Promise<void>[] = [];

    for (let i = 0; i < files.length; i++) {
        try {
            const { file: filePath, page } = files[i];
            const text = await gemini.ocrImage(filePath);

            if (text) {
                logger.info(`Adding page: ${page}`);

                const [body, footnotes] = options.isolateFooters
                    ? text.split(FOOTNOTES_MARKER).map((value) => value.trim())
                    : [text.trim()];

                data.pages.push({
                    accessed: new Date(),
                    body,
                    ...(footnotes && { footnotes }),
                    ...(gemini.model !== data.aiModelId && { aiModelId: gemini.model }),
                    page,
                    part: options.part,
                });
                deletePromises.push(file(filePath).delete());
            } else {
                logger.warn(`Page ${page} was empty!`);
                emptyPages.push(files[i]);
            }
        } catch (err: any) {
            if (err.message?.includes('many requests')) {
                logger.error(`${err.status} code detected. Cycling to next API key...`);
                await gemini.init(getNextApiKey());
                i--; // try this request again with another API key
            } else if (err.message?.includes('model is overloaded')) {
                logger.error(`${err.message}: Sleeping for 1 minute...`);
                i--; // try this request again with another API key
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

const performOCRSpaceFallback = async (data: OCRResult, files: PageImageFile[], part: number) => {
    const emptyPages: PageImageFile[] = [];

    for (const file of files) {
        try {
            console.log('process.env.OCR_SPACE_API_KEY', process.env.OCR_SPACE_API_KEY);
            const result = await ocrSpace(file.file, {
                apiKey: process.env.OCR_SPACE_API_KEY,
                language: 'auto' as any,
                OCREngine: '2',
                scale: true,
            });

            const body = result.ParsedResults[0].ParsedText.trim();

            if (body) {
                data.pages.push({
                    accessed: new Date(),
                    body: body.trim(),
                    ocrModelId: 'ocr.space.2',
                    page: file.page,
                    part,
                });
            } else {
                logger.warn(`Page ${file.page} was empty!`);
                emptyPages.push(file);
            }
        } catch (err) {
            logger.error(err, 'ocr.space error');
            emptyPages.push(file);
        }
    }

    return emptyPages;
};

export const ocrImages = async (imagesDirectory: string, outputFile: string, options: OCROptions) => {
    const gemini = new GeminiAPI({ ocrPrompt: options.prompt });

    try {
        const data: OCRResult = {
            aiModelId: GeminiModel.FlashV2,
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
            await gemini.init(getNextApiKey());

            let emptyPages = await performOCROnPages(
                gemini,
                data,
                await getImagesToProcess(
                    imagesDirectory,
                    data.pages.map((p) => p.page),
                ),
                options,
            );

            if (emptyPages.length > 0) {
                logger.warn(
                    `Retrying pages ${emptyPages.map((p) => p.page).toString()} using ${GeminiModel.FlashThinkingV2}`,
                );
                gemini.model = GeminiModel.FlashThinkingV2;
                emptyPages = await performOCROnPages(gemini, data, emptyPages, options); // try again
            }

            if (emptyPages.length > 0) {
                logger.warn(
                    `Trying model ${GeminiModel.ProV2_5} for pages ${emptyPages.map((p) => p.page).toString()}`,
                );
                gemini.model = GeminiModel.ProV2_5;
                emptyPages = await performOCROnPages(gemini, data, emptyPages, options);
            }

            if (emptyPages.length > 0 && process.env.OCR_SPACE_API_KEY) {
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
