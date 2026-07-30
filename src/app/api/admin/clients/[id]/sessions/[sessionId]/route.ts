import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { isHttpUrl } from "@/lib/external-links";
import { trashDriveFile } from "@/lib/google-drive-oauth";
import { notifyClient } from "@/lib/notifications";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId } = await params;

  const body = await req.json().catch(() => null);
  const data: {
    title?: string;
    summaryText?: string;
    mediaType?: string;
    fileUrl?: string | null;
    fileName?: string | null;
  } = {};
  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body?.summaryText === "string") data.summaryText = body.summaryText;
  if (body?.mediaType === "video" || body?.mediaType === "audio") data.mediaType = body.mediaType;

  let previousFileUrl: string | null = null;
  const needsExisting = typeof body?.fileUrl === "string";
  const existing = needsExisting
    ? await prisma.lessonSession.findFirst({ where: { id: sessionId, clientId } })
    : null;
  if (needsExisting && !existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  if (typeof body?.fileUrl === "string") {
    if (!isHttpUrl(body.fileUrl)) {
      return NextResponse.json({ error: "קישור לא תקין" }, { status: 400 });
    }
    previousFileUrl = existing!.fileUrl;
    data.fileUrl = body.fileUrl;
    data.fileName = typeof body?.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : body.fileUrl;
  }

  const result = await prisma.lessonSession.updateMany({
    where: { id: sessionId, clientId },
    data,
  });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  if (data.fileUrl !== undefined && previousFileUrl) await deleteUploadByUrl(previousFileUrl);

  const session = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    include: { summaryFiles: { orderBy: { order: "asc" } } },
  });

  // Notify only the first time a recording becomes available for this
  // session, not on every later edit/replacement.
  if (data.fileUrl && !previousFileUrl && session) {
    await notifyClient(clientId, {
      type: "session",
      title: `הוקלטה חדשה נוספה: ${session.title}`,
      link: `/app/recordings/${session.id}`,
    });
  }

  return NextResponse.json({ session });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId } = await params;

  const existing = await prisma.lessonSession.findFirst({
    where: { id: sessionId, clientId },
    include: { summaryFiles: true },
  });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  await deleteUploadByUrl(existing.fileUrl);
  for (const f of existing.summaryFiles) {
    await deleteUploadByUrl(f.url);
  }
  // The loop above only trashes files the app already knew about — the
  // session's own Drive folder (and anything dropped into it by hand)
  // needs its own trash so it doesn't linger as orphaned clutter.
  if (existing.driveFolderId) {
    try {
      await trashDriveFile(existing.driveFolderId);
    } catch (e) {
      console.error("Failed to trash session's Drive folder", e);
    }
  }
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
