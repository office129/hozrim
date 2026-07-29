import { NextResponse } from "next/server";
import { requireAdmin, isResponse } from "@/lib/guard";
import { disconnectDrive } from "@/lib/google-drive-oauth";

export async function POST() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  await disconnectDrive();
  return NextResponse.json({ ok: true });
}
