import { prisma } from "@/lib/prisma";
import { copyDriveFile, findOrCreateMeetingsFolder, findOrCreateSessionFolder } from "@/lib/google-drive-oauth";

// Google appends " (date time)" to every Meet recording's filename —
// stripped off here to get back the actual meeting name the coach named
// the calendar invite.
export function extractEventName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
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
  const eventName = extractEventName(file.name);
  const sessionTitle = `${eventName} - ${formatMeetingDate(recordingDate)}`;
  const sessionFolderId = await findOrCreateSessionFolder(meetingsFolderId, sessionTitle);
  const copiedFileId = await copyDriveFile(file.id, sessionFolderId, file.name);

  const count = await prisma.lessonSession.count({ where: { clientId: client.id } });
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
