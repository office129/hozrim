"use client";

// Google's resumable-upload endpoint doesn't reliably support direct
// browser-to-Google CORS uploads (confirmed the hard way — see commit
// history), and Vercel's ~4.5MB function body limit rules out simply
// proxying the whole file through our own server. So instead: the file is
// split into chunks small enough to fit through our server one at a time,
// and our server relays each chunk to Google over a plain server-to-server
// fetch (never subject to browser CORS at all, since CORS only applies to
// browser-initiated cross-origin requests).
//
// 4 MiB — a multiple of 256 KiB, which Google's resumable protocol
// requires for every chunk except the last, and comfortably under
// Vercel's per-request body limit.
const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_CHUNK_RETRIES = 3;

let driveConnected: Promise<boolean> | null = null;

function isDriveConnected(): Promise<boolean> {
  if (!driveConnected) {
    driveConnected = fetch("/api/admin/drive-oauth/status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { connected: false }))
      .then((data) => !!data.connected)
      .catch(() => false);
  }
  return driveConnected;
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
  const res = await fetch("/api/admin/drive-upload/relay", {
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

async function uploadViaInit(
  file: File,
  initBody: Record<string, unknown>,
  onProgress?: (percentage: number) => void
): Promise<{ url: string; fileName: string } | null> {
  if (!(await isDriveConnected())) return null;

  const initRes = await fetch("/api/admin/drive-upload/init", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(initBody),
  });
  if (!initRes.ok) return null; // no folder linked (yet), or Drive unreachable

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

// Uploads a file into the given client's linked Drive folder, using the
// coach's own storage instead of Vercel Blob. Returns null when Drive isn't
// connected or the client has no folder linked yet, so the caller can fall
// back to the existing Blob/local path.
export async function tryUploadFileToDrive(
  file: File,
  clientId: string,
  folder: "main" | "exercises",
  onProgress?: (percentage: number) => void,
  sessionId?: string
): Promise<{ url: string; fileName: string } | null> {
  return uploadViaInit(
    file,
    {
      clientId,
      folder,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      sessionId,
    },
    onProgress
  );
}

// Same idea, for a general (not per-client) opening-content library item.
export async function tryUploadLibraryFileToDrive(
  file: File,
  libraryItemId: string,
  onProgress?: (percentage: number) => void
): Promise<{ url: string; fileName: string } | null> {
  return uploadViaInit(
    file,
    {
      folder: "library",
      libraryItemId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    },
    onProgress
  );
}
