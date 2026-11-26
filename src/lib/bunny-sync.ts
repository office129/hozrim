import { prisma } from "@/lib/prisma";
import { getDriveAccessToken } from "@/lib/google-drive-oauth";
import { getAppBaseUrl } from "@/lib/app-url";
import { bunnyApi, bunnyConfigured, bunnyImportEnabled, isDriveKey, libraryId, signedPlaylist, sourceKeyFor } from "@/lib/bunny";

// Copies the app's media into Bunny and keeps BunnyMedia up to date.
// Bunny pulls each file itself (Drive with a short-lived OAuth header, or
// the public Blob URL) — nothing streams through our server. A file only
// counts as "ready" (and the player only switches to it) once Bunny has
// finished encoding it AND a signed playlist link actually answers.

export type MediaKind = "video" | "audio";
export type InventoryItem = {
  sourceKey: string;
  sourceUrl: string;
  kind: MediaKind;
  ownerKey: string; // "client:<id>" | "library"
  ownerName: string;
  title: string;
};

// Bunny Stream is a video service, so only video goes there. Audio stays on
// its original source — see the explanation in the admin "Bunny" panel and
// the inventory numbers it shows (audio is a small share of the traffic).
export const BUNNY_KINDS: MediaKind[] = ["video"];

const LIBRARY_OWNER = "library";
const LIBRARY_COLLECTION_NAME = "ספריית תכנים";

// Every video/audio file the app plays, with who it belongs to.
export async function mediaInventory(): Promise<InventoryItem[]> {
  const [sessions, exercises, uploads, library] = await Promise.all([
    prisma.lessonSession.findMany({
      where: { fileUrl: { not: null } },
      select: { title: true, number: true, fileUrl: true, mediaType: true, client: { select: { id: true, name: true } } },
    }),
    prisma.exercise.findMany({
      where: { audioFileUrl: { not: null } },
      select: { title: true, audioFileUrl: true, client: { select: { id: true, name: true } } },
    }),
    prisma.personalUpload.findMany({
      where: { mediaType: { in: ["video", "audio"] } },
      select: { fileName: true, url: true, mediaType: true, group: { select: { client: { select: { id: true, name: true } } } } },
    }),
    prisma.libraryItem.findMany({ select: { title: true, videoFileUrl: true, audioFileUrl: true } }),
  ]);

  const out = new Map<string, InventoryItem>();
  const add = (url: string | null, kind: MediaKind, ownerKey: string, ownerName: string, title: string) => {
    const sourceKey = sourceKeyFor(url);
    if (!url || !sourceKey || out.has(sourceKey)) return;
    out.set(sourceKey, { sourceKey, sourceUrl: url, kind, ownerKey, ownerName, title });
  };
  for (const s of sessions) {
    add(s.fileUrl, s.mediaType === "audio" ? "audio" : "video", `client:${s.client.id}`, s.client.name, `${s.client.name} · ${s.title}`);
  }
  for (const e of exercises) add(e.audioFileUrl, "audio", `client:${e.client.id}`, e.client.name, `${e.client.name} · תרגול · ${e.title}`);
  for (const u of uploads) {
    const c = u.group.client;
    add(u.url, u.mediaType === "audio" ? "audio" : "video", `client:${c.id}`, c.name, `${c.name} · העלאה אישית · ${u.fileName}`);
  }
  for (const l of library) {
    add(l.videoFileUrl, "video", LIBRARY_OWNER, LIBRARY_COLLECTION_NAME, `ספרייה · ${l.title}`);
    add(l.audioFileUrl, "audio", LIBRARY_OWNER, LIBRARY_COLLECTION_NAME, `ספרייה · ${l.title}`);
  }
  return [...out.values()];
}

// The file's real type and size at its source (a session's mediaType is
// only what slot it was uploaded into; Drive knows the actual file).
export async function sourceMeta(item: Pick<InventoryItem, "sourceKey">): Promise<{ mime: string; bytes: number; gone: boolean }> {
  try {
    if (isDriveKey(item.sourceKey)) {
      const tk = await getDriveAccessToken();
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.sourceKey)}?fields=size,mimeType,trashed&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${tk}` }, cache: "no-store" }
      );
      if (r.status === 404) return { mime: "", bytes: 0, gone: true };
      const d = r.ok ? ((await r.json()) as { size?: string; mimeType?: string; trashed?: boolean }) : {};
      return { mime: d.mimeType || "", bytes: Number(d.size || 0), gone: !!d.trashed };
    }
    const r = await fetch(item.sourceKey, { method: "HEAD", cache: "no-store" });
    if (r.status === 404) return { mime: "", bytes: 0, gone: true };
    return { mime: r.headers.get("content-type") || "", bytes: Number(r.headers.get("content-length") || 0), gone: false };
  } catch {
    return { mime: "", bytes: 0, gone: false };
  }
}

// One Bunny collection per client ("folders" inside the library — Bunny
// has a single level of them, which is exactly one per client), plus one
// for the shared library. Kept by owner id, so renaming a client later
// doesn't split their files across two collections.
async function ensureCollection(ownerKey: string, name: string): Promise<string> {
  const known = await prisma.bunnyCollection.findUnique({ where: { ownerKey } });
  if (known && known.libraryId === libraryId()) return known.guid;
  if (known) await prisma.bunnyCollection.delete({ where: { ownerKey } }); // from a previous library
  const c = await bunnyApi(`/collections`, { method: "POST", body: JSON.stringify({ name }) });
  const guid = (c.data as { guid?: string })?.guid;
  if (!c.ok || !guid) return "";
  try {
    await prisma.bunnyCollection.create({ data: { ownerKey, guid, name, libraryId: libraryId() } });
    return guid;
  } catch {
    // another run created it at the same moment — use theirs, drop ours
    await bunnyApi(`/collections/${guid}`, { method: "DELETE" });
    return (await prisma.bunnyCollection.findUnique({ where: { ownerKey } }))?.guid || "";
  }
}

// Sends one file to Bunny. A placeholder row is written first, so two
// overlapping runs (the hourly job + a viewer opening the file) can never
// import the same file twice — the second insert simply fails.
export async function importToBunny(item: InventoryItem): Promise<{ ok: boolean; error?: string }> {
  if (!bunnyImportEnabled()) return { ok: false, error: "השליחה ל-Bunny כבויה (BUNNY_IMPORT_ENABLED)" };
  try {
    await prisma.bunnyMedia.create({
      data: { sourceKey: item.sourceKey, libraryId: libraryId(), guid: "pending", kind: item.kind, ownerKey: item.ownerKey, title: item.title },
    });
  } catch {
    return { ok: false, error: "כבר בתהליך" };
  }

  const fail = async (error: string) => {
    await prisma.bunnyMedia.delete({ where: { sourceKey: item.sourceKey } }).catch(() => null);
    return { ok: false, error };
  };

  try {
    const meta = await sourceMeta(item);
    if (meta.gone) return fail("הקובץ לא קיים במקור");
    const collectionId = await ensureCollection(item.ownerKey, item.ownerName);
    const title = item.title.slice(0, 200);

    let url = item.sourceKey;
    const headers: Record<string, string> = {};
    if (isDriveKey(item.sourceKey)) {
      url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.sourceKey)}?alt=media&supportsAllDrives=true`;
      headers.Authorization = `Bearer ${await getDriveAccessToken()}`;
    }

    // Same two-step approach as the website: create the video in its
    // collection and ask Bunny to fetch into it; if this API version
    // doesn't take that, the one-call /videos/fetch creates its own.
    let guid = "";
    const created = await bunnyApi(`/videos`, {
      method: "POST",
      body: JSON.stringify({ title, ...(collectionId ? { collectionId } : {}) }),
    });
    const createdGuid = (created.data as { guid?: string })?.guid || "";
    if (created.ok && createdGuid) {
      const f = await bunnyApi(`/videos/${createdGuid}/fetch`, { method: "POST", body: JSON.stringify({ url, headers }) });
      if (f.ok) guid = createdGuid;
      else await bunnyApi(`/videos/${createdGuid}`, { method: "DELETE" });
    }
    if (!guid) {
      const f2 = await bunnyApi(`/videos/fetch${collectionId ? `?collectionId=${collectionId}` : ""}`, {
        method: "POST",
        body: JSON.stringify({ url, title, headers }),
      });
      if (!f2.ok) return fail(`Bunny לא הצליח למשוך את הקובץ (${f2.status})`);
      const d = (f2.data as { guid?: string; videoId?: string; id?: string }) || {};
      guid = d.guid || d.videoId || d.id || "";
      if (!guid) {
        const list = await bunnyApi(`/videos?page=1&itemsPerPage=20&orderBy=date&search=${encodeURIComponent(title.slice(0, 60))}`);
        guid = ((list.data as { items?: { guid: string; title: string }[] })?.items || []).find((x) => x.title === title)?.guid || "";
      }
      if (!guid) return fail("המשיכה התחילה אבל לא נמצא מזהה הסרטון");
    }

    await prisma.bunnyMedia.update({
      where: { sourceKey: item.sourceKey },
      data: { guid, sourceBytes: meta.bytes ? BigInt(meta.bytes) : null },
    });
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 300) : "שגיאה");
  }
}

// Asks Bunny whether a pending file has finished encoding, and — before
// the player is ever pointed at it — that a signed link really plays
// (sent with our own site as the referrer, like a real viewer's browser).
async function refreshOne(row: { sourceKey: string; guid: string; status: number | null; createdAt: Date }) {
  if (row.guid === "pending") {
    // an import that died midway (function timeout) — clear it so it's retried
    if (Date.now() - row.createdAt.getTime() > 15 * 60_000) await prisma.bunnyMedia.delete({ where: { sourceKey: row.sourceKey } });
    return "pending";
  }
  const r = await bunnyApi(`/videos/${row.guid}`);
  if (r.status === 404) {
    await prisma.bunnyMedia.delete({ where: { sourceKey: row.sourceKey } });
    return "gone";
  }
  if (!r.ok) return "pending";
  const v = r.data as { status?: number; encodeProgress?: number; availableResolutions?: string; storageSize?: number };
  if (v.status === 5 || v.status === 6) {
    await prisma.bunnyMedia.update({
      where: { sourceKey: row.sourceKey },
      data: { status: v.status, failedAt: new Date(), error: "הקידוד ב-Bunny נכשל — ממשיך לנגן מהמקור" },
    });
    return "failed";
  }
  const encoded = v.status === 4 || (!!v.availableResolutions && (v.encodeProgress ?? 0) >= 100);
  if (!encoded) {
    if (v.status !== row.status) await prisma.bunnyMedia.update({ where: { sourceKey: row.sourceKey }, data: { status: v.status ?? null } });
    return "pending";
  }
  const { url } = signedPlaylist(row.guid, 300);
  const check = await fetch(url, { headers: { Referer: `${getAppBaseUrl()}/` }, cache: "no-store" }).catch(() => null);
  if (!check?.ok) {
    await prisma.bunnyMedia.update({
      where: { sourceKey: row.sourceKey },
      data: { status: v.status ?? null, error: `קוּדד, אבל קישור חתום לא נפתח (${check?.status ?? "רשת"}) — בדקו את מפתח הטוקן/ה-referrers` },
    });
    return "pending";
  }
  await prisma.bunnyMedia.update({
    where: { sourceKey: row.sourceKey },
    data: { status: v.status ?? 4, ready: true, readyAt: new Date(), error: null, sizeBytes: v.storageSize ? BigInt(v.storageSize) : null },
  });
  return "ready";
}

// The automatic step (hourly job, admin "migrate now" button): check the
// pending ones, then send up to `max` new files. Bounded by time so it
// always finishes inside one serverless invocation.
export async function bunnySync(max = 5, budgetMs = 45_000) {
  const out = { imported: [] as string[], ready: [] as string[], failed: [] as string[], errors: [] as string[], remaining: 0 };
  if (!bunnyConfigured()) return out;
  const started = Date.now();
  // copies in a previous library are no longer ours to play — forget them
  await prisma.bunnyMedia.deleteMany({ where: { libraryId: { not: libraryId() } } });

  const pending = await prisma.bunnyMedia.findMany({ where: { ready: false, failedAt: null } });
  for (const row of pending) {
    if (Date.now() - started > budgetMs) break;
    const s = await refreshOne(row).catch(() => "pending");
    if (s === "ready") out.ready.push(row.title);
    if (s === "failed") out.failed.push(row.title);
  }

  if (!bunnyImportEnabled()) return out; // checking only — nothing new is sent while the switch is off
  const known = new Set((await prisma.bunnyMedia.findMany({ select: { sourceKey: true } })).map((r) => r.sourceKey));
  const todo = (await mediaInventory()).filter((i) => BUNNY_KINDS.includes(i.kind) && !known.has(i.sourceKey));
  for (const item of todo) {
    if (out.imported.length >= max || Date.now() - started > budgetMs) break;
    const meta = await sourceMeta(item);
    // the slot says "video" but the actual file must be a video too
    if (meta.gone || (meta.mime && !meta.mime.startsWith("video/"))) continue;
    const r = await importToBunny(item);
    if (r.ok) out.imported.push(item.title);
    else if (r.error && r.error !== "כבר בתהליך") out.errors.push(`${item.title}: ${r.error}`);
  }
  out.remaining = Math.max(0, todo.length - out.imported.length);
  return out;
}

// Import just this one file right now (a viewer opened something that
// isn't on Bunny yet) — used from the player probe, after the response.
export async function importOneBySourceKey(sourceKey: string) {
  if (!bunnyImportEnabled()) return;
  if (await prisma.bunnyMedia.findUnique({ where: { sourceKey }, select: { sourceKey: true } })) return;
  const item = (await mediaInventory()).find((i) => i.sourceKey === sourceKey);
  if (!item || !BUNNY_KINDS.includes(item.kind)) return;
  const meta = await sourceMeta(item);
  if (meta.gone || (meta.mime && !meta.mime.startsWith("video/"))) return;
  await importToBunny(item);
}
