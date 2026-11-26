import { NextRequest, NextResponse } from "next/server";
import { bunnySync } from "@/lib/bunny-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Hourly (see vercel.json): new videos (admin or client uploads, Meet
// imports) are sent to Bunny, pending ones are checked until they're ready.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await bunnySync(8, 50_000));
}
