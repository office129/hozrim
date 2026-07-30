import { NextRequest, NextResponse } from "next/server";
import { runMeetImportJob } from "@/lib/drive-sync-job";

// A lighter sibling of /api/cron/meet-import, meant to be called often
// (e.g. every minute, from an external scheduler like a Google Apps
// Script trigger the coach sets up themselves) rather than once a day -
// it only checks for new Meet recordings, skipping the heavier
// per-client/library folder reconciliation the daily cron also does.
// Same CRON_SECRET bearer auth as the daily cron route; nothing about
// this route is Vercel-specific, so any external caller that knows the
// secret can hit it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runMeetImportJob();
  return NextResponse.json(result);
}
