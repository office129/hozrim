import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import {
  createResumableUploadSession,
  getConnection,
  findOrCreateUploadsFolder,
  findOrCreateUploadGroupFolder,
} from "@/lib/google-drive-oauth";

// Starts a direct-to-Drive upload into one of the calling client's own
// personal-upload groups - the client-facing counterpart of
// /api/admin/drive-upload/init. No clientId in the body: ownership of the
// group is checked against the caller's own session.
export async function POST(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  if (!(await getConnection())) {
    return NextResponse.json({ error: "Google Drive is not connected" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const groupId = typeof body?.groupId === "string" ? body.groupId : "";
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "application/octet-stream";
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;
  if (!groupId || !filename || !fileSize) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const group = await prisma.personalUploadGroup.findFirst({ where: { id: groupId, clientId }, include: { client: true } });
  if (!group) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  if (!group.client.driveFolderId) {
    return NextResponse.json({ error: "לא קושרה תיקיית דרייב ללקוח/ה זה/ו" }, { status: 400 });
  }

  try {
    let folderId = group.driveFolderId;
    if (!folderId) {
      let uploadsFolderId = group.client.driveUploadsFolderId;
      if (!uploadsFolderId) {
        uploadsFolderId = await findOrCreateUploadsFolder(group.client.driveFolderId);
        await prisma.client.update({ where: { id: clientId }, data: { driveUploadsFolderId: uploadsFolderId } });
      }
      folderId = await findOrCreateUploadGroupFolder(uploadsFolderId, group.title);
      await prisma.personalUploadGroup.update({ where: { id: groupId }, data: { driveFolderId: folderId } });
    }
    const uploadUrl = await createResumableUploadSession(folderId, filename, mimeType, fileSize);
    return NextResponse.json({ uploadUrl });
  } catch (e) {
    console.error("Failed to start Drive upload session for personal upload group", e);
    return NextResponse.json({ error: "לא ניתן להתחיל העלאה לדרייב" }, { status: 502 });
  }
}
