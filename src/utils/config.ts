import Conf from 'conf';

import packageJson from '../../package.json' assert { type: 'json' };
import logger from './logger.js';

type ConfigSchema = {
    geminiApiKeys: string[];
    ocrSpaceApiKey?: string;
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
        ocrSpaceApiKey: {
            type: 'string',
        },
    },
});

logger.info(`Config loaded from ${config.path}`);

/**
 * Returns the next API key in rotation, using a round-robin approach.
 * The starting position is randomly selected when the module is loaded
 * to better distribute load across multiple concurrent processes.
 *
 * @returns {string} The next API key to use
 * @throws {Error} If no API keys are available
 * @internal
 */
export const getRandomApiKey = (): string => {
    const keys = config.get('geminiApiKeys');
    const currentKeyIndex = Math.floor(Math.random() * Math.max(keys.length, 1));

    return keys[currentKeyIndex];
};

export const hasApiKeys = () => {
    return config.get('geminiApiKeys').length > 0;
};

export const setApiKeys = (keys: string[]) => {
    config.set('geminiApiKeys', keys);
};

export const setOCRSpaceKey = (key: string) => {
    config.set('ocrSpaceApiKey', key);
};

export const getOCRSpaceKey = () => {
    return config.get('ocrSpaceApiKey');
};
