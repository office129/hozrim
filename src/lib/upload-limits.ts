// Vercel's serverless functions cap request bodies at ~4.5MB. Video/audio
// normally bypass this via a direct-to-Blob browser upload (see
// blob-upload-client.ts), but that path silently isn't available when
// Blob storage isn't configured (e.g. local dev on disk storage) — in
// that fallback case, anything bigger than this needs a Google Drive
// link instead of a doomed upload attempt.
export const MAX_DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;
