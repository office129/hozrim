import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { notifyClient } from "@/lib/notifications";

// The coach replies to a specific client note. The reply is stored as an
// admin-authored note pointing at the client's note (parentId), shown
// beneath it in both the client app and the admin panel, and the client
// is notified in-app (+ push) that the coach answered.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId } = await params;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const parentId = typeof body?.parentId === "string" ? body.parentId : "";
  if (!text || !parentId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const session = await prisma.lessonSession.findFirst({ where: { id: sessionId, clientId } });
  if (!session) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  // The parent must be a client note on this same session.
  const parent = await prisma.sessionNote.findFirst({ where: { id: parentId, sessionId, author: "client" } });
  if (!parent) return NextResponse.json({ error: "ההערה לא נמצאה" }, { status: 404 });

  const note = await prisma.sessionNote.create({
    data: { sessionId, author: "admin", text, parentId },
  });

  await notifyClient(clientId, {
    type: "reply",
    title: `יוסף הגיב להערה שלך — ${session.title}`,
    link: `/app/recordings/${sessionId}`,
  });

  return NextResponse.json({ note });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId } = await params;

  const body = await req.json().catch(() => null);
  const noteId = typeof body?.noteId === "string" ? body.noteId : "";
  if (!noteId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  // Only an admin-authored reply on this client's session can be removed here.
  const result = await prisma.sessionNote.deleteMany({
    where: { id: noteId, author: "admin", session: { id: sessionId, clientId } },
  });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
