import { describe, expect, it } from 'bun:test';

import { buildChromeFlags } from './chrome-flags.ts';

describe('buildChromeFlags', () => {
    it('should return the same flags for the same input', () => {
        const options = {
            additionalFlags: ['--lang=en-US', '--force-color-profile=srgb'],
            headless: true,
            viewport: { width: 1280, height: 720 },
        } as const;

        expect(buildChromeFlags(options)).toEqual(buildChromeFlags(options));
    });

    it('should append additional flags after the deterministic defaults', () => {
        expect(
            buildChromeFlags({
                additionalFlags: ['--lang=en-US'],
                headless: false,
                viewport: { width: 800, height: 600 },
            }),
        ).toEqual([
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--hide-scrollbars',
            '--mute-audio',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--window-size=800,600',
            '--lang=en-US',
        ]);
    });
});
