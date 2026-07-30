import { prisma } from "@/lib/prisma";
import { sendMail, isEmailConfigured } from "@/lib/email";
import { getConnection, listFolderFiles, listSubfolders } from "@/lib/google-drive-oauth";
import { extractEventName, importMeetRecordingForClient } from "@/lib/meet-import";
import {
  reconcileSessionFolder,
  reconcileLibraryItemFolder,
  discoverNewSessionFolders,
  discoverNewLibraryItemFolders,
  removeSessionIfFolderGone,
  removeLibraryItemIfFolderGone,
} from "@/lib/drive-sync";

// The full Drive sync job — shared by the scheduled cron route and the
// admin's manual "בדוק עכשיו" button, so both do exactly the same thing.
//
// Three things, in this order:
//
// 1. Pull new Google Meet recordings out of a folder shared with the
//    coach's connected Drive account by whoever actually organizes the
//    calls, and file each one straight into the matching client's session
//    — without the coach lifting a finger, as long as the Meet invite was
//    named after the client. Matching is a plain substring check against
//    the meeting's name - see findMeetRecordingFiles for exactly where
//    that name comes from, since Google restructured this in July 2026
//    (one subfolder per meeting instead of flat files). Zero or multiple
//    matches go to the admin review queue instead of guessing. A copy,
//    not a move — Drive doesn't support genuinely moving a file between
//    two different people's accounts — so the original stays in the
//    shared folder untouched.
//
// 2. Reconcile every EXISTING session and library item's own Drive
//    folder against what the app has on record — a file dropped in by
//    hand shows up as a new recording/summary, and one deleted in Drive
//    disappears from the app too. This also backfills each row's cached
//    driveFolderId by matching folder names, which step 3 depends on.
//
// 3. Discover session/library-item folders the coach created directly in
//    Drive with no matching row in the app yet, and create one for each
//    — must run after step 2 so an older session that just hasn't been
//    reconciled yet doesn't look "new" here and get a duplicate created.

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

// Since Google's July 2026 change, Meet no longer drops recording files
// directly into the configured folder - it creates one subfolder per
// meeting inside it (recurring meetings share a single subfolder across
// every instance), alongside notes/transcript docs for the same meeting.
// Recordings can still show up flat too (either from before the change,
// or if Google hasn't rolled it out for this account yet), so both
// layouts are scanned: the folder's own files, plus one level into each
// of its subfolders. Only actual video files are treated as recordings -
// the notes/transcript docs living alongside them are ignored entirely.
async function findMeetRecordingFiles(
  meetRecordingsFolderId: string
): Promise<{ id: string; name: string; createdTime: string; mimeType: string; eventName: string }[]> {
  const topLevel = await listFolderFiles(meetRecordingsFolderId);
  const subfolders = await listSubfolders(meetRecordingsFolderId);

  const nested: { id: string; name: string; createdTime: string; mimeType: string; eventName: string }[] = [];
  for (const folder of subfolders) {
    const filesInFolder = await listFolderFiles(folder.id);
    for (const f of filesInFolder) nested.push({ ...f, eventName: extractEventName(folder.name) });
  }

  return [...topLevel.map((f) => ({ ...f, eventName: extractEventName(f.name) })), ...nested].filter((f) =>
    f.mimeType.startsWith("video/")
  );
}

async function runMeetImport(meetRecordingsFolderId: string) {
  const files = await findMeetRecordingFiles(meetRecordingsFolderId);
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
      const eventName = file.eventName;
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
  const clients = await prisma.client.findMany({
    select: { id: true, driveFolderId: true, driveMeetingsFolderId: true },
  });

  const sessions = await prisma.lessonSession.findMany({
    include: {
      summaryFiles: { select: { id: true, url: true } },
      client: { select: { driveFolderId: true, driveMeetingsFolderId: true } },
    },
  });
  let sessionErrors = 0;
  for (const { client, ...session } of sessions) {
    try {
      if (await removeSessionIfFolderGone(session)) continue;
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
      if (await removeLibraryItemIfFolderGone(item)) continue;
      await reconcileLibraryItemFolder(item);
    } catch (e) {
      libraryErrors++;
      console.error("Failed to reconcile library item Drive folder", item.id, e);
    }
  }

  let newSessionFolders = 0;
  for (const client of clients) {
    try {
      newSessionFolders += await discoverNewSessionFolders(client);
    } catch (e) {
      console.error("Failed to discover new session Drive folders", client.id, e);
    }
  }

  let newLibraryFolders = 0;
  try {
    newLibraryFolders = await discoverNewLibraryItemFolders();
  } catch (e) {
    console.error("Failed to discover new library item Drive folders", e);
  }

  return {
    sessionsChecked: sessions.length,
    sessionErrors,
    libraryItemsChecked: libraryItems.length,
    libraryErrors,
    newSessionFolders,
    newLibraryFolders,
  };
}

export async function runDriveSyncJob() {
  const connection = await getConnection();
  if (!connection) {
    return { ok: true as const, skipped: "Google Drive is not connected" };
  }

  const meetImport = connection.meetRecordingsFolderId
    ? await runMeetImport(connection.meetRecordingsFolderId)
    : { skipped: "no Meet Recordings folder configured" };

  const folderSync = await runFolderSync();

  return { ok: true as const, meetImport, folderSync };
}

// Meet recording import on its own, meant to run in the background after
// an admin page has already been sent to the browser (see
// `after()` in the authenticated admin layout) - since the Meet
// Recordings folder now lives in the coach's own Drive rather than one
// shared externally, there's no reason to only check it once a day; but
// unlike the per-client/library folder sync, there's no single page whose
// data it belongs to, so it can't block a page render the way those do
// without slowing down every admin navigation.
export async function syncMeetImportInBackground(): Promise<void> {
  const connection = await getConnection();
  if (!connection?.meetRecordingsFolderId) return;
  try {
    await runMeetImport(connection.meetRecordingsFolderId);
  } catch (e) {
    console.error("Failed to run background Meet import", e);
  }
}

// Runs just the folder-level sync (reconcile + discover new folders,
// same as runFolderSync) for a single client, scoped to that client's own
// sessions — cheap enough to run inline whenever the coach opens that
// client's page in the admin panel, so a folder created by hand in Drive
// shows up right away instead of waiting for the once-a-day cron. Meet
// recording import stays a scheduled/manual-only thing (see
// runDriveSyncJob) — there's no "the coach is looking at this specific
// page" moment that maps to it, since it isn't tied to one client.
export async function syncClientFolders(clientId: string): Promise<void> {
  const connection = await getConnection();
  if (!connection) return;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, driveFolderId: true, driveMeetingsFolderId: true },
  });
  if (!client?.driveFolderId) return;

  const sessions = await prisma.lessonSession.findMany({
    where: { clientId },
    include: { summaryFiles: { select: { id: true, url: true } } },
  });

  await Promise.all(
    sessions.map(async (session) => {
      try {
        if (await removeSessionIfFolderGone(session)) return;
        await reconcileSessionFolder(session, client);
      } catch (e) {
        console.error("Failed to reconcile session Drive folder", session.id, e);
      }
    })
  );

  try {
    await discoverNewSessionFolders(client);
  } catch (e) {
    console.error("Failed to discover new session Drive folders", client.id, e);
  }
}

// Same idea as syncClientFolders, for "ספריית תכנים" - run whenever the
// coach opens the library admin page.
export async function syncLibraryFolders(): Promise<void> {
  const connection = await getConnection();
  if (!connection) return;

  const items = await prisma.libraryItem.findMany();
  await Promise.all(
    items.map(async (item) => {
      try {
        if (await removeLibraryItemIfFolderGone(item)) return;
        await reconcileLibraryItemFolder(item);
      } catch (e) {
        console.error("Failed to reconcile library item Drive folder", item.id, e);
      }
    })
  );

  try {
    await discoverNewLibraryItemFolders();
  } catch (e) {
    console.error("Failed to discover new library item Drive folders", e);
  }
}
