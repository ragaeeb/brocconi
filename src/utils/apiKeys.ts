import env from 'env-var';

/**
 * Array storing API keys.
 * Keys can be provided either through code or through environment variables.
 * @internal
 */
const API_KEYS: string[] = env.get('GEMINI_API_KEYS').required().asString().split(' ');

/**
 * Tracks the current API key index for round-robin cycling.
 * Initialize with a random index to better distribute load across processes.
 * @internal
 */
let currentKeyIndex = Math.floor(Math.random() * Math.max(API_KEYS.length, 1));

/**
 * Returns the next API key in rotation, using a round-robin approach.
 * The starting position is randomly selected when the module is loaded
 * to better distribute load across multiple concurrent processes.
 *
 * @returns {string} The next API key to use
 * @throws {Error} If no API keys are available
 * @internal
 */
export const getNextApiKey = (): string => {
    if (API_KEYS.length === 0) {
        throw new Error('No API keys available. Please provide at least one API key.');
    }

    const key = API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    return key;
};

/**
 * Sets the API keys to use.
 * This replaces any existing keys, including those from environment variables.
 * Also selects a new random starting index to maintain load distribution.
 *
 * @param {string[]} apiKeys - Array of API keys
 * @throws {Error} If the provided array is empty
 * @internal
 */
export const setApiKeys = (apiKeys: string[]) => {
    if (!apiKeys || apiKeys.length === 0) {
        throw new Error('Cannot set empty API key array');
    }

    API_KEYS.length = 0;
    API_KEYS.push(...apiKeys);

    // Select a new random starting index when keys change
    currentKeyIndex = Math.floor(Math.random() * apiKeys.length);
};
