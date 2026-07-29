import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { createResumableUploadSession, getConnection } from "@/lib/google-drive-oauth";

// Starts a direct-to-Drive upload for a specific client's session/exercise
// media. Returns just the resumable session URL — the browser uploads the
// actual bytes straight to Google from here, not through this route.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  if (!(await getConnection())) {
    return NextResponse.json({ error: "Google Drive is not connected" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  const folder = body?.folder === "exercises" ? "exercises" : body?.folder === "main" ? "main" : "";
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "application/octet-stream";
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;

  if (!clientId || !folder || !filename || !fileSize) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "לקוח/ה לא נמצא/ה" }, { status: 404 });

  const folderId = folder === "exercises" ? client.driveExercisesFolderId : client.driveFolderId;
  if (!folderId) {
    return NextResponse.json({ error: "לא קושרה תיקיית דרייב ללקוח/ה זה/ו" }, { status: 400 });
  }

  try {
    const uploadUrl = await createResumableUploadSession(folderId, filename, mimeType, fileSize);
    return NextResponse.json({ uploadUrl });
  } catch (e) {
    console.error("Failed to start Drive upload session", e);
    return NextResponse.json({ error: "לא ניתן להתחיל העלאה לדרייב" }, { status: 502 });
  }
}
