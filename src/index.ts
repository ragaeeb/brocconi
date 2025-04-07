#!/usr/bin/env bun

import path from 'node:path';
import { parseArgs } from 'node:util';

import { ocrImages } from './ocr.js';

const showHelp = () => {
    console.table([
        { Description: 'Input PDF file path', Example: '--input doc.pdf', Option: '-i, --input' },
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
        },
        strict: true,
    });

    const [pdf = values.input] = positionals;

    return { footers: values.footers, help: values.help, output: values.output, pdf };
};

const init = async () => {
    const { footers, help, output, pdf } = getArgs();

    if (help || !pdf) {
        return showHelp();
    }

    if (pdf) {
        const pdfFile = path.parse(pdf);
        const outputFile = output || path.format({ dir: pdfFile.dir, ext: '.json', name: pdfFile.name });
        await ocrImages(pdf, outputFile, { isolateFooters: footers });
    }
};

init();
