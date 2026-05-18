export {
    attachCdpSidecar,
    type CdpSessionLike,
    type CdpSidecar,
    type CdpTranscript,
    type ConsoleRecord,
    type NetworkRequestRecord,
    type PageErrorRecord,
} from './cdp-sidecar.ts';
export { buildChromeFlags, type ChromeFlagOptions } from './chrome-flags.ts';
export { resolveChromeExecutable } from './chrome-resolve.ts';
export { buildPrebootScript, type PrebootOptions } from './preboot.ts';
