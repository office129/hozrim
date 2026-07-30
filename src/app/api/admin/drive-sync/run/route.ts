import { NextResponse } from "next/server";
import { requireAdmin, isResponse } from "@/lib/guard";
import { runDriveSyncJob } from "@/lib/drive-sync-job";

// Lets an admin trigger the same Drive sync the scheduled cron job runs,
// on demand — useful for testing, or just not wanting to wait for the
// next scheduled run.
export async function POST() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const result = await runDriveSyncJob();
  return NextResponse.json(result);
}
