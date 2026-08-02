"use client";

// Client-facing counterpart of drive-upload-client.ts (which is admin-
// only) - same chunked-relay approach for the same reasons (Google's
// resumable endpoint doesn't reliably support direct browser-to-Google
// CORS uploads, and Vercel's function body limit rules out proxying the
// whole file at once).
const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_CHUNK_RETRIES = 3;

let driveEnabled: Promise<boolean> | null = null;

function isDriveEnabled(): Promise<boolean> {
  if (!driveEnabled) {
    driveEnabled = fetch("/api/drive/status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => !!data.enabled)
      .catch(() => false);
  }
  return driveEnabled;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function relayChunk(
  uploadUrl: string,
  chunk: Blob,
  contentRange: string,
  mimeType: string
): Promise<{ done: boolean; fileId?: string }> {
  const res = await fetch("/api/client/drive-upload/relay", {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Drive-Upload-Url": uploadUrl,
      "X-Drive-Content-Type": mimeType,
      "Content-Range": contentRange,
    },
    body: chunk,
  });
  if (!res.ok) throw new Error("העלאה לדרייב נכשלה");
  const data = (await res.json()) as { done: boolean; file?: { id: string } };
  return { done: data.done, fileId: data.file?.id };
}

// Uploads a personal file straight into the client's own "ההעלאות שלי"
// Drive folder. Returns null when Drive isn't connected (or the client
// has no Drive folder yet), so the caller can fall back to the Blob/local
// path via POST /api/client/uploads.
export async function tryUploadPersonalFileToDrive(
  file: File,
  onProgress?: (percentage: number) => void
): Promise<{ url: string; fileName: string } | null> {
  if (!(await isDriveEnabled())) return null;

  const initRes = await fetch("/api/client/drive-upload/init", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    }),
  });
  if (!initRes.ok) return null; // no Drive folder linked (yet), or Drive unreachable

  const { uploadUrl } = (await initRes.json()) as { uploadUrl: string };
  const mimeType = file.type || "application/octet-stream";
  const total = file.size;

  let offset = 0;
  let fileId: string | null = null;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);
    const contentRange = `bytes ${offset}-${end - 1}/${total}`;

    let attempt = 0;
    for (;;) {
      try {
        const result = await relayChunk(uploadUrl, chunk, contentRange, mimeType);
        if (result.done) fileId = result.fileId ?? null;
        break;
      } catch (err) {
        attempt += 1;
        if (attempt > MAX_CHUNK_RETRIES) throw err;
        await sleep(1000 * attempt);
      }
    }

    offset = end;
    if (onProgress) onProgress(Math.round((offset / total) * 100));
  }

  if (!fileId) throw new Error("העלאה לדרייב לא הושלמה");
  return { url: `https://drive.google.com/file/d/${fileId}/view`, fileName: file.name };
}
