import { describe, expect, it, mock } from 'bun:test';

const importChromeResolve = async (suffix: string) => {
    return import(`./chrome-resolve.ts?case=${suffix}`);
};

describe('resolveChromeExecutable', () => {
    it('should prefer an installed Chrome for Testing binary from the cache', async () => {
        const access = mock(async (candidate: string, mode: number) => {
            expect(mode).toBe(1);
            if (candidate === '/Users/test/.ushman/chrome-for-testing/chrome') {
                return;
            }
            throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        });

        mock.module('node:fs/promises', () => ({
            access,
            constants: { X_OK: 1 },
        }));
        mock.module('node:os', () => ({
            homedir: () => '/Users/test',
            platform: () => 'darwin',
        }));
        mock.module('@puppeteer/browsers', () => ({
            Browser: { CHROME: 'chrome' },
            detectBrowserPlatform: () => 'mac_arm',
            getInstalledBrowsers: async ({ cacheDir }: { cacheDir: string }) => {
                if (cacheDir !== '/Users/test/.ushman/chrome-for-testing') {
                    return [];
                }
                return [
                    {
                        browser: 'chrome',
                        buildId: '136.0.7103.92',
                        executablePath: '/Users/test/.ushman/chrome-for-testing/chrome',
                        platform: 'mac_arm',
                    },
                ];
            },
        }));

        const { resolveChromeExecutable } = await importChromeResolve('cache-first');
        expect(await resolveChromeExecutable()).toBe('/Users/test/.ushman/chrome-for-testing/chrome');
    });

    it('should fall back to system Chrome candidates when no cache hit exists', async () => {
        const access = mock(async (candidate: string) => {
            if (candidate === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') {
                return;
            }
            throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        });

        mock.module('node:fs/promises', () => ({
            access,
            constants: { X_OK: 1 },
        }));
        mock.module('node:os', () => ({
            homedir: () => '/Users/test',
            platform: () => 'darwin',
        }));
        mock.module('@puppeteer/browsers', () => ({
            Browser: { CHROME: 'chrome' },
            detectBrowserPlatform: () => 'mac_arm',
            getInstalledBrowsers: async () => [],
        }));

        const { resolveChromeExecutable } = await importChromeResolve('system-fallback');
        expect(await resolveChromeExecutable()).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    });

    it('should return null when no executable can be resolved', async () => {
        mock.module('node:fs/promises', () => ({
            access: async () => {
                throw Object.assign(new Error('missing'), { code: 'ENOENT' });
            },
            constants: { X_OK: 1 },
        }));
        mock.module('node:os', () => ({
            homedir: () => '/Users/test',
            platform: () => 'darwin',
        }));
        mock.module('@puppeteer/browsers', () => ({
            Browser: { CHROME: 'chrome' },
            detectBrowserPlatform: () => 'mac_arm',
            getInstalledBrowsers: async () => [],
        }));

        const { resolveChromeExecutable } = await importChromeResolve('no-hit');
        expect(await resolveChromeExecutable()).toBeNull();
    });
});
