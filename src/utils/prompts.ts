import { confirm, input, password, select } from '@inquirer/prompts';
import { file, hash } from 'bun';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import config, { getRandomGeminiApiKey, Prompt } from './config.js';
import logger from './logger.js';
import { maskText, sanitizeInput } from './textUtils.js';

export const showHelp = () => {
    console.table(
        [
            {
                Description:
                    'Removes all the previously uploaded files before starting in case there were errors which prevented cleanup',
                Example: '--reset',
                Option: '-r, --reset',
            },
            {
                Description: 'Sets the backup ocr.space API key that can be used as a fallback',
                Example: '--backup "OCRSPACEKEY"',
                Option: '-b, --backup',
            },
            { Description: 'Display this help information', Example: '--help', Option: '-h, --help' },
            {
                Description: 'PDF file can be provided as first argument',
                Example: 'doc.pdf',
                Option: '[positional]',
            },
        ].sort((a, b) => a.Example.localeCompare(b.Example)),
    );
};

export const getArgs = () => {
    const { values } = parseArgs({
        allowPositionals: false,
        options: {
            backup: { short: 'b', type: 'string' },
            help: { short: 'h', type: 'boolean' },
            reset: {
                short: 'r',
                type: 'boolean',
            },
        },
        strict: true,
    });

    return values;
};

const getPromptFile = async (): Promise<string> => {
    const file = sanitizeInput(
        await input({
            message: 'Provide a plain-text UTF-8 file containing your prompt or press Enter to finish:',
            validate: async (txtFile) => {
                const f = sanitizeInput(txtFile);
                if (!f) return true;
                try {
                    const inputStats = await fs.stat(f);
                    return inputStats.isFile() && f.endsWith('.txt') ? true : 'Please enter a valid text file.';
                } catch {
                    return 'File not found. Please enter a valid file.';
                }
            },
        }),
    );

    return file;
};

const promptForAssetFiles = async (): Promise<string[]> => {
    const assets: string[] = [];

    while (true) {
        const file = sanitizeInput(
            await input({
                message: 'Provide a supporting file for this prompt or press Enter to finish:',
                validate: async (assetPath) => {
                    const f = sanitizeInput(assetPath);

                    if (!f) {
                        return true;
                    }

                    try {
                        const inputStats = await fs.stat(f);
                        return inputStats.isFile() ? true : 'Please enter a valid file.';
                    } catch {
                        return 'File not found. Please enter a valid file.';
                    }
                },
            }),
        );

        if (file) {
            assets.push(file);
        } else if (assets.length > 0) {
            break;
        }
    }

    return assets;
};

export const selectPrompt = async () => {
    const prompts: Prompt[] = config.get('prompts');

    if (prompts.length === 0) {
        while (true) {
            const promptFile = await getPromptFile();

            if (!promptFile && prompts.length === 0) {
                logger.warn('You must add at least one prompt to continue.');
                continue;
            }

            if (!promptFile) {
                break;
            }

            const assets: string[] = await promptForAssetFiles();

            prompts.push({
                assets,
                promptFile: path.resolve(promptFile),
            });
        }

        config.set('prompts', prompts);
    }

    const selectedValue = await select({
        choices: prompts.map((p) => ({
            description: p.assets.map((asset) => path.basename(asset)).join(', '),
            name: path.basename(p.promptFile),
            value: p.promptFile,
        })),
        message: 'Select the prompt to use',
    });

    const selectedPrompt = prompts.find((p) => p.promptFile === selectedValue)!;
    return { assets: selectedPrompt.assets, prompt: await file(selectedPrompt.promptFile).text() };
};

export const selectGeminiKey = async () => {
    if (!config.has('geminiApiKeys')) {
        const keys = await password({
            mask: true,
            message: 'Gemini API keys not found, enter your keys now separated by spaces (ie: K1 K2 K3 K4...)',
            validate: (val) => val.trim().length > 0,
        });

        config.set('geminiApiKeys', keys.trim().split(' '));
    }

    const apiKey = await select({
        choices: config
            .get('geminiApiKeys')
            .map((key) => ({
                name: maskText(key),
                value: key,
            }))
            .concat({ name: 'Random', value: '' }),
        default: '',
        message: 'Select the API key to use',
    });

    return apiKey || getRandomGeminiApiKey();
};

export const getInputAndOutputFiles = async () => {
    const pdf = sanitizeInput(
        await input({
            message: 'Enter the pdf file to OCR.',
            required: true,
            validate: async (pdfFile) => {
                const f = sanitizeInput(pdfFile);
                const inputStats = await fs.stat(f);
                return inputStats.isFile() && f.endsWith('.pdf') ? true : 'Please enter a valid PDF file.';
            },
        }),
    );

    const pdfFile = path.parse(pdf);
    const defaultOutput = path.format({ dir: pdfFile.dir, ext: '.json', name: pdfFile.name });

    const outputFile =
        (
            await input({
                default: path.format({ dir: pdfFile.dir, ext: '.json', name: pdfFile.name }),
                message: 'Enter the output file.',
                required: false,
                validate: () => true,
            })
        ).trim() || defaultOutput;

    const imagesDirectory = path.join(os.tmpdir(), 'brocconi', hash(pdf).toString());

    if (await fs.exists(imagesDirectory)) {
        const resume = await confirm({
            message: 'Found an existing folder for this PDF file name, are you resuming from a previous session?',
        });

        if (resume) {
            return { imagesDirectory, outputFile };
        }

        await fs.rm(imagesDirectory, { recursive: true });
    }

    await fs.mkdir(imagesDirectory);

    return { imagesDirectory, outputFile, pdf };
};
