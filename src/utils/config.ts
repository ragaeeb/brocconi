import Conf from 'conf';

import packageJson from '../../package.json' assert { type: 'json' };

export type Prompt = {
    assets: string[];
    promptFile: string;
};

type ConfigSchema = {
    geminiApiKeys: string[];
    prompts: Prompt[];
};

const config = new Conf<ConfigSchema>({
    projectName: packageJson.name,
    schema: {
        geminiApiKeys: {
            default: [],
            items: {
                type: 'string',
            },
            type: 'array',
        },
        prompts: {
            default: [],
            items: {
                properties: {
                    assets: {
                        items: { type: 'string' },
                        type: 'array',
                    },
                    promptFile: { type: 'string' },
                },
                required: ['assets', 'promptFile'],
                type: 'object',
            },
            type: 'array',
        },
    },
});

export const getRandomGeminiApiKey = (): string => {
    const keys = config.get('geminiApiKeys');
    return keys[Math.floor(Math.random() * keys.length)];
};

export default config;
