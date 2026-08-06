import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { isHttpUrl, driveFileId } from "@/lib/external-links";
import { notifyClient } from "@/lib/notifications";
import { findOrCreateExercisesFolder, findOrCreateExerciseCategoryFolder, moveDriveFile } from "@/lib/google-drive-oauth";

async function renumberContainer(clientId: string, folderId: string | null) {
  const remaining = await prisma.exercise.findMany({ where: { clientId, folderId }, orderBy: { number: "asc" } });
  await prisma.$transaction(
    remaining.map((e, i) => prisma.exercise.update({ where: { id: e.id }, data: { number: i + 1 } }))
  );
}

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
    folderId?: string | null;
    number?: number;
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

  // Moving an exercise into a different category (or back to the top
  // level, via folderId: null) - it goes to the end of its new container
  // and its actual Drive files (if any) follow it there, same as a
  // library item moving between categories.
  let moveFrom: { folderId: string | null } | null = null;
  if ("folderId" in (body ?? {})) {
    const targetFolderId = typeof body.folderId === "string" && body.folderId ? body.folderId : null;
    const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId }, include: { folder: true } });
    if (!exercise || exercise.clientId !== clientId) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

    const targetFolder = targetFolderId ? await prisma.exerciseFolder.findUnique({ where: { id: targetFolderId } }) : null;
    if (targetFolderId && (!targetFolder || targetFolder.clientId !== clientId)) {
      return NextResponse.json({ error: "התיקייה לא נמצאה" }, { status: 404 });
    }

    if (targetFolderId !== exercise.folderId) {
      const count = await prisma.exercise.count({ where: { clientId, folderId: targetFolderId } });
      data.folderId = targetFolderId;
      data.number = count + 1;
      moveFrom = { folderId: exercise.folderId };

      try {
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (client?.driveFolderId) {
          let exercisesFolderId = client.driveExercisesFolderId;
          if (!exercisesFolderId) {
            exercisesFolderId = await findOrCreateExercisesFolder(client.driveFolderId);
            await prisma.client.update({ where: { id: clientId }, data: { driveExercisesFolderId: exercisesFolderId } });
          }
          const fromFolderId = exercise.folder?.driveFolderId ?? exercisesFolderId;

          let toFolderId = exercisesFolderId;
          if (targetFolder) {
            toFolderId =
              targetFolder.driveFolderId || (await findOrCreateExerciseCategoryFolder(exercisesFolderId, targetFolder.title));
            if (!targetFolder.driveFolderId) {
              await prisma.exerciseFolder.update({ where: { id: targetFolder.id }, data: { driveFolderId: toFolderId } });
            }
          }

          if (fromFolderId !== toFolderId) {
            for (const url of [exercise.audioFileUrl, exercise.pdfFileUrl]) {
              const fileId = url ? driveFileId(url) : null;
              if (fileId) await moveDriveFile(fileId, fromFolderId, toFolderId);
            }
          }
        }
      } catch (e) {
        console.error("Failed to move exercise's Drive files between folders", e);
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "אין מה לעדכן" }, { status: 400 });
  }

  const result = await prisma.exercise.updateMany({ where: { id: exerciseId, clientId }, data });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  if (data.audioFileUrl !== undefined && previousAudioUrl) await deleteUploadByUrl(previousAudioUrl);
  if (data.pdfFileUrl !== undefined && previousPdfUrl) await deleteUploadByUrl(previousPdfUrl);
  if (moveFrom) await renumberContainer(clientId, moveFrom.folderId);

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
  await renumberContainer(clientId, existing.folderId);

  return NextResponse.json({ ok: true });
}
