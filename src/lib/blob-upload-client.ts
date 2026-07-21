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
// back to the old server-proxied upload for small files. Only used for
// video/audio, which can genuinely exceed the body-size limit.
export async function tryUploadFileDirect(
  file: File,
  kind: UploadKind,
  scope: string,
  onProgress?: (percentage: number) => void
): Promise<{ url: string; fileName: string } | null> {
  if (!(await isBlobEnabled())) return null;

  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot) : "";
  const pathname = `${scope}/${crypto.randomUUID()}${ext}`;

  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/admin/blob-token",
    clientPayload: kind,
    onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
  });
  return { url: blob.url, fileName: file.name };
}
