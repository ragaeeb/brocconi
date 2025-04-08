#!/usr/bin/env bun

import { file } from 'bun';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import packageJson from '../package.json' assert { type: 'json' };
import { ocrImages } from './ocr.js';
import { hasApiKeys, setApiKeys } from './utils/config.js';
import { getArgs, showHelp } from './utils/flags.js';
import { exportPdfToImages, openFolder } from './utils/io.js';
import logger from './utils/logger.js';

const init = async () => {
    const { footers, help, keys, output, part, pdf, version } = getArgs();

    if (help) {
        return showHelp();
    }

    if (version) {
        return logger.info(`${packageJson.version}`);
    }

    if (keys) {
        return setApiKeys(keys.split(' '));
    }

    if (!hasApiKeys()) {
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
        });

        isSuccess = pagesSkipped.length === 0;
    } catch (err: any) {
        logger.error(err, 'index.ts: Error caught');
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
