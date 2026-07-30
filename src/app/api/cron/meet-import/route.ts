import { NextRequest, NextResponse } from "next/server";
import { runDriveSyncJob } from "@/lib/drive-sync-job";

// Runs on a schedule (see vercel.json). See drive-sync-job.ts for what it
// actually does — this route is just the scheduled trigger, protected by
// a secret only Vercel's own cron caller knows.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDriveSyncJob();
  return NextResponse.json(result);
}
