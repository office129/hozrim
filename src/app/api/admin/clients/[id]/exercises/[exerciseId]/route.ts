import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { isHttpUrl } from "@/lib/external-links";
import { notifyClient } from "@/lib/notifications";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; exerciseId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, exerciseId } = await params;

  const body = await req.json().catch(() => null);
  const data: {
    title?: string;
    audioFileUrl?: string | null;
    audioFileName?: string | null;
    pdfFileUrl?: string | null;
    pdfFileName?: string | null;
  } = {};
  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim();

  let previousAudioUrl: string | null = null;
  let previousPdfUrl: string | null = null;
  const needsExisting =
    typeof body?.audioFileUrl === "string" ||
    typeof body?.pdfFileUrl === "string" ||
    body?.removeAudio === true ||
    body?.removePdf === true;
  const existing = needsExisting ? await prisma.exercise.findFirst({ where: { id: exerciseId, clientId } }) : null;
  if (needsExisting && !existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  if (body?.removeAudio === true) {
    previousAudioUrl = existing!.audioFileUrl;
    data.audioFileUrl = null;
    data.audioFileName = null;
  }
  if (body?.removePdf === true) {
    previousPdfUrl = existing!.pdfFileUrl;
    data.pdfFileUrl = null;
    data.pdfFileName = null;
  }

  if (typeof body?.audioFileUrl === "string") {
    if (!isHttpUrl(body.audioFileUrl)) {
      return NextResponse.json({ error: "קישור לא תקין" }, { status: 400 });
    }
    previousAudioUrl = existing!.audioFileUrl;
    data.audioFileUrl = body.audioFileUrl;
    data.audioFileName =
      typeof body?.audioFileName === "string" && body.audioFileName.trim() ? body.audioFileName.trim() : body.audioFileUrl;
  }

  if (typeof body?.pdfFileUrl === "string") {
    if (!isHttpUrl(body.pdfFileUrl)) {
      return NextResponse.json({ error: "קישור לא תקין" }, { status: 400 });
    }
    previousPdfUrl = existing!.pdfFileUrl;
    data.pdfFileUrl = body.pdfFileUrl;
    data.pdfFileName =
      typeof body?.pdfFileName === "string" && body.pdfFileName.trim() ? body.pdfFileName.trim() : body.pdfFileUrl;
  }

  // Whether this update is the exercise's first content of any kind -
  // computed before the write so "already had audio, now adding the PDF
  // too" doesn't notify again.
  const hadNoContentYet = !!existing && !existing.audioFileUrl && !existing.pdfFileUrl;

  const result = await prisma.exercise.updateMany({ where: { id: exerciseId, clientId }, data });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  if (data.audioFileUrl !== undefined && previousAudioUrl) await deleteUploadByUrl(previousAudioUrl);
  if (data.pdfFileUrl !== undefined && previousPdfUrl) await deleteUploadByUrl(previousPdfUrl);

  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (hadNoContentYet && (data.audioFileUrl || data.pdfFileUrl) && exercise) {
    await notifyClient(clientId, {
      type: "exercise",
      title: `תרגול חדש נוסף: ${exercise.title}`,
      link: "/app/exercises",
    });
  }

  return NextResponse.json({ exercise });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; exerciseId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, exerciseId } = await params;

  const existing = await prisma.exercise.findFirst({ where: { id: exerciseId, clientId } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  await deleteUploadByUrl(existing.audioFileUrl);
  await deleteUploadByUrl(existing.pdfFileUrl);
  await prisma.exercise.delete({ where: { id: exerciseId } });

  const remaining = await prisma.exercise.findMany({ where: { clientId }, orderBy: { number: "asc" } });
  await prisma.$transaction(
    remaining.map((e, i) => prisma.exercise.update({ where: { id: e.id }, data: { number: i + 1 } }))
  );

  return NextResponse.json({ ok: true });
}
