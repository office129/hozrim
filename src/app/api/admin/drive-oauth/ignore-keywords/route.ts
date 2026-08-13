import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { getConnection } from "@/lib/google-drive-oauth";

// The coach edits the list of "ignore" keywords from the "הקלטות לשיוך"
// tab - a Meet recording whose meeting name contains any of them (the
// coach's group classes, not client sessions) is skipped by the import
// instead of landing in the manual-matching queue.
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const connection = await getConnection();
  if (!connection) return NextResponse.json({ error: "גוגל דרייב לא מחובר" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const raw = typeof body?.keywords === "string" ? body.keywords : "";
  // Normalize: split, trim, drop empties, re-join with commas - so the
  // stored value is always clean regardless of how the coach typed it.
  const cleaned = raw
    .split(",")
    .map((k: string) => k.trim())
    .filter(Boolean)
    .join(",");

  await prisma.googleDriveConnection.update({
    where: { id: connection.id },
    data: { meetIgnoreKeywords: cleaned },
  });

  return NextResponse.json({ ok: true, keywords: cleaned });
}
