import { mkdir, unlink, stat, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { put, del } from "@vercel/blob";

const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "./storage/uploads");

// On Vercel (or anywhere BLOB_READ_WRITE_TOKEN is set) uploads go to Vercel
// Blob, whose storage is actually persistent across deploys/instances.
// Local disk works fine for local development but does NOT survive a
// serverless redeploy, so it's only the fallback when no token is set.
const useBlobStorage = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export type UploadKind = "video" | "audio" | "pdf" | "file" | "image";

export const KIND_RULES: Record<UploadKind, { mimePrefixes: string[]; maxBytes: number; exts: string[] }> = {
  video: { mimePrefixes: ["video/"], maxBytes: 1024 * 1024 * 1024, exts: [".mp4", ".mov", ".webm", ".m4v", ".ogv"] },
  audio: { mimePrefixes: ["audio/"], maxBytes: 300 * 1024 * 1024, exts: [".mp3", ".wav", ".m4a", ".ogg", ".aac", ".webm"] },
  pdf: { mimePrefixes: ["application/pdf"], maxBytes: 30 * 1024 * 1024, exts: [".pdf"] },
  file: { mimePrefixes: [], maxBytes: 100 * 1024 * 1024, exts: [] }, // any file type, used by the library "קובץ" slot
  image: { mimePrefixes: ["image/"], maxBytes: 10 * 1024 * 1024, exts: [".jpg", ".jpeg", ".png", ".webp", ".gif"] },
};

// Shared between the admin and client blob-token routes so client-side
// direct uploads get the same content-type gate as the corresponding
// server-proxied fallback path.
export const ALLOWED_CONTENT_TYPES: Record<UploadKind, string[] | undefined> = {
  video: ["video/*"],
  audio: ["audio/*"],
  pdf: ["application/pdf"],
  file: undefined,
  image: ["image/*"],
};

export class UploadValidationError extends Error {}

function extFromName(name: string) {
  const ext = path.extname(name || "").toLowerCase();
  return ext || "";
}

// scope is a path segment, e.g. "library" or `clients/<clientId>` —
// segments are always our own literals or a cuid, never raw user input,
// so no path-traversal risk.
export async function saveUpload(file: File, kind: UploadKind, scope: string) {
  const rule = KIND_RULES[kind];
  if (file.size === 0) throw new UploadValidationError("הקובץ ריק");
  if (file.size > rule.maxBytes) {
    throw new UploadValidationError(`הקובץ גדול מדי (מקסימום ${Math.round(rule.maxBytes / (1024 * 1024))}MB)`);
  }
  if (rule.mimePrefixes.length && !rule.mimePrefixes.some((p) => file.type.startsWith(p))) {
    throw new UploadValidationError("סוג קובץ לא נתמך");
  }

  const ext = extFromName(file.name) || (file.type.startsWith("audio/") ? ".m4a" : file.type.startsWith("video/") ? ".mp4" : "");
  const storedName = `${randomUUID()}${ext}`;

  if (useBlobStorage()) {
    const blob = await put(`${scope}/${storedName}`, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type || contentTypeFor(storedName),
    });
    return { url: blob.url, fileName: file.name };
  }

  // Vercel's serverless functions have a read-only filesystem outside
  // /tmp — writing here would silently crash instead of validating.
  // If this throws, BLOB_READ_WRITE_TOKEN isn't actually set/visible to
  // this deployment even though it should be.
  if (process.env.VERCEL) {
    throw new UploadValidationError(
      "אחסון הקבצים לא מוגדר בסביבה הזו — יש לוודא שמשתנה הסביבה BLOB_READ_WRITE_TOKEN קיים ב-Vercel ולבצע דיפלוי מחדש"
    );
  }

  const dir = path.join(UPLOAD_ROOT, scope);
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, storedName);

  const arrayBuffer = await file.arrayBuffer();
  await writeFile(fullPath, Buffer.from(arrayBuffer));

  return {
    url: `/api/files/${scope}/${storedName}`,
    fileName: file.name,
  };
}

// Only URLs actually hosted on our Vercel Blob store can be deleted through
// the Blob API — an admin-pasted external link (Google Drive, etc.) has
// nothing on our end to clean up.
function isOwnBlobUrl(url: string) {
  try {
    return new URL(url).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function deleteUploadByUrl(url: string | null | undefined) {
  if (!url) return;
  if (isOwnBlobUrl(url)) {
    try {
      await del(url);
    } catch {
      // already gone — fine
    }
    return;
  }
  if (!url.startsWith("/api/files/")) return;
  const rel = url.slice("/api/files/".length);
  const fullPath = path.join(UPLOAD_ROOT, rel);
  if (!fullPath.startsWith(UPLOAD_ROOT)) return;
  try {
    await unlink(fullPath);
  } catch {
    // already gone — fine
  }
}

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".ogv": "video/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".pdf": "application/pdf",
};

export function contentTypeFor(fileName: string) {
  return CONTENT_TYPES[extFromName(fileName)] || "application/octet-stream";
}

export function resolveStoredPath(scopeAndName: string[]) {
  const fullPath = path.join(UPLOAD_ROOT, ...scopeAndName);
  if (!fullPath.startsWith(UPLOAD_ROOT)) return null;
  return fullPath;
}

// Streams a file with HTTP Range support so <video>/<audio> can seek.
export async function streamFile(fullPath: string, rangeHeader: string | null) {
  const stats = await stat(fullPath);
  const contentType = contentTypeFor(fullPath);

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : stats.size - 1;
      const chunkSize = end - start + 1;
      const nodeStream = createReadStream(fullPath, { start, end });
      return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${stats.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  const nodeStream = createReadStream(fullPath);
  return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Length": String(stats.size),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
