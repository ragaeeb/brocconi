import process from 'node:process';

import logger from './logger.js';

/**
 * Array storing API keys.
 * Keys can be provided either through code or through environment variables.
 * @internal
 */
const GEMINI_API_KEYS: string[] = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(' ') : [];

/**
 * Tracks the current API key index for round-robin cycling.
 * @internal
 */
let currentKeyIndex = 0;

/**
 * Returns the total number of available API keys.
 *
 * @returns {number} The count of available API keys
 * @internal
 */
export const getApiKeysCount = (): number => GEMINI_API_KEYS.length;

/**
 * Validates that at least one API key is available.
 * Throws an error if no keys are found.
 *
 * @throws {Error} If no API keys are available
 * @internal
 */
const validateApiKeys = (): void => {
    if (getApiKeysCount() === 0) {
        logger.error('At least one API key is required. Please set them in your environment variables.');
        throw new Error('Empty  API keys');
    }
};

/**
 * Returns the next API key in rotation, using a round-robin approach.
 * This distributes requests evenly across all available API keys.
 *
 * @returns {string} The next API key to use
 * @throws {Error} If no API keys are available
 * @internal
 */
export const getNextApiKey = (): string => {
    validateApiKeys();

    const key = GEMINI_API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
    return key;
};

/**
 * Sets the API keys to use for transcription.
 * This replaces any existing keys, including those from environment variables.
 *
 * @param {string[]} apiKeys - Array of API keys
 * @throws {Error} If the provided array is empty
 * @internal
 */
export const setApiKeys = (apiKeys: string[]) => {
    GEMINI_API_KEYS.length = 0;
    GEMINI_API_KEYS.push(...apiKeys);

    validateApiKeys();
};
