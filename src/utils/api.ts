import { createPartFromUri, createUserContent, type File, GoogleGenAI } from '@google/genai';
import { blueBright, italic, magenta, magentaBright } from 'picocolors';

import logger from './logger.js';
import { samplePageWithFootnotes } from './training.js';

enum GeminiModel {
    FlashLiteV2 = 'gemini-2.0-flash-lite',
    FlashThinkingV2 = 'gemini-2.0-flash-thinking-exp-01-21',
    FlashV2 = 'gemini-2.0-flash',
    ProV2_5 = 'gemini-2.5-pro-exp-03-25',
}

export const COLORED_MODELS = [
    { color: blueBright, model: GeminiModel.FlashV2 },
    { color: magenta, model: GeminiModel.FlashThinkingV2 },
    { color: magenta, model: GeminiModel.ProV2_5 },
    { color: magenta, model: GeminiModel.FlashLiteV2 },
];

export class GeminiAPI {
    private client?: GoogleGenAI;
    private readonly ocrPrompt?: string;

    private trainingImageFile?: File;

    constructor({ ocrPrompt }: { ocrPrompt: string }) {
        this.ocrPrompt = ocrPrompt;
    }

    async deleteAllFiles() {
        const uploadedFiles = await this.client!.files.list({ config: { pageSize: 100 } });
        logger.info(`${uploadedFiles.pageLength} files to delete...`);

        for await (const file of uploadedFiles) {
            logger.info(`Deleting ${file.name}...`);

            try {
                await this.client?.files.delete({ name: file.name! });
            } catch (err) {
                logger.error(err, `Could not delete ${file.uri}`);
            }
        }
    }

    async destroy() {
        try {
            if (this.trainingImageFile?.name) {
                logger.info(`🗑️ Deleting previous training image.`);
                await this.client?.files.delete({ name: this.trainingImageFile.name });
            }
        } catch (err) {
            logger.error(err, `Error deleting training image`);
        }

        this.trainingImageFile = undefined;
    }

    async init(apiKey: string) {
        await this.destroy();

        logger.info(
            `Initializing with ${italic(magentaBright(apiKey.slice(0, 3) + '*****' + apiKey[Math.floor(apiKey.length / 2)] + '*****' + apiKey.slice(-3)))}...`,
        );
        this.client = new GoogleGenAI({ apiKey });
    }

    async ocrImage(file: string) {
        if (!this.trainingImageFile) {
            logger.info(`ℹ️ Uploading training image: ${samplePageWithFootnotes}`);

            this.trainingImageFile = await this.client!.files.upload({
                file: samplePageWithFootnotes,
            });

            logger.info(`🥊 Training uri: ${this.trainingImageFile.uri}`);
        }

        logger.info(`📤 Uploading ${file}`);

        const imageFile = await this.client!.files.upload({
            file,
        });

        let result;

        try {
            for (const { color, model } of COLORED_MODELS) {
                logger.info(`⏳ Issuing OCR request for ${imageFile.uri} with ${color(model)}`);

                result = await this.client!.models.generateContent({
                    contents: createUserContent([
                        createPartFromUri(this.trainingImageFile!.uri!, this.trainingImageFile!.mimeType!),
                        createPartFromUri(imageFile.uri!, imageFile.mimeType!),
                        this.ocrPrompt!,
                    ]),
                    model,
                });

                if (result.text) {
                    break;
                } else {
                    logger.warn('♻️ Empty response received, trying next model');
                }
            }
        } finally {
            try {
                logger.debug(`🗑️ Deleting ${imageFile.name}`);
                await this.client?.files.delete({ name: imageFile.name! });
            } catch (err) {
                logger.warn(err, 'Could not delete uploaded image');
            }
        }

        return result!;
    }
}
