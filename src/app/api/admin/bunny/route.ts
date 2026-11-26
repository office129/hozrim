import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { getAppBaseUrl } from "@/lib/app-url";
import { bunnyAccount, bunnyApi, bunnyConfigured, libraryId } from "@/lib/bunny";
import { bunnySync, mediaInventory, sourceMeta, BUNNY_KINDS } from "@/lib/bunny-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GB = 1e9;
const num = (b: bigint | null) => (b ? Number(b) : 0);

// The settings that decide what Bunny charges per GB — copied 1:1 from the
// website's library so the app's library costs exactly the same per GB.
const PRICE_LIBRARY_KEYS = ["EnabledResolutions", "KeepOriginalFiles", "ReplicationRegions", "EnableMP4Fallback", "Bitrate240p", "Bitrate360p", "Bitrate480p", "Bitrate720p", "Bitrate1080p", "Bitrate1440p", "Bitrate2160p"];
const PRICE_ZONE_KEYS = ["Type", "EnableGeoZoneUS", "EnableGeoZoneEU", "EnableGeoZoneASIA", "EnableGeoZoneSA", "EnableGeoZoneAF"];

const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function envState() {
  return {
    BUNNY_LIBRARY_ID: !!process.env.BUNNY_LIBRARY_ID,
    BUNNY_API_KEY: !!process.env.BUNNY_API_KEY,
    BUNNY_CDN_HOST: !!process.env.BUNNY_CDN_HOST,
    BUNNY_TOKEN_KEY: !!process.env.BUNNY_TOKEN_KEY,
    BUNNY_ACCOUNT_KEY: !!process.env.BUNNY_ACCOUNT_KEY,
    BUNNY_TEMPLATE_LIBRARY_ID: !!process.env.BUNNY_TEMPLATE_LIBRARY_ID,
  };
}

async function readLibrary(id: string) {
  const L = await bunnyAccount(`/videolibrary/${id}`);
  if (!L.ok) return null;
  const lib = L.data as Record<string, unknown>;
  const P = await bunnyAccount(`/pullzone/${lib.PullZoneId}`);
  return { lib, zone: P.ok ? (P.data as Record<string, unknown>) : null };
}

async function status() {
  const rows = await prisma.bunnyMedia.findMany({ orderBy: { createdAt: "desc" } });
  const ready = rows.filter((r) => r.ready);
  const failed = rows.filter((r) => r.failedAt);
  const pending = rows.filter((r) => !r.ready && !r.failedAt);
  const inv = await mediaInventory();
  const known = new Set(rows.map((r) => r.sourceKey));
  const byKind = (k: string) => inv.filter((i) => i.kind === k).length;
  const collections = await prisma.bunnyCollection.count();
  return {
    configured: bunnyConfigured(),
    env: envState(),
    totals: {
      videosInApp: byKind("video"),
      audiosInApp: byKind("audio"),
      ready: ready.length,
      pending: pending.length,
      failed: failed.length,
      notYetSent: inv.filter((i) => BUNNY_KINDS.includes(i.kind) && !known.has(i.sourceKey)).length,
      bunnyStorageGB: +(ready.reduce((s, r) => s + num(r.sizeBytes), 0) / GB).toFixed(2),
      sourceGB: +(ready.reduce((s, r) => s + num(r.sourceBytes), 0) / GB).toFixed(2),
      collections,
    },
    problems: [...failed, ...pending.filter((r) => r.error)].slice(0, 30).map((r) => ({ sourceKey: r.sourceKey, title: r.title, error: r.error, failed: !!r.failedAt })),
    pendingList: pending.slice(0, 30).map((r) => ({ title: r.title, status: r.status })),
  };
}

// POST { action }:
//   status        what's on Bunny, what's pending, what failed (no secrets returned)
//   sync          run the migration step now (same as the hourly job)
//   inventory     every video/audio in the app with its size at the source
//   copy-settings copy the price-affecting settings from the website library (read only there)
//   secure        lock down the app library: CDN token auth + allowed referrers
//   retry         clear a failed file so the next run sends it again
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const b = (await req.json().catch(() => ({}))) as { action?: string; max?: number; sourceKey?: string };

  if (b.action === "status") return NextResponse.json(await status());

  if (!bunnyConfigured()) {
    return NextResponse.json({ error: "Bunny עדיין לא מוגדר — חסרים משתני סביבה ב-Vercel", env: envState() }, { status: 503 });
  }

  if (b.action === "sync") {
    const r = await bunnySync(Math.min(Number(b.max) || 6, 12), 45_000);
    return NextResponse.json({ ...r, status: await status() });
  }

  if (b.action === "inventory") {
    const inv = await mediaInventory();
    const rows = new Map((await prisma.bunnyMedia.findMany()).map((r) => [r.sourceKey, r]));
    const sized: { kind: string; bytes: number; onBunny: boolean }[] = [];
    for (let i = 0; i < inv.length; i += 8) {
      const chunk = inv.slice(i, i + 8);
      const metas = await Promise.all(chunk.map((it) => sourceMeta(it)));
      chunk.forEach((it, j) => sized.push({ kind: it.kind, bytes: metas[j].bytes, onBunny: !!rows.get(it.sourceKey)?.ready }));
    }
    const sum = (f: (x: (typeof sized)[number]) => boolean) => {
      const xs = sized.filter(f);
      return { files: xs.length, GB: +(xs.reduce((s, x) => s + x.bytes, 0) / GB).toFixed(2) };
    };
    return NextResponse.json({
      video: sum((x) => x.kind === "video"),
      videoOnBunny: sum((x) => x.kind === "video" && x.onBunny),
      audio: sum((x) => x.kind === "audio"),
    });
  }

  if (b.action === "copy-settings" || b.action === "secure") {
    if (!process.env.BUNNY_ACCOUNT_KEY) {
      return NextResponse.json({ error: "לפעולה הזו צריך זמנית את BUNNY_ACCOUNT_KEY" }, { status: 400 });
    }
    const mine = await readLibrary(libraryId());
    if (!mine?.zone) return NextResponse.json({ error: "לא הצלחתי לקרוא את ספריית האפליקציה ב-Bunny" }, { status: 502 });

    if (b.action === "copy-settings") {
      const tplId = process.env.BUNNY_TEMPLATE_LIBRARY_ID?.trim();
      if (!tplId) return NextResponse.json({ error: "חסר BUNNY_TEMPLATE_LIBRARY_ID (מזהה ספריית האתר)" }, { status: 400 });
      if (tplId === libraryId()) return NextResponse.json({ error: "מזהה ספריית האתר זהה לספריית האפליקציה" }, { status: 400 });
      // the website's library is only READ here — nothing is written to it
      const tpl = await readLibrary(tplId);
      if (!tpl?.zone) return NextResponse.json({ error: "לא הצלחתי לקרוא את ספריית האתר" }, { status: 502 });
      const libWant = pick(tpl.lib, PRICE_LIBRARY_KEYS);
      const zoneWant = pick(tpl.zone, PRICE_ZONE_KEYS);
      const libSettable = { ...libWant };
      delete libSettable.ReplicationRegions;
      await bunnyAccount(`/videolibrary/${libraryId()}`, { method: "POST", body: JSON.stringify(libSettable) });
      // replication regions are added one by one on Bunny's API
      const haveRegions = (mine.lib.ReplicationRegions as string[] | undefined) || [];
      for (const region of ((libWant.ReplicationRegions as string[] | undefined) || []).filter((r) => !haveRegions.includes(r))) {
        await bunnyAccount(`/videolibrary/${libraryId()}/addReplicationRegion`, { method: "POST", body: JSON.stringify({ ReplicationRegion: region }) });
      }
      await bunnyAccount(`/pullzone/${mine.lib.PullZoneId}`, { method: "POST", body: JSON.stringify(zoneWant) });
      const after = await readLibrary(libraryId());
      const libNow = pick(after?.lib || {}, PRICE_LIBRARY_KEYS);
      const zoneNow = pick(after?.zone || {}, PRICE_ZONE_KEYS);
      const diffs = [
        ...PRICE_LIBRARY_KEYS.filter((k) => k in libWant && !same(libWant[k], libNow[k])).map((k) => ({ key: k, website: libWant[k], app: libNow[k] })),
        ...PRICE_ZONE_KEYS.filter((k) => k in zoneWant && !same(zoneWant[k], zoneNow[k])).map((k) => ({ key: k, website: zoneWant[k], app: zoneNow[k] })),
      ];
      return NextResponse.json({ identical: diffs.length === 0, diffs, settings: { library: libNow, pullZone: zoneNow } });
    }

    // secure: signed links only (CDN token auth) + only our own site may embed
    const hosts = new Set<string>([new URL(getAppBaseUrl()).hostname, req.nextUrl.hostname].filter((h) => h && h !== "localhost"));
    await bunnyAccount(`/pullzone/${mine.lib.PullZoneId}`, { method: "POST", body: JSON.stringify({ ZoneSecurityEnabled: true }) });
    await bunnyAccount(`/videolibrary/${libraryId()}`, { method: "POST", body: JSON.stringify({ AllowedReferrers: [...hosts], BlockNoneReferrer: false }) });
    const after = await readLibrary(libraryId());
    const zoneKey = String(after?.zone?.ZoneSecurityKey || "");
    return NextResponse.json({
      tokenAuthOn: !!after?.zone?.ZoneSecurityEnabled,
      allowedReferrers: after?.lib.AllowedReferrers,
      // compared on the server only; the key itself is never returned
      tokenKeyMatchesEnv: !!zoneKey && zoneKey === process.env.BUNNY_TOKEN_KEY?.trim(),
    });
  }

  if (b.action === "retry") {
    const row = b.sourceKey ? await prisma.bunnyMedia.findUnique({ where: { sourceKey: b.sourceKey } }) : null;
    if (!row) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    if (row.guid !== "pending") await bunnyApi(`/videos/${row.guid}`, { method: "DELETE" });
    await prisma.bunnyMedia.delete({ where: { sourceKey: row.sourceKey } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "פעולה לא מוכרת" }, { status: 400 });
}
