import { createPartFromUri, createUserContent, type File, GoogleGenAI } from '@google/genai';
import logSymbols from 'log-symbols';
import { blueBright, italic, magenta, magentaBright } from 'picocolors';

import logger from './logger.js';
import { maskText } from './textUtils.js';

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

export enum GeminiErrorMessage {
    Overloaded = 'model is overloaded',
    RateLimit = 'Too Many Requests',
}

export class GeminiAPI {
    private readonly assets: string[];
    private client?: GoogleGenAI;
    private readonly ocrPrompt?: string;
    private trainingFiles: File[];

    constructor({ assets, ocrPrompt }: { assets: string[]; ocrPrompt: string }) {
        this.ocrPrompt = ocrPrompt;
        this.assets = assets;
        this.trainingFiles = [];
    }

    static mapErrorToMessage(err: any) {
        if (err.message?.includes('model is overloaded')) {
            return GeminiErrorMessage.Overloaded;
        }

        if (err.message?.includes('Too Many Requests')) {
            return GeminiErrorMessage.RateLimit;
        }
    }

    async deleteAllFiles() {
        const uploadedFiles = await this.client!.files.list({ config: { pageSize: 100 } });
        logger.info(`${uploadedFiles.pageLength} files to delete...`);

        for await (const file of uploadedFiles) {
            logger.info(`Deleting ${file.name}...`);

            try {
                await this.client?.files.delete({ name: file.name! });
            } catch (err) {
                logger.error(err, `${logSymbols.error} Could not delete ${file.uri}`);
            }
        }
    }

    async destroy() {
        for (const trainingFile of this.trainingFiles) {
            try {
                logger.info(`${logSymbols.info} deleting previous training file ${trainingFile.name}.`);
                await this.client?.files.delete({ name: trainingFile.name! });
            } catch (err) {
                logger.error(err, `Error deleting training file`);
            }
        }

        this.trainingFiles = [];
    }

    async init(apiKey: string) {
        await this.destroy();

        logger.info(`${logSymbols.info} Initializing with ${italic(magentaBright(maskText(apiKey)))}...`);
        this.client = new GoogleGenAI({ apiKey });

        logger.info(`ℹ${logSymbols.info} Uploading training assets: ${this.assets.toString()}`);

        this.trainingFiles = await Promise.all(
            this.assets.map(
                async (asset) =>
                    await this.client!.files.upload({
                        file: asset,
                    }),
            ),
        );

        logger.info(`${logSymbols.success} Training uris: ${this.trainingFiles.map((f) => f.uri).join(', ')}`);
    }

    async ocrImage(file: string) {
        logger.info(`${logSymbols.info} Uploading ${file}`);

        const imageFile = await this.client!.files.upload({
            file,
        });

        const contents = createUserContent([
            ...this.trainingFiles.map((t) => createPartFromUri(t.uri!, t.mimeType!)),
            createPartFromUri(imageFile.uri!, imageFile.mimeType!),
            this.ocrPrompt!,
        ]);

        let result;

        try {
            for (const { color, model } of COLORED_MODELS) {
                logger.info(`Issuing OCR request for ${imageFile.name} with ${color(model)}`);

                try {
                    result = await this.client!.models.generateContent({
                        contents,
                        model,
                    });

                    if (result.text) {
                        break;
                    } else {
                        logger.warn(`${logSymbols.warning} Empty response received, trying next model`);
                    }
                } catch (err: any) {
                    const message = GeminiAPI.mapErrorToMessage(err);

                    if (message === GeminiErrorMessage.Overloaded) {
                        logger.warn(`${logSymbols.warning} Model overloaded, trying next model`);
                    } else {
                        Object.assign(err, { cause: message });
                        throw err;
                    }
                }
            }
        } finally {
            try {
                logger.debug(`${logSymbols.info} Deleting ${imageFile.name}`);
                await this.client?.files.delete({ name: imageFile.name! });
            } catch (err) {
                logger.warn(err, `${logSymbols.warning} Could not delete uploaded image`);
            }
        }

        return result!;
    }
}
