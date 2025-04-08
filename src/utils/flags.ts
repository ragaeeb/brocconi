import { parseArgs } from 'node:util';

export const showHelp = () => {
    console.table(
        [
            {
                Description: 'Input PDF file path or a directory containing the images',
                Example: '--input doc.pdf',
                Option: '-i, --input',
            },
            {
                Description: 'Sets the backup ocr.space API key that can be used as a fallback',
                Example: '--backup "OCRSPACEKEY"',
                Option: '-b, --backup',
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
            {
                Description: 'Sets the Gemini API keys',
                Example: '--keys "K1 K2 K3 K4"',
                Option: '-k, --keys',
            },
            {
                Description: 'Get version number',
                Example: '--version',
                Option: '-v, --version',
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
    const { positionals, values } = parseArgs({
        allowPositionals: true,
        options: {
            backup: { short: 'b', type: 'string' },
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
            keys: { short: 'k', type: 'string' },
            output: { short: 'o', type: 'string' },
            part: {
                default: '1',
                short: 'p',
                type: 'string',
            },
            version: {
                short: 'v',
                type: 'boolean',
            },
        },
        strict: true,
    });

    const { input, ...rest } = values;

    const [pdf = input] = positionals;

    return { ...rest, part: parseInt(rest.part), pdf };
};
