import { createPartFromBase64, createPartFromUri, createUserContent, type File, GoogleGenAI } from '@google/genai';
import logSymbols from 'log-symbols';
import { blueBright, italic, magenta, magentaBright } from 'picocolors';

import { base64Encode } from './io.js';
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
    { color: magenta, model: GeminiModel.ProV2_5 },
    { color: magenta, model: GeminiModel.FlashThinkingV2 },
    { color: magenta, model: GeminiModel.FlashLiteV2 },
];

export enum GeminiErrorMessage {
    Overloaded = 'model is overloaded',
    RateLimit = 'Too Many Requests',
}

type GeminiAPIProps = {
    assets: string[];
    prompt: string;
    verify?: (text: string) => Promise<boolean>;
};

export class GeminiAPI {
    private assetFiles: File[];
    private readonly assets: string[];
    private client?: GoogleGenAI;
    private readonly prompt: string;
    private readonly verify?: (text: string) => Promise<boolean>;

    constructor({ assets, prompt, verify }: GeminiAPIProps) {
        this.prompt = prompt;
        this.assets = assets;
        this.verify = verify;
        this.assetFiles = [];
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
        for (const trainingFile of this.assetFiles) {
            try {
                logger.info(`${logSymbols.info} deleting previous training file ${trainingFile.name}.`);
                await this.client?.files.delete({ name: trainingFile.name! });
            } catch (err) {
                logger.error(err, `Error deleting training file`);
            }
        }

        this.assetFiles = [];
    }

    async init(apiKey: string) {
        await this.destroy();

        logger.info(`${logSymbols.info} Initializing with ${italic(magentaBright(maskText(apiKey)))}...`);
        this.client = new GoogleGenAI({ apiKey });

        logger.info(`ℹ${logSymbols.info} Uploading training assets: ${this.assets.toString()}`);

        this.assetFiles = await this.uploadFiles(this.assets);

        logger.info(`${logSymbols.success} Training uris: ${this.assetFiles.map((f) => f.uri).join(', ')}`);
    }

    async ocrImage(files: string[], { useBase64Encoding = true } = {}) {
        logger.info(`${logSymbols.info} Uploading ${files}, useBase64Encoding=${useBase64Encoding}`);

        const parts = [];
        let filesToCleanUp: File[] = [];

        if (useBase64Encoding) {
            const taskFiles = await Promise.all(files.map(base64Encode));
            parts.push(...taskFiles.map((t) => createPartFromBase64(t.data, t.mimeType)));
        } else {
            filesToCleanUp = await this.uploadFiles(files);
            parts.push(...filesToCleanUp.map((t) => createPartFromUri(t.uri!, t.mimeType!)));
        }

        const contents = createUserContent([
            ...this.assetFiles.map((t) => createPartFromUri(t.uri!, t.mimeType!)),
            ...parts,
            this.prompt!,
        ]);

        let result;

        try {
            for (const { color, model } of COLORED_MODELS) {
                logger.info(`Issuing OCR request with ${color(model)}`);

                try {
                    result = await this.client!.models.generateContent({
                        contents,
                        model,
                    });

                    if (result.text) {
                        if (this.verify) {
                            const isValid = await this.verify(result.text);

                            if (isValid) {
                                break;
                            } else {
                                logger.warn(`${logSymbols.warning} Invalid response, trying next model`);
                            }
                        } else {
                            break;
                        }
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
            for (const taskFile of filesToCleanUp) {
                try {
                    logger.debug(`${logSymbols.info} Deleting ${taskFile.name}`);
                    await this.client?.files.delete({ name: taskFile.name! });
                } catch (err) {
                    logger.warn(err, `${logSymbols.warning} Could not delete uploaded task file`);
                }
            }
        }

        return result!;
    }

    async uploadFiles(files: string[]) {
        const promises = files.map(
            async (asset) =>
                await this.client!.files.upload({
                    file: asset,
                }),
        );

        return Promise.all(promises);
    }
}
