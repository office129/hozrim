import { NextResponse } from "next/server";
import { requireAdmin, isResponse } from "@/lib/guard";

// Lets the admin UI know whether it can upload large files straight to
// Vercel Blob from the browser (bypassing the ~4.5MB body-size limit that
// Vercel imposes on requests proxied through a serverless function), or
// whether it must fall back to posting the file to our own API route
// (only viable locally, where uploads land on disk with no size cap).
export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  return NextResponse.json({ enabled: !!process.env.BLOB_READ_WRITE_TOKEN });
}
