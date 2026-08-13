import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import { notifyAdmins } from "@/lib/notifications";
import { getAppBaseUrl } from "@/lib/app-url";

// Once the admin has been emailed about a note, don't email again for the
// same editing session - only if the client comes back and writes more
// after this quiet window. Keeps a burst of edits to one email.
const NOTE_NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;
  const { sessionId } = await params;

  const session = await prisma.lessonSession.findFirst({ where: { id: sessionId, clientId } });
  if (!session) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json({ session });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;
  const { sessionId } = await params;

  const body = await req.json().catch(() => null);
  const data: { completed?: boolean; clientNote?: string } = {};
  if (typeof body?.completed === "boolean") data.completed = body.completed;
  if (typeof body?.clientNote === "string") data.clientNote = body.clientNote;

  const result = await prisma.lessonSession.updateMany({ where: { id: sessionId, clientId }, data });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const session = await prisma.lessonSession.findUnique({ where: { id: sessionId } });

  // The client signals `finalizeNote: true` when they finish editing (the
  // textarea loses focus), so the admin gets the complete note in one
  // email rather than a half-written one on every auto-save keystroke.
  if (body?.finalizeNote === true && session?.clientNote && session.clientNote.trim()) {
    const recentlyNotified =
      session.clientNoteNotifiedAt && Date.now() - session.clientNoteNotifiedAt.getTime() < NOTE_NOTIFY_COOLDOWN_MS;
    if (!recentlyNotified) {
      await prisma.lessonSession.update({ where: { id: sessionId }, data: { clientNoteNotifiedAt: new Date() } });
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
      const link = `${getAppBaseUrl()}/admin/clients/${clientId}?tab=notes`;
      await notifyAdmins(
        `הודעה חדשה מ${client?.name || "לקוח/ה"} — ${session.title}`,
        `${client?.name || "לקוח/ה"} כתב/ה הערה בשיעור "${session.title}":\n\n${session.clientNote}\n\nלמענה, היכנס/י לממשק הניהול:\n${link}`
      );
    }
  }

  return NextResponse.json({ session });
}
