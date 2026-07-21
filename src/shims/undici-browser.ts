// Turbopack resolveAlias target for browser bundles (see next.config.ts).
// @vercel/blob's own code imports fetch from "undici" unconditionally;
// their package.json "browser" field remaps that to a shim like this one,
// but Turbopack (unlike webpack) doesn't honor that legacy convention, so
// the real Node-only undici was ending up in the browser bundle and
// breaking every direct-to-Blob upload. Redirecting "undici" here for
// browser builds restores the intended behavior: just use native fetch.
export const fetch = globalThis.fetch.bind(globalThis);
