import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { importMeetRecordingForClient } from "@/lib/meet-import";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!clientId) return NextResponse.json({ error: "יש לבחור לקוח/ה" }, { status: 400 });

  const [pending, client] = await Promise.all([
    prisma.meetRecordingImport.findUnique({ where: { id } }),
    prisma.client.findUnique({ where: { id: clientId } }),
  ]);
  if (!pending) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  if (!client) return NextResponse.json({ error: "לקוח/ה לא נמצא/ה" }, { status: 404 });
  if (!client.driveFolderId) {
    return NextResponse.json({ error: "ללקוח/ה הזה/ו אין תיקיית דרייב מקושרת" }, { status: 400 });
  }

  try {
    const sessionId = await importMeetRecordingForClient(
      { id: pending.driveFileId, name: pending.fileName, createdTime: (pending.recordingDate ?? pending.createdAt).toISOString() },
      client
    );
    await prisma.meetRecordingImport.update({
      where: { id },
      data: { status: "matched", clientId, sessionId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to manually resolve Meet import", e);
    return NextResponse.json({ error: "ההעברה לדרייב נכשלה" }, { status: 502 });
  }
}
