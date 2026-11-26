import { NextRequest, NextResponse } from "next/server";
import { libraryId } from "@/lib/bunny";
import { refreshByGuid } from "@/lib/bunny-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Bunny Stream calls this (library "Webhook URL") whenever a video's status
// changes, so a finished video switches to Bunny within a minute instead of
// on the next scheduled check. Nothing in the body is trusted: we only look
// the video up again through our own API key.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { VideoLibraryId?: number | string; VideoGuid?: string; Status?: number } | null;
  if (!b?.VideoGuid || String(b.VideoLibraryId) !== libraryId()) return NextResponse.json({ ok: true });
  // 3 = finished, 4 = resolution finished, 5/6 = failed
  if (![3, 4, 5, 6].includes(Number(b.Status))) return NextResponse.json({ ok: true });
  const result = await refreshByGuid(String(b.VideoGuid)).catch(() => "error");
  return NextResponse.json({ ok: true, result });
}
