import { copyFileSync } from "fs";
import { createRequire } from "module";

// react-pdf needs pdf.js's worker script served as a plain static file —
// copying it into public/ (rather than relying on bundler-specific worker
// loading) works the same regardless of bundler (webpack, Turbopack, ...).
// Re-run on every install so it stays in sync with whatever pdfjs-dist
// version is actually installed (a version mismatch between the main
// bundle and the worker throws at runtime).
const require = createRequire(import.meta.url);
copyFileSync(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"), "public/pdf.worker.min.mjs");
