import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { trashDriveFile } from "@/lib/google-drive-oauth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; folderId: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, folderId } = await params;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לתיקייה" }, { status: 400 });

  const existing = await prisma.exerciseFolder.findFirst({ where: { id: folderId, clientId } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const folder = await prisma.exerciseFolder.update({ where: { id: folderId }, data: { title } });
  return NextResponse.json({ folder });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; folderId: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, folderId } = await params;

  const existing = await prisma.exerciseFolder.findFirst({ where: { id: folderId, clientId }, include: { items: true } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  for (const item of existing.items) {
    await deleteUploadByUrl(item.audioFileUrl);
    await deleteUploadByUrl(item.pdfFileUrl);
  }
  await prisma.exercise.deleteMany({ where: { folderId } });

  // The calls above only trash files the app already knew about - the
  // category's own Drive folder (and anything dropped into it by hand)
  // needs its own trash so it doesn't linger as orphaned clutter.
  if (existing.driveFolderId) {
    try {
      await trashDriveFile(existing.driveFolderId);
    } catch (e) {
      console.error("Failed to trash exercise category's Drive folder", e);
    }
  }
  await prisma.exerciseFolder.delete({ where: { id: folderId } });

  const remaining = await prisma.exerciseFolder.findMany({ where: { clientId }, orderBy: { order: "asc" } });
  await prisma.$transaction(
    remaining.map((f, i) => prisma.exerciseFolder.update({ where: { id: f.id }, data: { order: i } }))
  );

  return NextResponse.json({ ok: true });
}
