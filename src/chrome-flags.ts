/**
 * Chrome command-line flags for our Puppeteer harness.
 *
 * Local-Mac only per plan §6 + §9.6; the SwANGLE blocking-lane
 * flags (synthesis 1) are sketched but commented out until CI lands
 * post-cutover. The active flag set keeps headless + sandbox-off for
 * local runs; plan §9.6 explicitly defers the two-lane CI recipe.
 */

export type ChromeFlagOptions = {
    readonly headless: boolean;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly additionalFlags?: readonly string[];
};

export const buildChromeFlags = (options: ChromeFlagOptions): string[] => {
    const { headless, viewport, additionalFlags = [] } = options;
    const flags: string[] = [];
    if (headless) {
        flags.push('--headless=new');
    }
    flags.push('--no-sandbox');
    flags.push('--disable-dev-shm-usage');
    flags.push('--hide-scrollbars');
    flags.push('--mute-audio');
    // Deterministic rendering surface: force the same compositor
    // behaviour on local Macs across runs. These are safe on macOS.
    flags.push('--disable-background-timer-throttling');
    flags.push('--disable-backgrounding-occluded-windows');
    flags.push('--disable-renderer-backgrounding');
    // CI will add: '--use-gl=angle --use-angle=swiftshader'
    //              '--deterministic-mode'
    //              '--enable-begin-frame-control' (Linux-only)
    flags.push(`--window-size=${viewport.width},${viewport.height}`);
    flags.push(...additionalFlags);
    return flags;
};
