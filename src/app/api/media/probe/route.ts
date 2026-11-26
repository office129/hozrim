import { NextRequest, NextResponse, after } from "next/server";
import { getAdminId, getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bunnyConfigured, bunnyImportEnabled, canViewSource, libraryId, signedPlaylist, sourceKeyFor } from "@/lib/bunny";
import { importOneBySourceKey } from "@/lib/bunny-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signed links last 3 hours — long enough for a full meeting recording,
// short enough that a copied link is soon useless. The player re-asks
// before it expires, and falls back to the original source if it must.
const TTL_SEC = 3 * 60 * 60;

// The player asks here before playing a file: { hls } is a short-lived
// signed Bunny link once the file is ready on Bunny AND this viewer may see
// it; otherwise null, and the player uses the original source as before.
export async function GET(req: NextRequest) {
  const none = NextResponse.json({ hls: null }, { headers: { "cache-control": "no-store" } });
  const adminId = await getAdminId();
  const clientId = await getClientId();
  if (!adminId && !clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!bunnyConfigured()) return none;

  const key = sourceKeyFor(req.nextUrl.searchParams.get("u"));
  if (!key) return none;
  if (!(await canViewSource(key, { adminId, clientId }))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await prisma.bunnyMedia.findUnique({ where: { sourceKey: key }, select: { guid: true, ready: true, libraryId: true } });
  if (row && row.libraryId !== libraryId()) return none; // a copy in a previous library
  if (!row && bunnyImportEnabled()) {
    // not on Bunny yet — send it now, so the next viewing already comes from Bunny
    after(() => importOneBySourceKey(key).catch((e) => console.error("Bunny import on view failed", e)));
    return none;
  }
  if (!row?.ready) return none;
  const { url, expiresAt } = signedPlaylist(row.guid, TTL_SEC);
  return NextResponse.json({ hls: url, expiresAt }, { headers: { "cache-control": "no-store" } });
}
