/**
 * Best-effort Chrome for Testing / system Chrome binary resolution.
 *
 * The resolver checks ushman's pinned Chrome for Testing cache first,
 * then Puppeteer's default cache, then a small set of system binaries.
 */

import { access, constants } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { Browser, detectBrowserPlatform, getInstalledBrowsers } from '@puppeteer/browsers';

const SYSTEM_CANDIDATE_PATHS: Record<string, string[]> = {
    darwin: [
        '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    linux: ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'],
};

const BUILD_ID_COLLATOR = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
});

const isExecutable = async (candidate: string): Promise<boolean> => {
    try {
        await access(candidate, constants.X_OK);
        return true;
    } catch {
        return false;
    }
};

const getCacheDirectories = (): string[] => {
    const homeDirectory = homedir();
    const puppeteerCacheDir = process.env.PUPPETEER_CACHE_DIR ?? path.join(homeDirectory, '.cache', 'puppeteer');
    return [...new Set([path.join(homeDirectory, '.ushman', 'chrome-for-testing'), puppeteerCacheDir])];
};

const resolveInstalledChromeExecutable = async (cacheDir: string): Promise<string | null> => {
    const browserPlatform = detectBrowserPlatform();
    if (!browserPlatform) {
        return null;
    }

    try {
        const installedBrowsers = await getInstalledBrowsers({ cacheDir });
        const installedChrome = installedBrowsers
            .filter((installedBrowser) => {
                return installedBrowser.browser === Browser.CHROME && installedBrowser.platform === browserPlatform;
            })
            .sort((left, right) => BUILD_ID_COLLATOR.compare(right.buildId, left.buildId))[0];

        if (!installedChrome) {
            return null;
        }

        return (await isExecutable(installedChrome.executablePath)) ? installedChrome.executablePath : null;
    } catch {
        return null;
    }
};

export const resolveChromeExecutable = async (): Promise<string | null> => {
    for (const cacheDir of getCacheDirectories()) {
        const installedChrome = await resolveInstalledChromeExecutable(cacheDir);
        if (installedChrome) {
            return installedChrome;
        }
    }

    const candidates = SYSTEM_CANDIDATE_PATHS[platform()] ?? [];
    for (const candidate of candidates) {
        if (await isExecutable(candidate)) {
            return candidate;
        }
    }

    return null;
};
