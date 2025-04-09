import { ocrSpace } from 'ocr-space-api-wrapper';

import type { OCRResult, PageImageFile } from '../types.js';

import { getOCRSpaceKey } from '../utils/config.js';
import logger from '../utils/logger.js';

export const performOCRSpaceFallback = async (data: OCRResult, files: PageImageFile[], part: number) => {
    const emptyPages: PageImageFile[] = [];

    for (const file of files) {
        try {
            const result = await ocrSpace(file.file, {
                apiKey: getOCRSpaceKey(),
                language: 'auto' as any,
                OCREngine: '2',
                scale: true,
            });

            const body = result.ParsedResults[0]?.ParsedText?.trim();

            if (body) {
                data.pages.push({
                    accessed: new Date(),
                    aiModelId: 'ocr.space.2',
                    body: body.trim(),
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
