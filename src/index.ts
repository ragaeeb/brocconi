#!/usr/bin/env bun

import logSymbols from 'log-symbols';
import { promises as fs } from 'node:fs';

import packageJson from '../package.json' assert { type: 'json' };
import { ocrImages } from './ocr.js';
import config from './utils/config.js';
import { exportPdfToImages, openFolder } from './utils/io.js';
import logger from './utils/logger.js';
import { getArgs, getInputAndOutputFiles, selectGeminiKey, selectPrompt, showHelp } from './utils/prompts.js';

const init = async () => {
    const { backup, help, reset } = getArgs();

    if (help) {
        return showHelp();
    }

    if (backup) {
        config.set('ocrSpaceApiKey', backup);
        return logger.info(`${logSymbols.success} Saved ocr.space API key`);
    }

    logger.info(`${packageJson.name} v${packageJson.version} config loaded from ${config.path}`);

    const apiKey = await selectGeminiKey();
    const { assets, prompt } = await selectPrompt();

    const { imagesDirectory, outputFile, pdf } = await getInputAndOutputFiles();

    if (pdf) {
        await exportPdfToImages(pdf, imagesDirectory);
    }

    try {
        await ocrImages(imagesDirectory, outputFile, {
            apiKey,
            assets,
            clearBeforeStart: reset,
            prompt,
        });

        logger.debug(`Cleaning up temporary directory: ${imagesDirectory}`);
        await fs.rm(imagesDirectory, { recursive: true });
    } catch (err) {
        if (err instanceof Error) {
            logger.error({ cause: err.cause, message: err.message, stack: err.stack }, 'index.ts: Error caught');
        } else {
            logger.error(String(err), 'index.ts: Unexpected error caught');
        }

        await openFolder(imagesDirectory);
    }
};

init();
