import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import {
  createResumableUploadSession,
  getConnection,
  findOrCreateMeetingsFolder,
  findOrCreateSessionFolder,
} from "@/lib/google-drive-oauth";

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
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";

  if (!clientId || !folder || !filename || !fileSize) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (folder === "main" && !sessionId) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "לקוח/ה לא נמצא/ה" }, { status: 404 });

  let folderId: string | null;
  if (folder === "exercises") {
    folderId = client.driveExercisesFolderId;
  } else if (!client.driveFolderId) {
    folderId = null;
  } else {
    const session = await prisma.lessonSession.findUnique({ where: { id: sessionId } });
    if (!session || session.clientId !== clientId) {
      return NextResponse.json({ error: "השיעור לא נמצא" }, { status: 404 });
    }
    // Each session gets its own "פגישה N - תאריך" folder inside "פגישות
    // והקלטות" — both created eagerly for new clients, but a folder linked
    // before this existed (or before this specific session came up) may
    // still be missing either one, so create on demand and persist the
    // meetings folder for next time.
    try {
      let meetingsFolderId = client.driveMeetingsFolderId;
      if (!meetingsFolderId) {
        meetingsFolderId = await findOrCreateMeetingsFolder(client.driveFolderId);
        await prisma.client.update({ where: { id: clientId }, data: { driveMeetingsFolderId: meetingsFolderId } });
      }
      folderId = await findOrCreateSessionFolder(meetingsFolderId, session.number, session.createdAt);
    } catch (e) {
      console.error("Failed to resolve session Drive folder", e);
      return NextResponse.json({ error: "לא ניתן להכין תיקיית פגישה בדרייב" }, { status: 502 });
    }
  }
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
