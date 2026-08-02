import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import { createResumableUploadSession, getConnection, findOrCreateUploadsFolder } from "@/lib/google-drive-oauth";

// Starts a direct-to-Drive upload for the calling client's own "ההעלאות
// שלי" folder - the client-facing counterpart of
// /api/admin/drive-upload/init. No clientId in the body: it's always the
// caller's own folder, taken from their session, never one they could pick.
export async function POST(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  if (!(await getConnection())) {
    return NextResponse.json({ error: "Google Drive is not connected" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "application/octet-stream";
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;
  if (!filename || !fileSize) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client?.driveFolderId) {
    return NextResponse.json({ error: "לא קושרה תיקיית דרייב ללקוח/ה זה/ו" }, { status: 400 });
  }

  try {
    let folderId = client.driveUploadsFolderId;
    if (!folderId) {
      folderId = await findOrCreateUploadsFolder(client.driveFolderId);
      await prisma.client.update({ where: { id: clientId }, data: { driveUploadsFolderId: folderId } });
    }
    const uploadUrl = await createResumableUploadSession(folderId, filename, mimeType, fileSize);
    return NextResponse.json({ uploadUrl });
  } catch (e) {
    console.error("Failed to start Drive upload session for personal upload", e);
    return NextResponse.json({ error: "לא ניתן להתחיל העלאה לדרייב" }, { status: 502 });
  }
}
