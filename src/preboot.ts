/**
 * Determinism preboot — installed via `page.evaluateOnNewDocument`
 * before the page's first `<script>` executes. Makes per-page time,
 * random, and frame scheduling deterministic so two runs produce
 * identical captures when given the same seed.
 *
 * The preboot body is serialized into a string so puppeteer can ship
 * it to the browser; it must be self-contained (no imports).
 */

const DEFAULT_PREBOOT_GLOBAL_NAMESPACE = '__detPreboot';
const PREBOOT_GLOBAL_PLACEHOLDER = '__PREBOOT_GLOBAL__';
const GLOBAL_NAMESPACE_PATTERN = /^[$_A-Za-z][$_0-9A-Za-z]*$/u;

export type PrebootOptions = {
    readonly seed: string;
    /** Milliseconds since epoch used for the fake clock's start point. */
    readonly clockStartMs: number;
    /** How the fake clock advances. `tick` uses harness-driven logical frames; `realtime` follows wall time from the fixed base. */
    readonly clockMode?: 'realtime' | 'tick';
    /** Parameterize the page-side global to avoid collisions across multiple harnesses. */
    readonly globalNamespace?: string;
    /** Replace the Date constructor in addition to Date.now for full wall-clock determinism. */
    readonly replaceDateConstructor?: boolean;
};

const assertValidGlobalNamespace = (globalNamespace: string) => {
    if (!GLOBAL_NAMESPACE_PATTERN.test(globalNamespace)) {
        throw new Error(
            `globalNamespace must be a valid JavaScript identifier. Received ${JSON.stringify(globalNamespace)}.`,
        );
    }
};

/**
 * Returns the preboot script body as an IIFE string. Consumers call
 * `page.evaluateOnNewDocument` with the result.
 *
 * Keep this function pure — no `this`, no outer-scope captures. The
 * page-side preboot record surfaces state so tests can assert the
 * preboot fired and with what seed.
 */
export const buildPrebootScript = ({
    seed,
    clockStartMs,
    clockMode = 'tick',
    globalNamespace = DEFAULT_PREBOOT_GLOBAL_NAMESPACE,
    replaceDateConstructor = false,
}: PrebootOptions): string => {
    assertValidGlobalNamespace(globalNamespace);

    // Deterministic xorshift128+-style PRNG seeded from the string. Kept
    // as a one-file IIFE with no external references.
    const preboot = `(function preboot(seed, clockStartMs, clockMode, replaceDateConstructor) {
        var g = globalThis;
        if (g.${PREBOOT_GLOBAL_PLACEHOLDER}) { return; }
        function hash(str) {
            var h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
            for (var i = 0; i < str.length; i++) {
                var ch = str.charCodeAt(i);
                h1 = Math.imul(h1 ^ ch, 2654435761);
                h2 = Math.imul(h2 ^ ch, 1597334677);
            }
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
            return (4294967296 * (2097151 & h2) + (h1 >>> 0)) / 4503599627370496;
        }
        function prng() {
            prngState = (prngState * 16807) % 2147483647;
            if (prngState === 0) { prngState = 1; }
            return (prngState - 1) / 2147483646;
        }

        // Fake clock
        var fakeNowMs = clockStartMs;
        var manualAdvanceMs = 0;
        var timerId = 1;
        var pendingTimers = {};
        var framesSinceBoot = 0;
        var realPerfNow = performance.now.bind(performance);
        var realtimePerfStartMs = realPerfNow();

        function currentNowMs() {
            if (clockMode === 'realtime') {
                return clockStartMs + manualAdvanceMs + Math.max(0, realPerfNow() - realtimePerfStartMs);
            }
            return fakeNowMs;
        }

        // Math.random
        var realRandom = Math.random;
        var prngState = Math.floor(hash(seed) * 2147483646) + 1;
        Math.random = function () { return prng(); };

        // Date.now is always faked. Constructor replacement is opt-in
        // because many tests only need deterministic sampling points,
        // while parity capture sessions need full wall-clock
        // determinism for apps that call new Date().
        var realDate = Date;
        var realDateNow = Date.now;
        Date.now = function () { return currentNowMs(); };
        if (replaceDateConstructor) {
            var FakeDate = function () {
                var args = Array.prototype.slice.call(arguments);
                if (!(this instanceof FakeDate)) {
                    return new realDate(currentNowMs()).toString();
                }
                if (args.length === 0) {
                    return Reflect.construct(realDate, [currentNowMs()], FakeDate);
                }
                return Reflect.construct(realDate, args, FakeDate);
            };
            FakeDate.now = function () { return currentNowMs(); };
            FakeDate.parse = realDate.parse.bind(realDate);
            FakeDate.UTC = realDate.UTC.bind(realDate);
            FakeDate.prototype = realDate.prototype;
            Object.setPrototypeOf(FakeDate, realDate);
            g.Date = FakeDate;
        }

        // performance
        var performanceNowOverrideInstalled = true;
        try {
            performance.now = function () {
                return clockMode === 'realtime' ? realPerfNow() - realtimePerfStartMs : fakeNowMs - clockStartMs;
            };
        } catch (error) {
            performanceNowOverrideInstalled = false;
            if (g.console && typeof g.console.warn === 'function') {
                g.console.warn('[ushman-preboot] could not override performance.now', error);
            }
        }

        var realRAF = g.requestAnimationFrame;
        var realCAF = g.cancelAnimationFrame;
        var rafQueue = [];
        var rafCallbacksFired = 0;
        var rafPerFrame = [];
        var realSetTimeout = g.setTimeout;
        var realClearTimeout = g.clearTimeout;
        var realSetInterval = g.setInterval;
        var realClearInterval = g.clearInterval;
        var realRequestIdleCallback = g.requestIdleCallback;
        var realCancelIdleCallback = g.cancelIdleCallback;

        if (clockMode === 'tick') {
            // rAF / cancelAF: frame-counted; each rAF runs on the next
            // logical frame rather than real time.
            g.requestAnimationFrame = function (cb) {
                var id = timerId++;
                rafQueue.push({ id: id, cb: cb });
                return id;
            };
            g.cancelAnimationFrame = function (id) {
                rafQueue = rafQueue.filter(function (t) { return t.id !== id; });
            };

            // setTimeout / setInterval: advance on explicit frame tick
            g.setTimeout = function (fn, ms) {
                var args = Array.prototype.slice.call(arguments, 2);
                var id = timerId++;
                pendingTimers[id] = { args: args, fireAtMs: fakeNowMs + (ms || 0), fn: fn, repeatMs: null };
                return id;
            };
            g.clearTimeout = function (id) { delete pendingTimers[id]; };
            g.setInterval = function (fn, ms) {
                var args = Array.prototype.slice.call(arguments, 2);
                var intervalMs = ms || 0;
                var id = timerId++;
                pendingTimers[id] = {
                    args: args,
                    fireAtMs: fakeNowMs + intervalMs,
                    fn: fn,
                    repeatMs: intervalMs,
                };
                return id;
            };
            g.clearInterval = function (id) { delete pendingTimers[id]; };

            // requestIdleCallback stub that just fires on next frame.
            g.requestIdleCallback = function (cb) {
                return g.requestAnimationFrame(function () { cb({ didTimeout: false, timeRemaining: function () { return 16; } }); });
            };
            g.cancelIdleCallback = function (id) { g.cancelAnimationFrame(id); };
        }

        // crypto.randomUUID / getRandomValues — counter-based.
        var uuidCounter = 0;
        function uuidFromCounter() {
            uuidCounter++;
            var hex = uuidCounter.toString(16).padStart(12, '0');
            return '00000000-0000-4000-8000-' + hex;
        }
        if (g.crypto) {
            g.crypto.randomUUID = uuidFromCounter;
            var origGetRandom = g.crypto.getRandomValues;
            g.crypto.getRandomValues = function (typedArray) {
                for (var i = 0; i < typedArray.length; i++) {
                    typedArray[i] = Math.floor(prng() * 256);
                }
                return typedArray;
            };
        }

        /**
         * Advance the logical frame clock by one. Drains the rAF queue
         * and any timers whose fireAt has passed. Called from the
         * harness via evaluate('${PREBOOT_GLOBAL_PLACEHOLDER}.tick(msPerFrame)').
         */
        function tick(msPerFrame) {
            if (clockMode === 'realtime') {
                manualAdvanceMs += (msPerFrame || 16);
                framesSinceBoot += 1;
                rafPerFrame.push(0);
                return;
            }
            fakeNowMs += (msPerFrame || 16);
            framesSinceBoot += 1;
            var pending = rafQueue;
            rafQueue = [];
            rafPerFrame.push(pending.length);
            rafCallbacksFired += pending.length;
            for (var i = 0; i < pending.length; i++) {
                try { pending[i].cb(fakeNowMs - clockStartMs); } catch (e) { /* swallow */ }
            }
            var toFire = [];
            for (var id in pendingTimers) {
                if (pendingTimers[id].fireAtMs <= fakeNowMs) {
                    toFire.push(pendingTimers[id]);
                    if (pendingTimers[id].repeatMs === null) {
                        delete pendingTimers[id];
                    } else {
                        pendingTimers[id].fireAtMs += pendingTimers[id].repeatMs;
                    }
                }
            }
            for (var j = 0; j < toFire.length; j++) {
                var timer = toFire[j];
                try {
                    if (typeof timer.fn === 'function') {
                        timer.fn.apply(undefined, timer.args || []);
                    }
                } catch (e) { /* swallow */ }
            }
        }

        g.${PREBOOT_GLOBAL_PLACEHOLDER} = {
            seed: seed,
            clockStartMs: clockStartMs,
            clockMode: clockMode,
            tick: tick,
            framesSinceBoot: function () { return framesSinceBoot; },
            fakeNowMs: function () { return currentNowMs(); },
            rafCallbacksFired: function () { return rafCallbacksFired; },
            rafPerFrame: function () { return rafPerFrame.slice(); },
            performanceNowOverrideInstalled: function () { return performanceNowOverrideInstalled; },
            // Escape hatches if a test really needs real time / random
            __realRandom: realRandom,
            __realDate: realDate,
            __realDateNow: realDateNow,
            __realPerfNow: realPerfNow,
            __realRAF: realRAF,
            __realCAF: realCAF,
            __realSetInterval: realSetInterval,
            __realClearInterval: realClearInterval,
            __realRequestIdleCallback: realRequestIdleCallback,
            __realCancelIdleCallback: realCancelIdleCallback,
            __realSetTimeout: realSetTimeout,
            __realClearTimeout: realClearTimeout,
        };
    })(${JSON.stringify(seed)}, ${JSON.stringify(clockStartMs)}, ${JSON.stringify(clockMode)}, ${JSON.stringify(replaceDateConstructor)});`;

    return preboot.replaceAll(PREBOOT_GLOBAL_PLACEHOLDER, globalNamespace);
};
