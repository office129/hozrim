import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import {
  createResumableUploadSession,
  getConnection,
  findOrCreateMeetingsFolder,
  findOrCreateSessionFolder,
  findOrCreateExercisesFolder,
  findOrCreateExerciseFolder,
  getOrCreateLibraryFolder,
  findOrCreateLibraryCategoryFolder,
} from "@/lib/google-drive-oauth";

// Starts a direct-to-Drive upload for a specific client's session/exercise
// media, or for a general (non-per-client) library item. Returns just the
// resumable session URL — the browser uploads the actual bytes straight to
// Google from here, not through this route.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  if (!(await getConnection())) {
    return NextResponse.json({ error: "Google Drive is not connected" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  const folder =
    body?.folder === "exercises"
      ? "exercises"
      : body?.folder === "main"
        ? "main"
        : body?.folder === "library"
          ? "library"
          : "";
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "application/octet-stream";
  const fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const libraryItemId = typeof body?.libraryItemId === "string" ? body.libraryItemId : "";
  const exerciseId = typeof body?.exerciseId === "string" ? body.exerciseId : "";

  if (!folder || !filename || !fileSize) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (folder !== "library" && !clientId) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (folder === "main" && !sessionId) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (folder === "library" && !libraryItemId) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (folder === "exercises" && !exerciseId) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  if (folder === "library") {
    const item = await prisma.libraryItem.findUnique({ where: { id: libraryItemId }, include: { folder: true } });
    if (!item) return NextResponse.json({ error: "השיעור לא נמצא" }, { status: 404 });
    try {
      // A legacy item (from before categories existed) keeps uploading
      // into its own dedicated folder. A newer item's files go directly
      // into whichever folder contains it - its category's, or the
      // top-level library folder if it isn't in one.
      let targetFolderId: string;
      if (item.driveFolderId) {
        targetFolderId = item.driveFolderId;
      } else {
        const libraryFolderId = await getOrCreateLibraryFolder();
        if (item.folder) {
          targetFolderId =
            item.folder.driveFolderId || (await findOrCreateLibraryCategoryFolder(libraryFolderId, item.folder.title));
          if (!item.folder.driveFolderId) {
            await prisma.libraryFolder.update({ where: { id: item.folder.id }, data: { driveFolderId: targetFolderId } });
          }
        } else {
          targetFolderId = libraryFolderId;
        }
      }
      const uploadUrl = await createResumableUploadSession(targetFolderId, filename, mimeType, fileSize);
      return NextResponse.json({ uploadUrl });
    } catch (e) {
      console.error("Failed to start Drive upload session for library item", e);
      return NextResponse.json({ error: "לא ניתן להתחיל העלאה לדרייב" }, { status: 502 });
    }
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "לקוח/ה לא נמצא/ה" }, { status: 404 });

  let folderId: string | null;
  if (folder === "exercises") {
    const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!exercise || exercise.clientId !== clientId) {
      return NextResponse.json({ error: "התרגול לא נמצא" }, { status: 404 });
    }
    if (!client.driveFolderId) {
      return NextResponse.json({ error: "לא קושרה תיקיית דרייב ללקוח/ה זה/ו" }, { status: 400 });
    }
    // Each exercise gets its own folder (named after its title) inside
    // "תרגולים" — same reasoning as a session's own folder: without one,
    // Drive-side sync can't tell which exercise a manually-dropped file
    // in the shared folder belongs to.
    try {
      let exercisesFolderId = client.driveExercisesFolderId;
      if (!exercisesFolderId) {
        exercisesFolderId = await findOrCreateExercisesFolder(client.driveFolderId);
        await prisma.client.update({ where: { id: clientId }, data: { driveExercisesFolderId: exercisesFolderId } });
      }
      folderId = await findOrCreateExerciseFolder(exercisesFolderId, exercise.title);
    } catch (e) {
      console.error("Failed to resolve exercise Drive folder", e);
      return NextResponse.json({ error: "לא ניתן להכין תיקיית תרגול בדרייב" }, { status: 502 });
    }
  } else if (!client.driveFolderId) {
    folderId = null;
  } else {
    const session = await prisma.lessonSession.findUnique({ where: { id: sessionId } });
    if (!session || session.clientId !== clientId) {
      return NextResponse.json({ error: "השיעור לא נמצא" }, { status: 404 });
    }
    // Each session gets its own folder (named after its title) inside
    // "פגישות והקלטות" — both created eagerly when the session itself is
    // added, but a folder linked before this existed may still be missing
    // the meetings folder, so create it on demand and persist it for next
    // time.
    try {
      let meetingsFolderId = client.driveMeetingsFolderId;
      if (!meetingsFolderId) {
        meetingsFolderId = await findOrCreateMeetingsFolder(client.driveFolderId);
        await prisma.client.update({ where: { id: clientId }, data: { driveMeetingsFolderId: meetingsFolderId } });
      }
      folderId = await findOrCreateSessionFolder(meetingsFolderId, session.title);
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
