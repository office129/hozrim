import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @vercel/blob's client bundle imports fetch from "undici" (Node-only);
  // their package.json "browser" field is meant to swap that for a
  // fetch-based shim, but Turbopack doesn't apply that convention the way
  // webpack does. This redirects it ourselves for browser builds so
  // direct-to-Blob uploads work correctly. See src/shims/undici-browser.ts.
  turbopack: {
    resolveAlias: {
      undici: {
        browser: "./src/shims/undici-browser.ts",
      },
    },
  },
};

export default nextConfig;
