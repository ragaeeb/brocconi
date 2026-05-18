/**
 * CDP sidecar — attaches to a Puppeteer CDP session and captures the
 * non-DOM signals (console, exceptions, network, log entries) that
 * rrweb or other DOM-focused recorders don't cover.
 *
 * The captured record is flat and serializable into the `SignalsCapture`
 * schema structure by the adapter's `signals` stage.
 */

export type ConsoleRecord = {
    readonly level: 'log' | 'debug' | 'info' | 'warning' | 'error' | 'other';
    readonly text: string;
    readonly url?: string;
    readonly lineNumber?: number;
    readonly ts: number;
};

export type PageErrorRecord = {
    readonly message: string;
    readonly stack?: string;
    readonly ts: number;
};

export type NetworkRequestRecord = {
    readonly method: string;
    readonly url: string;
    readonly status?: number;
    readonly startedAtMs: number;
    readonly completedAtMs?: number;
    readonly failureText?: string;
    readonly mimeType?: string;
};

export type CdpTranscript = {
    readonly console: ConsoleRecord[];
    readonly pageErrors: PageErrorRecord[];
    readonly unhandledRejections: PageErrorRecord[];
    readonly network: NetworkRequestRecord[];
    readonly logEntries: ConsoleRecord[];
};

export type CdpSidecar = {
    /** Current snapshot. Safe to read at any time; callers should not mutate. */
    snapshot(): CdpTranscript;
    detach(): Promise<void>;
};

export type CdpSessionLike = {
    on<Event>(eventName: string, handler: (event: Event) => void): unknown;
    off<Event>(eventName: string, handler: (event: Event) => void): unknown;
};

type MutableTranscript = {
    console: ConsoleRecord[];
    pageErrors: PageErrorRecord[];
    unhandledRejections: PageErrorRecord[];
    network: NetworkRequestRecord[];
    logEntries: ConsoleRecord[];
};

type ConsoleApiEvent = {
    type: string;
    args: Array<{ value?: unknown; description?: string }>;
    stackTrace?: { callFrames: Array<{ url: string; lineNumber: number }> };
};

type ExceptionThrownEvent = {
    exceptionDetails: {
        text: string;
        exception?: { description?: string };
    };
};

type ResponseReceivedEvent = {
    requestId: string;
    response: { status: number; mimeType: string };
    timestamp: number;
};

const NOW = (): number => Date.now();

const getConsoleLevel = (type: string): ConsoleRecord['level'] => {
    const levelMap: Record<string, ConsoleRecord['level']> = {
        debug: 'debug',
        error: 'error',
        info: 'info',
        log: 'log',
        warning: 'warning',
    };
    return levelMap[type] ?? 'other';
};

const getConsoleText = (event: ConsoleApiEvent): string =>
    event.args
        .map((arg) => {
            if (arg.value !== undefined) {
                return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
            }
            return arg.description ?? '';
        })
        .join(' ');

const toPageErrorRecord = (event: ExceptionThrownEvent): PageErrorRecord => {
    const message = event.exceptionDetails.exception?.description ?? event.exceptionDetails.text;
    return {
        message,
        stack: event.exceptionDetails.exception?.description,
        ts: NOW(),
    };
};

const isUnhandledRejection = (record: PageErrorRecord): boolean => /Uncaught \(in promise\)/u.test(record.message);

/**
 * Attaches a CDP sidecar to the given session.
 *
 * The session must already have `Runtime.enable`, `Console.enable`,
 * `Network.enable`, and `Log.enable` called on it — we don't enable
 * them here so callers can choose to disable individual surfaces
 * (e.g. a scene-heavy sub-adapter may disable `Console.enable` if it
 * wants only its own `Runtime` listeners).
 */
export const attachCdpSidecar = async (session: CdpSessionLike): Promise<CdpSidecar> => {
    const transcript: MutableTranscript = {
        console: [],
        logEntries: [],
        network: [],
        pageErrors: [],
        unhandledRejections: [],
    };

    const requestIndex = new Map<string, NetworkRequestRecord>();
    const detachers: Array<() => void> = [];

    const replaceNetworkRecord = (
        requestId: string,
        transform: (record: NetworkRequestRecord) => NetworkRequestRecord,
    ) => {
        const existing = requestIndex.get(requestId);
        if (!existing) {
            return;
        }

        const updated = transform(existing);
        const index = transcript.network.indexOf(existing);
        if (index >= 0) {
            transcript.network[index] = updated;
        }
        requestIndex.set(requestId, updated);
    };

    // Console: Runtime.consoleAPICalled is richer than Console.messageAdded.
    const onConsoleApi = (event: ConsoleApiEvent) => {
        const frame = event.stackTrace?.callFrames[0];
        transcript.console.push({
            level: getConsoleLevel(event.type),
            lineNumber: frame?.lineNumber,
            text: getConsoleText(event),
            ts: NOW(),
            url: frame?.url,
        });
    };
    session.on('Runtime.consoleAPICalled', onConsoleApi);
    detachers.push(() => session.off('Runtime.consoleAPICalled', onConsoleApi));

    // Page errors / uncaught exceptions.
    const onException = (event: ExceptionThrownEvent) => {
        const record = toPageErrorRecord(event);
        transcript.pageErrors.push(record);
        if (isUnhandledRejection(record)) {
            transcript.unhandledRejections.push(record);
        }
    };
    session.on('Runtime.exceptionThrown', onException);
    detachers.push(() => session.off('Runtime.exceptionThrown', onException));

    // Network request lifecycle.
    const onRequestWillBeSent = (event: {
        requestId: string;
        request: { method: string; url: string };
        timestamp: number;
    }) => {
        const record: NetworkRequestRecord = {
            method: event.request.method,
            startedAtMs: event.timestamp * 1000,
            url: event.request.url,
        };
        requestIndex.set(event.requestId, record);
        transcript.network.push(record);
    };
    session.on('Network.requestWillBeSent', onRequestWillBeSent);
    detachers.push(() => session.off('Network.requestWillBeSent', onRequestWillBeSent));

    const onResponseReceived = (event: ResponseReceivedEvent) => {
        replaceNetworkRecord(event.requestId, (record) => ({
            ...record,
            completedAtMs: event.timestamp * 1000,
            mimeType: event.response.mimeType,
            status: event.response.status,
        }));
    };
    session.on('Network.responseReceived', onResponseReceived);
    detachers.push(() => session.off('Network.responseReceived', onResponseReceived));

    const onLoadingFailed = (event: { requestId: string; errorText: string; timestamp: number }) => {
        replaceNetworkRecord(event.requestId, (record) => ({
            ...record,
            completedAtMs: event.timestamp * 1000,
            failureText: event.errorText,
        }));
    };
    session.on('Network.loadingFailed', onLoadingFailed);
    detachers.push(() => session.off('Network.loadingFailed', onLoadingFailed));

    // Log.entryAdded — browser-level log events (CSP violations, etc.)
    const onLogEntry = (event: { entry: { level: string; text: string; timestamp: number; url?: string } }) => {
        transcript.logEntries.push({
            level: getConsoleLevel(event.entry.level),
            text: event.entry.text,
            ts: event.entry.timestamp,
            url: event.entry.url,
        });
    };
    session.on('Log.entryAdded', onLogEntry);
    detachers.push(() => session.off('Log.entryAdded', onLogEntry));

    return {
        detach: async () => {
            for (const detach of detachers) {
                detach();
            }
        },
        snapshot: () => ({
            console: [...transcript.console],
            logEntries: [...transcript.logEntries],
            network: [...transcript.network],
            pageErrors: [...transcript.pageErrors],
            unhandledRejections: [...transcript.unhandledRejections],
        }),
    };
};
