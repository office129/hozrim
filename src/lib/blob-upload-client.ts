"use client";

import { upload } from "@vercel/blob/client";
import type { UploadKind } from "./storage";

type Role = "admin" | "client";

const ENDPOINTS: Record<Role, { status: string; token: string }> = {
  admin: { status: "/api/admin/blob-status", token: "/api/admin/blob-token" },
  client: { status: "/api/client/blob-status", token: "/api/client/blob-token" },
};

const blobEnabled: Partial<Record<Role, Promise<boolean>>> = {};

function isBlobEnabled(role: Role): Promise<boolean> {
  if (!blobEnabled[role]) {
    blobEnabled[role] = fetch(ENDPOINTS[role].status, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => !!data.enabled)
      .catch(() => false);
  }
  return blobEnabled[role]!;
}

// Uploads straight from the browser to Vercel Blob (bypassing our server's
// ~4.5MB request body limit), when Blob storage is configured. Returns null
// when it isn't (e.g. local dev on disk storage) so the caller can fall
// back to the old server-proxied upload — a genuine rejection (file too
// big/wrong type) throws instead, since retrying that through the fallback
// path would only hit the same body-size wall with a worse error.
export async function tryUploadFileDirect(
  file: File,
  kind: UploadKind,
  scope: string,
  role: Role = "admin"
): Promise<{ url: string; fileName: string } | null> {
  if (!(await isBlobEnabled(role))) return null;

  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot) : "";
  const pathname = `${scope}/${crypto.randomUUID()}${ext}`;

  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: ENDPOINTS[role].token,
    clientPayload: kind,
  });
  return { url: blob.url, fileName: file.name };
}
