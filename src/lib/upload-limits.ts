// Vercel's serverless functions cap request bodies at ~4.5MB — anything
// bigger needs to go through a Google Drive link instead, since direct
// browser-to-Blob uploads aren't usable in this project (see git history:
// @vercel/blob's client bundle depends on a Node-only "undici" import that
// Turbopack doesn't remap to its browser-safe shim).
export const MAX_DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;
