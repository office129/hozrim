import { prisma } from "@/lib/prisma";
import { copyDriveFile, findOrCreateMeetingsFolder, findOrCreateSessionFolder } from "@/lib/google-drive-oauth";

// Google appends " (date time)" to a Meet recording's filename (older,
// flat layout) or leaves it off a per-meeting subfolder's own name
// (current layout, since a recurring meeting's subfolder covers every
// instance) - stripped off here, when present, to get back the actual
// meeting name the coach named the calendar invite. A no-op when there's
// no such suffix, so it's safe to call on either kind of name.
export function extractEventName(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  const parenIndex = withoutExt.lastIndexOf(" (");
  return (parenIndex > 0 ? withoutExt.slice(0, parenIndex) : withoutExt).trim();
}

export function formatMeetingDate(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

// Copies a Meet recording into the given client's own session folder and
// creates the corresponding session — the same action whether a client
// was matched automatically (by name) or picked by hand from the review
// queue. Throws if the client has no Drive folder linked at all.
export async function importMeetRecordingForClient(
  file: { id: string; name: string; createdTime: string },
  client: { id: string; driveFolderId: string | null; driveMeetingsFolderId: string | null }
): Promise<string> {
  if (!client.driveFolderId) throw new Error("client has no Drive folder linked");

  let meetingsFolderId = client.driveMeetingsFolderId;
  if (!meetingsFolderId) {
    meetingsFolderId = await findOrCreateMeetingsFolder(client.driveFolderId);
    await prisma.client.update({ where: { id: client.id }, data: { driveMeetingsFolderId: meetingsFolderId } });
  }

  const recordingDate = new Date(file.createdTime);
  // The Meet event name (e.g. "עדן יוסף ברוך - ליווי אישי") is only used
  // to match the recording to this client - the session/folder itself is
  // named "פגישה N - תאריך", same auto-numbering as every other session.
  const count = await prisma.lessonSession.count({ where: { clientId: client.id } });
  const sessionTitle = `פגישה ${count + 1} - ${formatMeetingDate(recordingDate)}`;
  const sessionFolderId = await findOrCreateSessionFolder(meetingsFolderId, sessionTitle);
  const copiedFileId = await copyDriveFile(file.id, sessionFolderId, file.name);

  const session = await prisma.lessonSession.create({
    data: {
      clientId: client.id,
      number: count + 1,
      title: sessionTitle,
      mediaType: "video",
      fileUrl: `https://drive.google.com/file/d/${copiedFileId}/view`,
      fileName: file.name,
    },
  });

  return session.id;
}
