import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, isEmailConfigured } from "@/lib/email";
import { getConnection, listFolderFiles } from "@/lib/google-drive-oauth";
import { extractEventName, importMeetRecordingForClient } from "@/lib/meet-import";
import { reconcileSessionFolder, reconcileLibraryItemFolder } from "@/lib/drive-sync";

// Runs on a schedule (see vercel.json) to do two related things:
//
// 1. Pull new Google Meet recordings out of a folder shared with the
//    coach's connected Drive account by whoever actually organizes the
//    calls, and file each one straight into the matching client's session
//    — without the coach lifting a finger, as long as the Meet invite was
//    named after the client. Matching is a plain substring check: the
//    meeting's name (Google appends a " (date time)" suffix to every
//    recording's filename, stripped off in extractEventName) has to
//    contain exactly one client's name. Zero or multiple matches go to
//    the admin review queue instead of guessing — a wrongly auto-filed
//    recording is a real privacy mistake, a recording that briefly sits
//    in the review queue is not. A copy, not a move — Drive doesn't
//    support genuinely moving a file between two different people's
//    accounts — so the original stays in the shared folder untouched.
//
// 2. Reconcile every session and library item's own Drive folder against
//    what the app has on record — a file dropped in by hand shows up as
//    a new recording/summary, and one deleted in Drive disappears from
//    the app too. The upload side of this already writes new files
//    straight into the right folder; this is what makes the reverse
//    direction (and deletions in either direction) work as well.

async function notifyAdmins(subject: string, text: string) {
  if (!isEmailConfigured()) return;
  const admins = await prisma.admin.findMany({ select: { email: true } });
  for (const admin of admins) {
    try {
      await sendMail(admin.email, subject, text);
    } catch (e) {
      console.error("Failed to notify admin about Meet import", e);
    }
  }
}

async function runMeetImport(meetRecordingsFolderId: string) {
  const files = await listFolderFiles(meetRecordingsFolderId);
  if (!files.length) return { scanned: 0, new: 0, matched: 0, ambiguous: 0, unmatched: 0, noFolder: 0 };

  const alreadyProcessed = await prisma.meetRecordingImport.findMany({
    where: { driveFileId: { in: files.map((f) => f.id) } },
    select: { driveFileId: true },
  });
  const processedIds = new Set(alreadyProcessed.map((p) => p.driveFileId));
  const newFiles = files.filter((f) => !processedIds.has(f.id));

  const counts = { matched: 0, ambiguous: 0, unmatched: 0, noFolder: 0 };
  if (newFiles.length) {
    const clients = await prisma.client.findMany({
      select: { id: true, name: true, driveFolderId: true, driveMeetingsFolderId: true },
    });

    for (const file of newFiles) {
      const eventName = extractEventName(file.name);
      const recordingDate = new Date(file.createdTime);
      const matches = clients.filter((c) => eventName.includes(c.name));

      if (matches.length !== 1) {
        const status = matches.length === 0 ? "unmatched" : "ambiguous";
        counts[status]++;
        await prisma.meetRecordingImport.create({
          data: {
            driveFileId: file.id,
            fileName: file.name,
            recordingDate,
            status,
            matchedNames: matches.map((c) => c.name).join(", ") || null,
          },
        });
        continue;
      }

      const client = matches[0];
      if (!client.driveFolderId) {
        counts.noFolder++;
        await prisma.meetRecordingImport.create({
          data: {
            driveFileId: file.id,
            fileName: file.name,
            recordingDate,
            status: "no_folder",
            matchedNames: client.name,
            clientId: client.id,
          },
        });
        continue;
      }

      try {
        const sessionId = await importMeetRecordingForClient(file, client);
        counts.matched++;
        await prisma.meetRecordingImport.create({
          data: {
            driveFileId: file.id,
            fileName: file.name,
            recordingDate,
            status: "matched",
            matchedNames: client.name,
            clientId: client.id,
            sessionId,
          },
        });
      } catch (e) {
        console.error("Failed to auto-import Meet recording", file.name, e);
        counts.unmatched++;
        await prisma.meetRecordingImport.create({
          data: {
            driveFileId: file.id,
            fileName: file.name,
            recordingDate,
            status: "unmatched",
            matchedNames: client.name,
          },
        });
      }
    }
  }

  if (counts.ambiguous || counts.unmatched || counts.noFolder) {
    await notifyAdmins(
      "חוזרים לבראשית — הקלטות ממתינות לשיוך ידני",
      `יש ${counts.ambiguous + counts.unmatched + counts.noFolder} הקלטות מ-Meet שדורשות שיוך ידני ללקוח/ה (${counts.ambiguous} עם כמה התאמות אפשריות, ${counts.unmatched} בלי שום התאמה, ${counts.noFolder} עם לקוח/ה תואמ/ת שאין לו/ה עדיין תיקיית דרייב). היכנס/י לפאנל הניהול כדי לשייך אותן.`
    );
  }

  return { scanned: files.length, new: newFiles.length, ...counts };
}

async function runFolderSync() {
  const sessions = await prisma.lessonSession.findMany({
    include: { summaryFiles: { select: { id: true, url: true } }, client: { select: { driveFolderId: true, driveMeetingsFolderId: true } } },
  });
  let sessionErrors = 0;
  for (const { client, ...session } of sessions) {
    try {
      await reconcileSessionFolder(session, client);
    } catch (e) {
      sessionErrors++;
      console.error("Failed to reconcile session Drive folder", session.id, e);
    }
  }

  const libraryItems = await prisma.libraryItem.findMany();
  let libraryErrors = 0;
  for (const item of libraryItems) {
    try {
      await reconcileLibraryItemFolder(item);
    } catch (e) {
      libraryErrors++;
      console.error("Failed to reconcile library item Drive folder", item.id, e);
    }
  }

  return { sessionsChecked: sessions.length, sessionErrors, libraryItemsChecked: libraryItems.length, libraryErrors };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getConnection();
  if (!connection) {
    return NextResponse.json({ ok: true, skipped: "Google Drive is not connected" });
  }

  const meetImport = connection.meetRecordingsFolderId
    ? await runMeetImport(connection.meetRecordingsFolderId)
    : { skipped: "no Meet Recordings folder configured" };

  const folderSync = await runFolderSync();

  return NextResponse.json({ ok: true, meetImport, folderSync });
}
