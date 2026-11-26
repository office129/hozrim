import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isResponse } from "@/lib/guard";
import { syncYouTubeShorts } from "@/lib/youtube-shorts-sync";

// Pulling a large channel means several YouTube API round-trips; give the
// handler room (effective on Pro/Fluid — Hobby still caps at ~10s).
export const maxDuration = 60;

// Admin button: pull the channel's shorts now (the hourly cron does "new" on its own).
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = await req.json().catch(() => null);
  const mode = body?.mode === "all" ? "all" : "new";

  const res = await syncYouTubeShorts(mode);
  if ("error" in res) return NextResponse.json(res, { status: 502 });
  return NextResponse.json(res);
}
