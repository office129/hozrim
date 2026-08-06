import { prisma } from "@/lib/prisma";
import { deleteUploadByUrl } from "@/lib/storage";
import { driveFileId } from "@/lib/external-links";
import { notifyClient } from "@/lib/notifications";
import {
  listFolderFiles,
  listSubfolders,
  folderExists,
  findOrCreateMeetingsFolder,
  findOrCreateSessionFolder,
  findOrCreateExercisesFolder,
  getOrCreateLibraryFolder,
  trashDriveFile,
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

// Same idea as removeSessionIfFolderGone, for a legacy library item that
// still has its own Drive folder (from before categories existed) - a
// newer item with no driveFolderId of its own has nothing here to check,
// since its files live directly in its container folder instead.
export async function removeLibraryItemIfFolderGone(item: {
  id: string;
  folderId: string | null;
  driveFolderId: string | null;
}): Promise<boolean> {
  if (!item.driveFolderId) return false;
  if (await folderExists(item.driveFolderId)) return false;

  await prisma.libraryItem.delete({ where: { id: item.id } });
  const remaining = await prisma.libraryItem.findMany({
    where: { folderId: item.folderId },
    orderBy: { number: "asc" },
  });
  await prisma.$transaction(
    remaining.map((it, i) => prisma.libraryItem.update({ where: { id: it.id }, data: { number: i + 1 } }))
  );
  return true;
}

// Same idea, for a category folder itself - if its Drive folder was
// deleted/trashed by hand, the lessons inside it lost their files along
// with it (they lived directly in that folder, not in one of their own),
// so they're removed the same way a session/item whose own folder
// disappeared would be.
export async function removeLibraryFolderIfDriveFolderGone(folder: {
  id: string;
  driveFolderId: string | null;
}): Promise<boolean> {
  if (!folder.driveFolderId) return false;
  if (await folderExists(folder.driveFolderId)) return false;

  const items = await prisma.libraryItem.findMany({ where: { folderId: folder.id } });
  for (const item of items) {
    await deleteUploadByUrl(item.videoFileUrl);
    await deleteUploadByUrl(item.audioFileUrl);
    await deleteUploadByUrl(item.fileUrl);
  }
  await prisma.libraryItem.deleteMany({ where: { folderId: folder.id } });
  await prisma.libraryFolder.delete({ where: { id: folder.id } });
  const remaining = await prisma.libraryFolder.findMany({ orderBy: { order: "asc" } });
  await prisma.$transaction(
    remaining.map((f, i) => prisma.libraryFolder.update({ where: { id: f.id }, data: { order: i } }))
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
        title: `הקלטה חדשה נוספה: ${session.title}`,
        link: `/app/recordings/${session.id}`,
      });
    }
  }
}

// Same idea as removeLibraryFolderIfDriveFolderGone, for an exercise
// category - if its Drive folder was deleted/trashed by hand, the
// exercises inside it lost their files along with it, so they're
// removed the same way.
export async function removeExerciseFolderIfDriveFolderGone(folder: {
  id: string;
  clientId: string;
  driveFolderId: string | null;
}): Promise<boolean> {
  if (!folder.driveFolderId) return false;
  if (await folderExists(folder.driveFolderId)) return false;

  const items = await prisma.exercise.findMany({ where: { folderId: folder.id } });
  for (const item of items) {
    await deleteUploadByUrl(item.audioFileUrl);
    await deleteUploadByUrl(item.pdfFileUrl);
  }
  await prisma.exercise.deleteMany({ where: { folderId: folder.id } });
  await prisma.exerciseFolder.delete({ where: { id: folder.id } });
  const remaining = await prisma.exerciseFolder.findMany({ where: { clientId: folder.clientId }, orderBy: { order: "asc" } });
  await prisma.$transaction(
    remaining.map((f, i) => prisma.exerciseFolder.update({ where: { id: f.id }, data: { order: i } }))
  );
  return true;
}

// Same idea as discoverNewLibraryFolders, for a client's "תרגולים"
// folder - a subfolder added by hand directly there becomes a new
// exercise category (not a new exercise itself - see
// syncExerciseFilesInFolder for what happens to files inside it).
export async function discoverNewExerciseFolders(client: {
  id: string;
  driveFolderId: string | null;
  driveExercisesFolderId: string | null;
}): Promise<number> {
  if (!client.driveFolderId) return 0;

  let exercisesFolderId = client.driveExercisesFolderId;
  if (!exercisesFolderId) {
    exercisesFolderId = await findOrCreateExercisesFolder(client.driveFolderId);
    await prisma.client.update({ where: { id: client.id }, data: { driveExercisesFolderId: exercisesFolderId } });
  }

  const subfolders = await listSubfolders(exercisesFolderId);
  const known = await prisma.exerciseFolder.findMany({
    where: { clientId: client.id },
    select: { driveFolderId: true },
  });
  const knownIds = new Set(known.map((f) => f.driveFolderId).filter((x): x is string => !!x));
  const newFolders = subfolders.filter((f) => !knownIds.has(f.id));

  for (const folder of newFolders) {
    const count = await prisma.exerciseFolder.count({ where: { clientId: client.id } });
    const created = await prisma.exerciseFolder.create({
      data: { clientId: client.id, title: folder.name, order: count, driveFolderId: folder.id },
    });
    // Sync its contents immediately - otherwise a file already sitting in
    // a category folder created just now would only show up on the next
    // sync run instead of right away.
    await syncExerciseCategoryFiles(created);
  }
  return newFolders.length;
}

// Reconciles loose files sitting directly in one Drive folder against
// the app-side exercises grouped under it (folderId null for the
// top-level "תרגולים" folder itself, or a specific category's id) - each
// loose file is its own exercise, since (unlike a session or library
// item) an exercise has no further-nested folder of its own to
// disambiguate multiple files by. A new file becomes a new exercise
// named after it; a known file that disappears clears that exercise's
// slot the same way any other Drive-synced slot would.
async function syncExerciseFilesInFolder(driveFolderId: string, clientId: string, folderId: string | null): Promise<number> {
  const [looseFiles, exercises] = await Promise.all([
    listFolderFiles(driveFolderId),
    prisma.exercise.findMany({ where: { clientId, folderId } }),
  ]);
  const currentIds = new Set(looseFiles.map((f) => f.id));

  for (const exercise of exercises) {
    const audioId = exercise.audioFileUrl ? driveFileId(exercise.audioFileUrl) : null;
    const pdfId = exercise.pdfFileUrl ? driveFileId(exercise.pdfFileUrl) : null;
    const data: { audioFileUrl?: null; audioFileName?: null; pdfFileUrl?: null; pdfFileName?: null } = {};
    if (audioId && !currentIds.has(audioId)) {
      data.audioFileUrl = null;
      data.audioFileName = null;
    }
    if (pdfId && !currentIds.has(pdfId)) {
      data.pdfFileUrl = null;
      data.pdfFileName = null;
    }
    if (Object.keys(data).length) {
      await prisma.exercise.update({ where: { id: exercise.id }, data });
    }
  }

  const knownIds = new Set(
    exercises
      .flatMap((e) => [e.audioFileUrl, e.pdfFileUrl])
      .map((u) => (u ? driveFileId(u) : null))
      .filter((x): x is string => !!x)
  );
  const newFiles = looseFiles.filter(
    (f) => !knownIds.has(f.id) && (f.mimeType === "application/pdf" || f.mimeType.startsWith("audio/"))
  );

  for (const file of newFiles) {
    const count = await prisma.exercise.count({ where: { clientId, folderId } });
    const title = file.name.replace(/\.[^./]+$/, "") || file.name;
    const url = `https://drive.google.com/file/d/${file.id}/view`;
    const isPdf = file.mimeType === "application/pdf";
    const exercise = await prisma.exercise.create({
      data: {
        clientId,
        folderId,
        number: count + 1,
        title,
        ...(isPdf ? { pdfFileUrl: url, pdfFileName: file.name } : { audioFileUrl: url, audioFileName: file.name }),
      },
    });
    await notifyClient(clientId, {
      type: "exercise",
      title: `תרגול חדש נוסף: ${exercise.title}`,
      link: "/app/exercises",
    });
  }

  return newFiles.length;
}

// The top-level half of syncExerciseFilesInFolder - a loose file dropped
// straight into the shared "תרגולים" folder itself (not inside any
// category) becomes a plain exercise, no folder.
export async function syncFlatExerciseFiles(client: {
  id: string;
  driveFolderId: string | null;
  driveExercisesFolderId: string | null;
}): Promise<number> {
  if (!client.driveFolderId) return 0;

  let exercisesFolderId = client.driveExercisesFolderId;
  if (!exercisesFolderId) {
    exercisesFolderId = await findOrCreateExercisesFolder(client.driveFolderId);
    await prisma.client.update({ where: { id: client.id }, data: { driveExercisesFolderId: exercisesFolderId } });
  }

  return syncExerciseFilesInFolder(exercisesFolderId, client.id, null);
}

// Same idea as syncFlatExerciseFiles, for one exercise category's own
// Drive folder - a loose file dropped into it becomes a new exercise
// inside that category.
export async function syncExerciseCategoryFiles(folder: { id: string; clientId: string; driveFolderId: string | null }): Promise<number> {
  if (!folder.driveFolderId) return 0;
  return syncExerciseFilesInFolder(folder.driveFolderId, folder.clientId, folder.id);
}

// Same idea as reconcileSessionFolder, for a legacy library item's own
// Drive folder (video/audio/generic-file slots). Only applies to an item
// that still has its own driveFolderId from before categories existed -
// a newer item's files live directly in a shared container folder (the
// top-level library folder, or its category's), where a loose file can't
// be reliably attributed to one specific lesson among possibly several
// sharing that folder, so those are only ever updated through the app.
export async function reconcileLibraryItemFolder(item: {
  id: string;
  videoFileUrl: string | null;
  audioFileUrl: string | null;
  fileUrl: string | null;
  driveFolderId: string | null;
}): Promise<void> {
  if (!item.driveFolderId) return;
  const folderId = item.driveFolderId;

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

// Same idea as discoverNewSessionFolders, for "ספריית תכנים" - a subfolder
// added by hand directly under the library folder becomes a new category,
// not a new lesson (a lesson has no folder of its own to be discovered
// this way anymore). Checks against both known category folders and
// legacy per-item folders, so an old item's own folder isn't mistakenly
// re-adopted as a new category.
export async function discoverNewLibraryFolders(): Promise<number> {
  const libraryFolderId = await getOrCreateLibraryFolder();
  const subfolders = await listSubfolders(libraryFolderId);
  const [knownFolders, knownItems] = await Promise.all([
    prisma.libraryFolder.findMany({ select: { driveFolderId: true } }),
    prisma.libraryItem.findMany({ select: { driveFolderId: true } }),
  ]);
  const knownIds = new Set(
    [...knownFolders.map((f) => f.driveFolderId), ...knownItems.map((i) => i.driveFolderId)].filter(
      (x): x is string => !!x
    )
  );
  const newFolders = subfolders.filter((f) => !knownIds.has(f.id));

  for (const folder of newFolders) {
    const count = await prisma.libraryFolder.count();
    await prisma.libraryFolder.create({
      data: { title: folder.name, order: count, driveFolderId: folder.id },
    });
  }
  return newFolders.length;
}
