import { NextRequest, NextResponse } from "next/server";
import { syncYouTubeShorts } from "@/lib/youtube-shorts-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Hourly (see vercel.json): new Shorts on the channel (e.g. a reel that was just
// published through Metricool) are added to "סרטונים קצרים" automatically —
// the same as pressing "pull new shorts" in the admin library.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = await syncYouTubeShorts("new");
  return NextResponse.json(res, { status: "error" in res ? 502 : 200 });
}
