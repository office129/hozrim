import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { isHttpUrl } from "@/lib/external-links";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId } = await params;

  const body = await req.json().catch(() => null);
  const data: { title?: string; summaryText?: string; mediaType?: string; fileUrl?: string; fileName?: string } = {};
  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body?.summaryText === "string") data.summaryText = body.summaryText;
  if (body?.mediaType === "video" || body?.mediaType === "audio") data.mediaType = body.mediaType;

  let previousFileUrl: string | null = null;
  if (typeof body?.fileUrl === "string") {
    if (!isHttpUrl(body.fileUrl)) {
      return NextResponse.json({ error: "קישור לא תקין" }, { status: 400 });
    }
    const existing = await prisma.lessonSession.findFirst({ where: { id: sessionId, clientId } });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    previousFileUrl = existing.fileUrl;
    data.fileUrl = body.fileUrl;
    data.fileName = typeof body?.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : body.fileUrl;
  }

  const result = await prisma.lessonSession.updateMany({
    where: { id: sessionId, clientId },
    data,
  });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  if (data.fileUrl && previousFileUrl) await deleteUploadByUrl(previousFileUrl);

  const session = await prisma.lessonSession.findUnique({ where: { id: sessionId } });
  return NextResponse.json({ session });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId } = await params;

  const existing = await prisma.lessonSession.findFirst({ where: { id: sessionId, clientId } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  await deleteUploadByUrl(existing.fileUrl);
  await deleteUploadByUrl(existing.summaryFileUrl);
  await prisma.lessonSession.delete({ where: { id: sessionId } });

  const remaining = await prisma.lessonSession.findMany({
    where: { clientId },
    orderBy: { number: "asc" },
  });
  await prisma.$transaction(
    remaining.map((s, i) => prisma.lessonSession.update({ where: { id: s.id }, data: { number: i + 1 } }))
  );

  return NextResponse.json({ ok: true });
}
