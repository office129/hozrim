"use client";

import { upload } from "@vercel/blob/client";
import type { UploadKind } from "./storage";

let blobEnabled: Promise<boolean> | null = null;

function isBlobEnabled(): Promise<boolean> {
  if (!blobEnabled) {
    blobEnabled = fetch("/api/admin/blob-status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => !!data.enabled)
      .catch(() => false);
  }
  return blobEnabled;
}

// Uploads straight from the browser to Vercel Blob (bypassing our server's
// ~4.5MB request body limit), when Blob storage is configured. Returns null
// when it isn't (e.g. local dev on disk storage) so the caller can fall
// back to the old server-proxied upload — a genuine rejection (file too
// big/wrong type) throws instead, since retrying that through the fallback
// path would only hit the same body-size wall with a worse error.
//
// Only used for video/audio (which can genuinely exceed the body-size
// limit) — PDFs, generic files, and profile photos are always comfortably
// small, so they go through the simpler, already-proven server-proxied
// upload exclusively rather than exercising this fussier browser-side path.
export async function tryUploadFileDirect(
  file: File,
  kind: UploadKind,
  scope: string
): Promise<{ url: string; fileName: string } | null> {
  if (!(await isBlobEnabled())) return null;

  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot) : "";
  const pathname = `${scope}/${crypto.randomUUID()}${ext}`;

  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/admin/blob-token",
    clientPayload: kind,
  });
  return { url: blob.url, fileName: file.name };
}
