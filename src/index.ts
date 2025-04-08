#!/usr/bin/env bun

import { $, file } from 'bun';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ocrImages } from './ocr.js';
import { exportPdfToImages } from './utils/io.js';
import logger from './utils/logger.js';

const showHelp = () => {
    console.table([
        {
            Description: 'Input PDF file path or a directory containing the images',
            Example: '--input doc.pdf',
            Option: '-i, --input',
        },
        {
            Description:
                'Output JSON file path. If omitted will parse output file based on PDF name and output in the same folder as the PDF.',
            Example: '--output results.json',
            Option: '-o, --output',
        },
        {
            Description: 'Separate footers from paragraph text (default: false)',
            Example: '--footers',
            Option: '-f, --footers',
        },
        { Description: 'Display this help information', Example: '--help', Option: '-h, --help' },
        {
            Description: 'PDF file can be provided as first argument',
            Example: 'doc.pdf',
            Option: '[positional]',
        },
    ]);
};

const getArgs = () => {
    const { positionals, values } = parseArgs({
        allowPositionals: true,
        options: {
            footers: {
                default: false,
                short: 'f',
                type: 'boolean',
            },
            help: { short: 'h', type: 'boolean' },
            input: {
                short: 'i',
                type: 'string',
            },
            output: { short: 'o', type: 'string' },
            part: {
                default: '1',
                short: 'p',
                type: 'string',
            },
        },
        strict: true,
    });

    const [pdf = values.input] = positionals;

    return { footers: values.footers, help: values.help, output: values.output, part: parseInt(values.part), pdf };
};

const openFolder = async (path: string) => {
    const platform = process.platform;

    try {
        if (platform === 'win32') {
            await $`explorer ${path}`;
        } else if (platform === 'darwin') {
            await $`open ${path}`;
        } else {
            await $`xdg-open ${path}`;
        }
        return true;
    } catch (error) {
        console.error(`Failed to open folder: ${error}`);
        return false;
    }
};

const init = async () => {
    const { footers, help, output, part, pdf } = getArgs();

    if (help || !pdf) {
        return showHelp();
    }

    if (pdf) {
        const inputStats = await fs.stat(pdf);
        const isDirectory = inputStats.isDirectory();
        const pdfFile = path.parse(pdf);

        if (!isDirectory && pdfFile.ext !== '.pdf') {
            return console.error('Invalid input, it must either be a .pdf file or a folder of images');
        }

        const outputFile = output || path.format({ dir: pdfFile.dir, ext: '.json', name: pdfFile.name });
        const [prompt, imagesDirectory] = await Promise.all([
            file(path.join('training', footers ? 'prompt_footers.txt' : 'prompt_no_footers.txt')).text(),
            isDirectory ? pdf : exportPdfToImages(pdf),
        ]);

        let totalEmptyPages = 0;

        try {
            const pagesSkipped = await ocrImages(imagesDirectory, outputFile, {
                isolateFooters: footers,
                part,
                prompt,
            });

            totalEmptyPages = pagesSkipped.length;
        } catch (err: any) {
            logger.error(err, 'Error');
        }

        if (totalEmptyPages > 0) {
            logger.warn(`${totalEmptyPages} images failed to OCR.`);
            await openFolder(imagesDirectory);
        } else {
            logger.debug(`Cleaning up temporary directory: ${imagesDirectory}`);
            await fs.rm(imagesDirectory, { recursive: true });
        }
    }
};

init();
