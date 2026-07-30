import { prisma } from "@/lib/prisma";
import { driveFileId } from "@/lib/external-links";
import { notifyClient } from "@/lib/notifications";
import {
  listFolderFiles,
  listSubfolders,
  folderExists,
  findOrCreateMeetingsFolder,
  findOrCreateSessionFolder,
  getOrCreateLibraryFolder,
  findOrCreateLibraryItemFolder,
} from "@/lib/google-drive-oauth";

// Notices that a session's own Drive folder was deleted (or trashed) in
// Drive itself, rather than a file being removed from within it —
// listFolderFiles alone can't catch this, since it only reports the
// folder's children and has no way to say the folder itself is gone.
// When that happens the session is removed the same way deleting it in
// the app would (renumbering the rest), completing the other half of
// "delete in one place, it disappears in the other."
export async function removeSessionIfFolderGone(session: {
  id: string;
  clientId: string;
  driveFolderId: string | null;
}): Promise<boolean> {
  if (!session.driveFolderId) return false;
  if (await folderExists(session.driveFolderId)) return false;

  await prisma.lessonSession.delete({ where: { id: session.id } });
  const remaining = await prisma.lessonSession.findMany({
    where: { clientId: session.clientId },
    orderBy: { number: "asc" },
  });
  await prisma.$transaction(
    remaining.map((s, i) => prisma.lessonSession.update({ where: { id: s.id }, data: { number: i + 1 } }))
  );
  return true;
}

// Same idea as removeSessionIfFolderGone, for a library item.
export async function removeLibraryItemIfFolderGone(item: {
  id: string;
  driveFolderId: string | null;
}): Promise<boolean> {
  if (!item.driveFolderId) return false;
  if (await folderExists(item.driveFolderId)) return false;

  await prisma.libraryItem.delete({ where: { id: item.id } });
  const remaining = await prisma.libraryItem.findMany({ orderBy: { number: "asc" } });
  await prisma.$transaction(
    remaining.map((it, i) => prisma.libraryItem.update({ where: { id: it.id }, data: { number: i + 1 } }))
  );
  return true;
}

// Reconciles one session's own Drive folder against what the app already
// has recorded for it — the other half of "drop a file into the folder
// and it shows up in the app" (the app-side upload already puts new
// files straight into the folder; this is what makes the reverse
// direction, and deletions in either direction, actually show up too).
//
// Additions: a file in the folder that isn't already the known recording
// or one of the known summary PDFs gets claimed — a PDF always becomes a
// new summary file, a video/audio file only takes the main recording
// slot if that slot is empty (so a second video/audio dropped in
// alongside an existing recording is left alone rather than silently
// replacing it).
//
// Deletions: a recording or summary file the app has on record but that
// no longer exists in the folder (deleted or trashed in Drive) is cleared
// from the app the same way — a session's main recording resets to "not
// uploaded yet", a missing summary file's row is removed.
export async function reconcileSessionFolder(
  session: {
    id: string;
    clientId: string;
    title: string;
    fileUrl: string | null;
    driveFolderId: string | null;
    summaryFiles: { id: string; url: string }[];
  },
  client: { driveFolderId: string | null; driveMeetingsFolderId: string | null }
): Promise<void> {
  if (!client.driveFolderId) return;

  let sessionFolderId = session.driveFolderId;
  if (!sessionFolderId) {
    let meetingsFolderId = client.driveMeetingsFolderId;
    if (!meetingsFolderId) {
      meetingsFolderId = await findOrCreateMeetingsFolder(client.driveFolderId);
      await prisma.client.update({ where: { id: session.clientId }, data: { driveMeetingsFolderId: meetingsFolderId } });
    }
    sessionFolderId = await findOrCreateSessionFolder(meetingsFolderId, session.title);
    await prisma.lessonSession.update({ where: { id: session.id }, data: { driveFolderId: sessionFolderId } });
  }

  const files = await listFolderFiles(sessionFolderId);
  const currentIds = new Set(files.map((f) => f.id));

  const mainId = session.fileUrl ? driveFileId(session.fileUrl) : null;
  let hasMain = !!mainId && currentIds.has(mainId);
  if (mainId && !hasMain) {
    await prisma.lessonSession.update({
      where: { id: session.id },
      data: { fileUrl: null, fileName: null, mediaType: null },
    });
  }

  for (const summary of session.summaryFiles) {
    const fid = driveFileId(summary.url);
    if (fid && !currentIds.has(fid)) {
      await prisma.sessionSummaryFile.delete({ where: { id: summary.id } }).catch(() => {});
    }
  }

  const knownIds = new Set(
    [mainId, ...session.summaryFiles.map((s) => driveFileId(s.url))].filter((x): x is string => !!x)
  );
  const newFiles = files.filter((f) => !knownIds.has(f.id));

  for (const file of newFiles) {
    if (file.mimeType === "application/pdf") {
      const last = await prisma.sessionSummaryFile.findFirst({
        where: { sessionId: session.id },
        orderBy: { order: "desc" },
      });
      await prisma.sessionSummaryFile.create({
        data: {
          sessionId: session.id,
          url: `https://drive.google.com/file/d/${file.id}/view`,
          fileName: file.name,
          order: (last?.order ?? -1) + 1,
        },
      });
    } else if (!hasMain && (file.mimeType.startsWith("video/") || file.mimeType.startsWith("audio/"))) {
      await prisma.lessonSession.update({
        where: { id: session.id },
        data: {
          fileUrl: `https://drive.google.com/file/d/${file.id}/view`,
          fileName: file.name,
          mediaType: file.mimeType.startsWith("audio/") ? "audio" : "video",
        },
      });
      hasMain = true;
      await notifyClient(session.clientId, {
        type: "session",
        title: `הוקלטה חדשה נוספה: ${session.title}`,
        link: `/app/recordings/${session.id}`,
      });
    }
  }
}

// Same idea as reconcileSessionFolder, for a library item's video/audio/
// generic-file slots.
export async function reconcileLibraryItemFolder(item: {
  id: string;
  title: string;
  videoFileUrl: string | null;
  audioFileUrl: string | null;
  fileUrl: string | null;
  driveFolderId: string | null;
}): Promise<void> {
  let folderId = item.driveFolderId;
  if (!folderId) {
    const libraryFolderId = await getOrCreateLibraryFolder();
    folderId = await findOrCreateLibraryItemFolder(libraryFolderId, item.title);
    await prisma.libraryItem.update({ where: { id: item.id }, data: { driveFolderId: folderId } });
  }

  const files = await listFolderFiles(folderId);
  const currentIds = new Set(files.map((f) => f.id));

  const videoId = item.videoFileUrl ? driveFileId(item.videoFileUrl) : null;
  const audioId = item.audioFileUrl ? driveFileId(item.audioFileUrl) : null;
  const genericId = item.fileUrl ? driveFileId(item.fileUrl) : null;

  let hasVideo = !!videoId && currentIds.has(videoId);
  let hasAudio = !!audioId && currentIds.has(audioId);
  let hasGeneric = !!genericId && currentIds.has(genericId);

  const data: { videoFileUrl?: null; videoFileName?: null; audioFileUrl?: null; audioFileName?: null; fileUrl?: null; fileName?: null } = {};
  if (videoId && !hasVideo) {
    data.videoFileUrl = null;
    data.videoFileName = null;
  }
  if (audioId && !hasAudio) {
    data.audioFileUrl = null;
    data.audioFileName = null;
  }
  if (genericId && !hasGeneric) {
    data.fileUrl = null;
    data.fileName = null;
  }

  const knownIds = new Set([videoId, audioId, genericId].filter((x): x is string => !!x));
  const newFiles = files.filter((f) => !knownIds.has(f.id));
  const updates: Record<string, string> = {};

  for (const file of newFiles) {
    const url = `https://drive.google.com/file/d/${file.id}/view`;
    if (!hasVideo && file.mimeType.startsWith("video/")) {
      updates.videoFileUrl = url;
      updates.videoFileName = file.name;
      hasVideo = true;
    } else if (!hasAudio && file.mimeType.startsWith("audio/")) {
      updates.audioFileUrl = url;
      updates.audioFileName = file.name;
      hasAudio = true;
    } else if (!hasGeneric) {
      updates.fileUrl = url;
      updates.fileName = file.name;
      hasGeneric = true;
    }
  }

  if (Object.keys(data).length || Object.keys(updates).length) {
    await prisma.libraryItem.update({ where: { id: item.id }, data: { ...data, ...updates } });
  }
}

// Notices a session folder the coach created by hand directly inside
// "פגישות והקלטות", with no matching session in the app yet — creates one
// (named after the folder, same one-to-one naming as everywhere else) and
// immediately reconciles it so any file already sitting inside shows up
// right away rather than waiting for the next run.
//
// Must run after existing sessions have already been reconciled at least
// once (reconcileSessionFolder backfills driveFolderId by name for older
// sessions) — otherwise a not-yet-backfilled existing session's folder
// would look "new" here and get a duplicate session created for it.
export async function discoverNewSessionFolders(client: {
  id: string;
  driveFolderId: string | null;
  driveMeetingsFolderId: string | null;
}): Promise<number> {
  if (!client.driveFolderId) return 0;

  let meetingsFolderId = client.driveMeetingsFolderId;
  if (!meetingsFolderId) {
    meetingsFolderId = await findOrCreateMeetingsFolder(client.driveFolderId);
    await prisma.client.update({ where: { id: client.id }, data: { driveMeetingsFolderId: meetingsFolderId } });
  }

  const subfolders = await listSubfolders(meetingsFolderId);
  const known = await prisma.lessonSession.findMany({
    where: { clientId: client.id },
    select: { driveFolderId: true },
  });
  const knownIds = new Set(known.map((s) => s.driveFolderId).filter((x): x is string => !!x));
  const newFolders = subfolders.filter((f) => !knownIds.has(f.id));

  for (const folder of newFolders) {
    const count = await prisma.lessonSession.count({ where: { clientId: client.id } });
    const session = await prisma.lessonSession.create({
      data: { clientId: client.id, number: count + 1, title: folder.name, driveFolderId: folder.id },
    });
    await reconcileSessionFolder(
      { id: session.id, clientId: client.id, title: session.title, fileUrl: null, driveFolderId: folder.id, summaryFiles: [] },
      client
    );
  }
  return newFolders.length;
}

// Same idea as discoverNewSessionFolders, for "ספריית תכנים".
export async function discoverNewLibraryItemFolders(): Promise<number> {
  const libraryFolderId = await getOrCreateLibraryFolder();
  const subfolders = await listSubfolders(libraryFolderId);
  const known = await prisma.libraryItem.findMany({ select: { driveFolderId: true } });
  const knownIds = new Set(known.map((i) => i.driveFolderId).filter((x): x is string => !!x));
  const newFolders = subfolders.filter((f) => !knownIds.has(f.id));

  for (const folder of newFolders) {
    const count = await prisma.libraryItem.count();
    const item = await prisma.libraryItem.create({
      data: { title: folder.name, number: count + 1, driveFolderId: folder.id },
    });
    await reconcileLibraryItemFolder({
      id: item.id,
      title: item.title,
      videoFileUrl: null,
      audioFileUrl: null,
      fileUrl: null,
      driveFolderId: folder.id,
    });
  }
  return newFolders.length;
}
