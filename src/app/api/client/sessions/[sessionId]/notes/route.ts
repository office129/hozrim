import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import { notifyAdmins } from "@/lib/notifications";
import { getAppBaseUrl } from "@/lib/app-url";

// The client confirms a note to the coach about this session. Each note is
// its own entry (a thread), and each one emails the admins with the full
// text and a link straight to the client's notes tab in the admin panel.
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;
  const { sessionId } = await params;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "נא לכתוב משהו" }, { status: 400 });

  const session = await prisma.lessonSession.findFirst({ where: { id: sessionId, clientId } });
  if (!session) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const note = await prisma.sessionNote.create({ data: { sessionId, text } });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const link = `${getAppBaseUrl()}/admin/clients/${clientId}?tab=notes`;
  await notifyAdmins(
    `הודעה חדשה מ${client?.name || "לקוח/ה"} — ${session.title}`,
    `${client?.name || "לקוח/ה"} כתב/ה הערה בשיעור "${session.title}":\n\n${text}\n\nלמענה, היכנס/י לממשק הניהול:\n${link}`
  );

  return NextResponse.json({ note });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;
  const { sessionId } = await params;

  const body = await req.json().catch(() => null);
  const noteId = typeof body?.noteId === "string" ? body.noteId : "";
  if (!noteId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  // Scope the delete to a client-authored note on a session this client
  // owns - so they can't delete another client's note, nor the coach's
  // replies. (Deleting their own note cascades its replies away too.)
  const result = await prisma.sessionNote.deleteMany({
    where: { id: noteId, author: "client", session: { id: sessionId, clientId } },
  });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
