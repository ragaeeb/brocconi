#!/usr/bin/env bun

import { file } from 'bun';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import packageJson from '../package.json' assert { type: 'json' };
import { ocrImages } from './ocr.js';
import { hasGeminiApiKeys, setGeminiApiKeys, setOCRSpaceKey } from './utils/config.js';
import { getArgs, showHelp } from './utils/flags.js';
import { exportPdfToImages, openFolder } from './utils/io.js';
import logger from './utils/logger.js';

const init = async () => {
    const { backup, footers, help, keys, output, part, pdf, reset, version } = getArgs();

    if (help) {
        return showHelp();
    }

    if (version) {
        return logger.info(`${packageJson.version}`);
    }

    if (keys) {
        setGeminiApiKeys(keys.split(' '));
        return logger.info(`Saved Gemini API keys`);
    }

    if (backup) {
        setOCRSpaceKey(backup);
        return logger.info(`Saved ocr.space API key`);
    }

    if (!hasGeminiApiKeys()) {
        return logger.error(`API keys are not set. Please first set API keys like this: -k "KEY1 KEY2 KEY3"`);
    }

    if (!pdf) {
        return showHelp();
    }

    const inputStats = await fs.stat(pdf);
    const isDirectory = inputStats.isDirectory();
    const pdfFile = path.parse(pdf);

    if (!isDirectory && pdfFile.ext !== '.pdf') {
        return logger.error('Invalid input, it must either be a .pdf file or a folder of images');
    }

    const outputFile = output || path.format({ dir: pdfFile.dir, ext: '.json', name: pdfFile.name });
    const [prompt, imagesDirectory] = await Promise.all([
        file(path.join('training', footers ? 'prompt_footers.txt' : 'prompt_no_footers.txt')).text(),
        isDirectory ? pdf : exportPdfToImages(pdf),
    ]);

    let isSuccess = false;

    try {
        const pagesSkipped = await ocrImages(imagesDirectory, outputFile, {
            isolateFooters: footers,
            part,
            prompt,
            resetBeforeStart: reset,
        });

        isSuccess = pagesSkipped.length === 0;
    } catch (err) {
        if (err instanceof Error) {
            logger.error({ message: err.message, stack: err.stack }, 'index.ts: Error caught');
        } else {
            logger.error(String(err), 'index.ts: Unexpected error caught');
        }
    }

    if (!isSuccess) {
        logger.warn(`Images failed to OCR.`);
        await openFolder(imagesDirectory);

        logger.warn(`To resume, run with: ${imagesDirectory} -p ${part} -o ${outputFile}`);
    } else {
        logger.debug(`Cleaning up temporary directory: ${imagesDirectory}`);
        await fs.rm(imagesDirectory, { recursive: true });
    }
};

init();
