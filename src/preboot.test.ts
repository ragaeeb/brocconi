import { describe, expect, it } from 'bun:test';

import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { buildPrebootScript } from './preboot.ts';

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

const runPreboot = ({
    clockMode = 'tick',
    globalNamespace = '__detPreboot',
    replaceDateConstructor,
}: {
    clockMode?: 'realtime' | 'tick';
    globalNamespace?: string;
    replaceDateConstructor: boolean;
}) => {
    let performanceNowMs = 1234;
    const performance = {
        now: () => performanceNowMs,
    };
    const crypto = {
        getRandomValues<T extends ArrayBufferView>(typedArray: T) {
            return typedArray;
        },
        randomUUID: () => 'real-uuid',
    };
    const context: Record<string, any> = {
        Array,
        Buffer,
        crypto,
        Date,
        globalThis: {} as Record<string, any>,
        JSON,
        Math,
        Object,
        performance,
        Reflect,
    };
    context.globalThis = context;
    runInNewContext(
        buildPrebootScript({
            clockMode,
            clockStartMs: Date.UTC(2026, 0, 1, 0, 0, 0),
            globalNamespace,
            replaceDateConstructor,
            seed: 'preboot-test',
        }),
        context,
    );
    return {
        context,
        preboot: context[globalNamespace] as {
            tick: (msPerFrame: number) => void;
        },
        setPerformanceNow: (value: number) => {
            performanceNowMs = value;
        },
    };
};

describe('buildPrebootScript', () => {
    it('should keep the Date constructor real by default', () => {
        const { context } = runPreboot({ replaceDateConstructor: false });

        expect(context.Date.now()).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
        expect(new context.Date().getTime()).not.toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
        expect(new context.Date(123).getTime()).toBe(123);
    });

    it('should replace the Date constructor for full wall-clock determinism', () => {
        const { context } = runPreboot({ replaceDateConstructor: true });

        expect(context.Date.now()).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
        expect(new context.Date().getTime()).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
        expect(new context.Date('2026-05-01T00:00:00.000Z').toISOString()).toBe('2026-05-01T00:00:00.000Z');
        expect(new context.Date(123).getTime()).toBe(123);
        expect(new context.Date() instanceof context.Date).toBe(true);
        expect(context.Date()).toBe(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toString());
        expect((context.Date as unknown as (value: string) => string)('2026-05-01')).toBe(
            new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toString(),
        );
        expect(context.Date.parse('2026-01-02T00:00:00.000Z')).toBe(Date.parse('2026-01-02T00:00:00.000Z'));
        expect(context.Date.UTC(2026, 0, 2)).toBe(Date.UTC(2026, 0, 2));
    });

    it('should advance the realtime clock while keeping deterministic random stubs', () => {
        const { context, setPerformanceNow } = runPreboot({
            clockMode: 'realtime',
            replaceDateConstructor: true,
        });

        expect(context.Date.now()).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
        setPerformanceNow(1334);
        expect(context.Date.now()).toBe(Date.UTC(2026, 0, 1, 0, 0, 0) + 100);
        expect(context.performance.now()).toBe(100);
        expect(context.Math.random()).not.toBe(context.Math.random());
        const values = new Uint8Array(4);
        expect(context.crypto.getRandomValues(values)).toBe(values);
        expect(context.Date.now()).toBe(Date.UTC(2026, 0, 1, 0, 0, 0) + 100);
    });

    it('should forward timer callback arguments and repeat intervals in tick mode', () => {
        const { preboot, context } = runPreboot({ replaceDateConstructor: true });
        const timeoutCalls: string[] = [];
        const intervalCalls: string[] = [];

        context.setTimeout(
            (first: string, second: string) => {
                timeoutCalls.push(`${first}:${second}`);
            },
            16,
            'a',
            'b',
        );
        const intervalId = context.setInterval(
            (value: string) => {
                intervalCalls.push(value);
            },
            16,
            'tick',
        );

        preboot.tick(16);
        preboot.tick(16);
        context.clearInterval(intervalId);
        preboot.tick(16);

        expect(timeoutCalls).toEqual(['a:b']);
        expect(intervalCalls).toEqual(['tick', 'tick']);
    });

    it('should allow callers to override the page-side global namespace', () => {
        const globalNamespace = '__customNs';
        const { context } = runPreboot({
            globalNamespace,
            replaceDateConstructor: true,
        });

        const script = buildPrebootScript({
            clockStartMs: Date.UTC(2026, 0, 1, 0, 0, 0),
            globalNamespace,
            replaceDateConstructor: true,
            seed: 'preboot-test',
        });

        expect(script).toContain(globalNamespace);
        expect(script).not.toContain('__detPreboot');
        expect(context[globalNamespace].seed).toBe('preboot-test');
        expect(context.__detPreboot).toBeUndefined();
    });

    it('should preserve the legacy ushman preboot bytes when requested', () => {
        const script = buildPrebootScript({
            clockMode: 'realtime',
            clockStartMs: 1_700_000_000_000,
            globalNamespace: '__ushmanPreboot',
            replaceDateConstructor: true,
            seed: '42',
        });

        expect(sha256Hex(script)).toBe('8f5e81cbceea2e6f1685ee952694688edc20aa3ec06b80b51b46d74d2de802e6');
    });
});
