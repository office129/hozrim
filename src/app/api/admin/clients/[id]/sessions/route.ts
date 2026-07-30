import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { findOrCreateMeetingsFolder, findOrCreateSessionFolder } from "@/lib/google-drive-oauth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId } = await params;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לשיעור" }, { status: 400 });

  const count = await prisma.lessonSession.count({ where: { clientId } });
  const session = await prisma.lessonSession.create({
    data: { clientId, title, number: count + 1 },
  });

  // Best-effort: create the session's own Drive folder (named exactly
  // after its title) right away instead of waiting for the first upload,
  // so it's already there and ready — matching what the coach expects to
  // see the moment a session is added, not only once a recording comes in.
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (client?.driveFolderId) {
    try {
      let meetingsFolderId = client.driveMeetingsFolderId;
      if (!meetingsFolderId) {
        meetingsFolderId = await findOrCreateMeetingsFolder(client.driveFolderId);
        await prisma.client.update({ where: { id: clientId }, data: { driveMeetingsFolderId: meetingsFolderId } });
      }
      await findOrCreateSessionFolder(meetingsFolderId, session.title);
    } catch (e) {
      console.error("Failed to create Drive folder for new session", e);
    }
  }

  return NextResponse.json({ session });
}
