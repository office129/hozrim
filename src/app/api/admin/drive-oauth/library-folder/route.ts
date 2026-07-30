import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { driveFolderId } from "@/lib/external-links";
import { getConnection } from "@/lib/google-drive-oauth";

// Lets the coach repoint the "ספריית תכנים" folder at a specific Drive
// folder - needed if that folder ever gets renamed (the app persists its
// ID once found, but a rename that happens before the ID is ever
// persisted, or a mixup between two folders of the same name, needs a
// manual fix).
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const connection = await getConnection();
  if (!connection) return NextResponse.json({ error: "גוגל דרייב לא מחובר" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const url = typeof body?.folderUrl === "string" ? body.folderUrl.trim() : "";
  const folderId = driveFolderId(url);
  if (!folderId) return NextResponse.json({ error: "קישור תיקייה לא תקין" }, { status: 400 });

  await prisma.googleDriveConnection.update({
    where: { id: connection.id },
    data: { libraryFolderId: folderId },
  });

  return NextResponse.json({ ok: true });
}
