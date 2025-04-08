import { createPartFromUri, createUserContent, type File, GoogleGenAI } from '@google/genai';
import path from 'node:path';

import logger from './logger.js';

export enum GeminiModel {
    FlashLiteV2 = 'gemini-2.0-flash-lite',
    FlashThinkingV2 = 'gemini-2.0-flash-thinking-exp-01-21',
    FlashV2 = 'gemini-2.0-flash',
    ProV2_5 = 'gemini-2.5-pro-exp-03-25',
}

export class GeminiAPI {
    set model(value: GeminiModel) {
        this._model = value;
    }

    get model() {
        return this._model;
    }

    private _model: GeminiModel;
    private client?: GoogleGenAI;
    private readonly ocrPrompt?: string;

    private trainingImageFile?: File;

    constructor({ ocrPrompt }: { ocrPrompt: string }) {
        this.ocrPrompt = ocrPrompt;
        this._model = GeminiModel.FlashV2;
    }

    async destroy() {
        try {
            if (this.trainingImageFile?.name) {
                logger.info(`Deleting previous training image.`);
                await this.client?.files.delete({ name: this.trainingImageFile.name });
            }
        } catch (err) {
            logger.error(err, `Error deleting training image`);
        }
    }

    async init(apiKey: string) {
        await this.destroy();

        logger.info('Initializing...');
        this.client = new GoogleGenAI({ apiKey });
    }

    async ocrImage(file: string) {
        if (!this.trainingImageFile) {
            logger.warn(`Training data was not uploaded, uploading it now for the first time`);

            this.trainingImageFile = await this.client!.files.upload({
                file: path.join('training', '2.jpg'),
            });
            logger.info(`Initialization complete, training file uri: ${this.trainingImageFile.uri}`);
        }

        logger.info(`Uploading ${file}`);
        const imageFile = await this.client!.files.upload({
            file,
        });

        logger.info(`Issuing OCR request for ${imageFile.uri}`);
        const result = await this.client!.models.generateContent({
            contents: createUserContent([
                createPartFromUri(this.trainingImageFile.uri!, this.trainingImageFile.mimeType!),
                createPartFromUri(imageFile.uri!, imageFile.mimeType!),
                this.ocrPrompt!,
            ]),
            model: this._model,
        });

        try {
            logger.debug(`Deleting ${imageFile.name}`);
            await this.client?.files.delete({ name: imageFile.name! });
        } catch (err) {
            logger.warn(err, 'Could not delete uploaded image');
        }

        return result.text;
    }
}
