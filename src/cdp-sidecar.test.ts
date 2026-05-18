import { describe, expect, it } from 'bun:test';

import { attachCdpSidecar, type CdpSessionLike } from './cdp-sidecar.ts';

type EventHandler = (event: unknown) => void;

class FakeSession {
    #listeners = new Map<string, Set<EventHandler>>();

    on(eventName: string, handler: EventHandler) {
        const listeners = this.#listeners.get(eventName) ?? new Set<EventHandler>();
        listeners.add(handler);
        this.#listeners.set(eventName, listeners);
        return this;
    }

    off(eventName: string, handler: EventHandler) {
        this.#listeners.get(eventName)?.delete(handler);
        return this;
    }

    emit(eventName: string, payload: unknown) {
        for (const handler of this.#listeners.get(eventName) ?? []) {
            handler(payload);
        }
    }
}

describe('attachCdpSidecar', () => {
    it('should accumulate console, network, and log events until detach', async () => {
        const session = new FakeSession();
        const sidecar = await attachCdpSidecar(session as unknown as CdpSessionLike);

        session.emit('Runtime.consoleAPICalled', {
            args: [{ value: 'hello' }, { value: { ok: true } }],
            stackTrace: {
                callFrames: [{ lineNumber: 7, url: 'https://example.com/app.js' }],
            },
            type: 'log',
        });
        session.emit('Network.requestWillBeSent', {
            request: { method: 'GET', url: 'https://example.com/data.json' },
            requestId: 'request-1',
            timestamp: 1.5,
        });
        session.emit('Network.responseReceived', {
            requestId: 'request-1',
            response: { mimeType: 'application/json', status: 200 },
            timestamp: 2,
        });
        session.emit('Log.entryAdded', {
            entry: {
                level: 'warning',
                text: 'csp warning',
                timestamp: 123,
                url: 'https://example.com',
            },
        });

        const beforeDetach = sidecar.snapshot();
        expect(beforeDetach.console).toHaveLength(1);
        expect(beforeDetach.console[0]).toEqual(
            expect.objectContaining({
                level: 'log',
                lineNumber: 7,
                text: 'hello {"ok":true}',
                url: 'https://example.com/app.js',
            }),
        );
        expect(beforeDetach.network).toEqual([
            {
                completedAtMs: 2000,
                method: 'GET',
                mimeType: 'application/json',
                startedAtMs: 1500,
                status: 200,
                url: 'https://example.com/data.json',
            },
        ]);
        expect(beforeDetach.logEntries).toEqual([
            {
                level: 'warning',
                text: 'csp warning',
                ts: 123,
                url: 'https://example.com',
            },
        ]);

        await sidecar.detach();

        session.emit('Runtime.consoleAPICalled', {
            args: [{ value: 'after-detach' }],
            type: 'log',
        });

        expect(sidecar.snapshot()).toEqual(beforeDetach);
    });

    it('should classify unhandled promise rejections without losing the page error', async () => {
        const session = new FakeSession();
        const sidecar = await attachCdpSidecar(session as unknown as CdpSessionLike);

        session.emit('Runtime.exceptionThrown', {
            exceptionDetails: {
                exception: {
                    description: 'Uncaught (in promise) Error: boom\n    at app.ts:10:2',
                },
                text: 'Uncaught (in promise)',
            },
        });

        const snapshot = sidecar.snapshot();
        expect(snapshot.pageErrors).toHaveLength(1);
        expect(snapshot.unhandledRejections).toHaveLength(1);
        expect(snapshot.unhandledRejections[0]?.message).toContain('Uncaught (in promise) Error: boom');
    });
});
