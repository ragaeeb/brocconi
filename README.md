# brocconi

`brocconi` is a small Bun-first library for deterministic browser harnessing: a preboot script generator, a CDP sidecar for non-DOM signals, stable Chrome launch flags, and Chrome executable resolution.

## Who This Is For

- Puppeteer users who need deterministic captures or reproducible screenshots.
- Playwright users who want a stable pre-navigation time/random stub.
- Visual regression tooling that needs repeatable browser timing.
- Scrapers and replay frameworks that want CDP-sidecar signals alongside DOM capture.

## What It Exports

```ts
import {
    attachCdpSidecar,
    buildChromeFlags,
    buildPrebootScript,
    resolveChromeExecutable,
} from 'brocconi';
```

- `buildPrebootScript(...)`: creates the page-side deterministic preboot source for `evaluateOnNewDocument`.
- `attachCdpSidecar(session)`: records console, exception, rejection, network, and log events from a CDP session.
- `buildChromeFlags(...)`: builds a deterministic Chrome argument list.
- `resolveChromeExecutable()`: finds a Chrome for Testing install or a common system Chrome binary.

## Usage

```ts
import puppeteer from 'puppeteer-core';
import {
    attachCdpSidecar,
    buildChromeFlags,
    buildPrebootScript,
    resolveChromeExecutable,
} from 'brocconi';

const executablePath = await resolveChromeExecutable();
if (!executablePath) {
    throw new Error('Chrome not found.');
}

const browser = await puppeteer.launch({
    args: buildChromeFlags({
        headless: true,
        viewport: { width: 1280, height: 720 },
    }),
    executablePath,
    headless: true,
});

const page = await browser.newPage();
await page.evaluateOnNewDocument(
    buildPrebootScript({
        seed: 'capture-42',
        clockStartMs: Date.UTC(2026, 0, 1, 0, 0, 0),
        replaceDateConstructor: true,
    }),
);

const session = await page.createCDPSession();
await session.send('Runtime.enable');
await session.send('Network.enable', {});
await session.send('Log.enable');

const sidecar = await attachCdpSidecar(session);
await page.goto('https://example.com', { waitUntil: 'load' });

console.log(sidecar.snapshot());

await sidecar.detach();
await browser.close();
```

## Preboot Namespace

`buildPrebootScript(...)` defaults to the package namespace `__detPreboot`.

If you are migrating an existing ushman harness and need exact legacy byte stability, pass:

```ts
buildPrebootScript({
    seed: 'capture-42',
    clockStartMs: Date.UTC(2026, 0, 1, 0, 0, 0),
    globalNamespace: '__ushmanPreboot',
});
```

That keeps ushman's existing page probes and pinned preboot hash stable while still letting other consumers use a clearer package-local namespace.

## Resolution Order

`resolveChromeExecutable()` checks, in order:

1. ushman's Chrome for Testing cache at `~/.ushman/chrome-for-testing`
2. Puppeteer's default cache at `~/.cache/puppeteer` or `PUPPETEER_CACHE_DIR`
3. Common system Chrome / Chromium locations

## Development

```bash
bun install
bun run lint
bun run typecheck
bun test
bun run build
```
