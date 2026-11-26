import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { driveFileId } from "@/lib/external-links";

// Bunny Stream — the app's own "אפליקציית הליווי" video library (separate
// from the website's). Media files are copied there once (Bunny pulls them
// straight from Drive / Blob, not through our server) and then played from
// Bunny's CDN as adaptive HLS, so viewing no longer streams through Vercel.
// The original file stays where it was and stays the record's fileUrl —
// it's also the automatic fallback whenever Bunny doesn't answer.
//
// Env (Vercel → hozrim → Settings → Environment Variables):
//   BUNNY_LIBRARY_ID   the library's id
//   BUNNY_API_KEY      that library's own API key (library-scoped)
//   BUNNY_CDN_HOST     the library's CDN hostname (vz-xxxx.b-cdn.net)
//   BUNNY_TOKEN_KEY    the library's CDN token-authentication key
// Optional, only for the one-time setup actions in the admin panel:
//   BUNNY_ACCOUNT_KEY           account API key (copy settings / lock down the library)
//   BUNNY_TEMPLATE_LIBRARY_ID   the website's library id — read only, settings copied from it

const API = "https://video.bunnycdn.com";
const lib = () => process.env.BUNNY_LIBRARY_ID?.trim() || "";
const host = () => process.env.BUNNY_CDN_HOST?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") || "";
const tokenKey = () => process.env.BUNNY_TOKEN_KEY?.trim() || "";

// All four are required: without the token key we'd have to hand out
// permanent, unsigned links — so in that case Bunny simply stays off and
// everything keeps playing from its original source.
export function bunnyConfigured() {
  return !!(lib() && process.env.BUNNY_API_KEY && host() && tokenKey());
}

// Sending files to Bunny is OFF unless BUNNY_IMPORT_ENABLED is "1" — so a
// library that isn't set up yet exactly like the website's never receives
// anything. (Playback of files already verified on the current library
// isn't affected by this switch.)
export function bunnyImportEnabled() {
  return bunnyConfigured() && process.env.BUNNY_IMPORT_ENABLED?.trim() === "1";
}

type ApiResult = { ok: boolean; status: number; data: unknown };

async function call(url: string, key: string, init: RequestInit): Promise<ApiResult> {
  const r = await fetch(url, {
    ...init,
    headers: { AccessKey: key, accept: "application/json", "content-type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  const text = await r.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { ok: r.ok, status: r.status, data };
}

// The app's own library only — the library id comes from env, never from a request.
export function bunnyApi(path: string, init: RequestInit = {}) {
  return call(`${API}/library/${lib()}${path}`, process.env.BUNNY_API_KEY?.trim() || "", init);
}

// Account-level API (library settings). Only used by the admin setup actions.
export function bunnyAccount(path: string, init: RequestInit = {}) {
  return call(`https://api.bunny.net${path}`, process.env.BUNNY_ACCOUNT_KEY?.trim() || "", init);
}

export const libraryId = lib;

// A short-lived signed link to a video's HLS playlist. The token covers the
// whole /{guid}/ directory (playlist + segments) and sits in the path, so
// the segment links inside the playlist inherit it — Bunny's "advanced"
// token auth (HMAC-SHA256 over path + expiry + params), same as the website.
export function signedPlaylist(guid: string, ttlSec: number): { url: string; expiresAt: number } {
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  const tokenPath = `/${guid}/`;
  const mac = createHmac("sha256", tokenKey())
    .update(tokenPath)
    .update(String(expires))
    .update(`token_path=${tokenPath}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return {
    url: `https://${host()}/bcdn_token=HS256-${mac}&token_path=${encodeURIComponent(tokenPath)}&expires=${expires}/${guid}/playlist.m3u8`,
    expiresAt: expires * 1000,
  };
}

// How a stored fileUrl is keyed in BunnyMedia: the Drive file id, or the
// full URL for a file on our Vercel Blob store. Anything else (a YouTube
// link, a local dev file) isn't something Bunny can or should copy.
export function sourceKeyFor(url: string | null | undefined): string | null {
  if (!url) return null;
  const id = driveFileId(url);
  if (id) return id;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".public.blob.vercel-storage.com")) return `${u.origin}${u.pathname}`;
  } catch {
    /* relative / invalid */
  }
  return null;
}

export const isDriveKey = (key: string) => !key.startsWith("http");

// Is this viewer allowed to see this exact file? Admins see everything; a
// client sees only their own sessions / exercises / personal uploads, plus
// the shared library. Checked on every link we sign.
export async function canViewSource(key: string, viewer: { adminId: string | null; clientId: string | null }) {
  if (viewer.adminId) return true;
  const clientId = viewer.clientId;
  if (!clientId) return false;
  const m = isDriveKey(key) ? { contains: key } : { startsWith: key };
  const [session, exercise, upload, libraryItem] = await Promise.all([
    prisma.lessonSession.findFirst({ where: { clientId, fileUrl: m }, select: { id: true } }),
    prisma.exercise.findFirst({ where: { clientId, audioFileUrl: m }, select: { id: true } }),
    prisma.personalUpload.findFirst({ where: { url: m, group: { clientId } }, select: { id: true } }),
    prisma.libraryItem.findFirst({ where: { OR: [{ videoFileUrl: m }, { audioFileUrl: m }] }, select: { id: true } }),
  ]);
  return !!(session || exercise || upload || libraryItem);
}

// When the coach deletes or replaces a file in the app, its Bunny copy goes
// too (no orphaned private recordings, no storage cost for nothing).
// Best-effort — never blocks the app's own delete.
export async function deleteBunnyCopy(url: string | null | undefined) {
  const key = sourceKeyFor(url);
  if (!key) return;
  try {
    const row = await prisma.bunnyMedia.findUnique({ where: { sourceKey: key } });
    if (!row) return;
    if (bunnyConfigured() && row.guid && row.guid !== "pending") {
      await bunnyApi(`/videos/${row.guid}`, { method: "DELETE" });
    }
    await prisma.bunnyMedia.delete({ where: { sourceKey: key } });
  } catch (e) {
    console.error("Failed to delete Bunny copy", e);
  }
}
