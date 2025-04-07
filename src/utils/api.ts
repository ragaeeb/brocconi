import { createPartFromUri, createUserContent, type File, GoogleGenAI } from '@google/genai';
import path from 'node:path';

import logger from './logger.js';

const TRAINING_FILE_ID = 'training';

export enum GeminiModels {
    FlashLiteV2 = 'gemini-2.0-flash-lite',
    FlashThinkingV2 = 'gemini-2.0-flash-thinking-exp-01-21',
    FlashV2 = 'gemini-2.0-flash',
    ProV2_5 = 'gemini-2.5-pro-exp-03-25',
}

export class GeminiAPI {
    private client?: GoogleGenAI;
    private ocrPrompt?: string;
    private trainingImageFile?: File;

    constructor({ ocrPrompt }: { ocrPrompt: string }) {
        this.ocrPrompt = ocrPrompt;
    }

    async init(apiKey: string) {
        logger.info('Initializing...');
        this.client = new GoogleGenAI({ apiKey });

        logger.info(`Checking if training exists`);

        try {
            this.trainingImageFile = await this.client.files.get({ name: TRAINING_FILE_ID });
        } catch {
            logger.warn(`Training data was not uploaded, uploading it now for the first time`);

            this.trainingImageFile = await this.client.files.upload({
                config: { mimeType: 'image/jpeg', name: TRAINING_FILE_ID },
                file: path.join('training', '2.jpg'),
            });
        }

        logger.info(`Initialization complete, training file uri: ${this.trainingImageFile.uri}`);
    }

    async ocrImage(file: string) {
        logger.info(`Uploading ${file}`);
        const imageFile = await this.client!.files.upload({
            file,
        });

        logger.info(`Issuing OCR request for ${imageFile.uri}`);
        const result = await this.client!.models.generateContent({
            contents: createUserContent([
                createPartFromUri(this.trainingImageFile!.uri!, this.trainingImageFile!.mimeType!),
                createPartFromUri(imageFile.uri!, imageFile.mimeType!),
                this.ocrPrompt!,
            ]),
            model: GeminiModels.FlashV2,
        });

        return result.text;
    }
}
