import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { renameDriveFile, trashDriveFile } from "@/lib/google-drive-oauth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לתיקייה" }, { status: 400 });

  const existing = await prisma.libraryFolder.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const folder = await prisma.libraryFolder.update({ where: { id }, data: { title } });
  if (existing.driveFolderId) {
    try {
      await renameDriveFile(existing.driveFolderId, title);
    } catch (e) {
      console.error("Failed to rename library category's Drive folder", e);
    }
  }

  return NextResponse.json({ folder });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const existing = await prisma.libraryFolder.findUnique({ where: { id }, include: { items: true } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  for (const item of existing.items) {
    await deleteUploadByUrl(item.videoFileUrl);
    await deleteUploadByUrl(item.audioFileUrl);
    await deleteUploadByUrl(item.fileUrl);
    // A legacy item (from before categories existed) that later got moved
    // into this one still has its own separate Drive folder - trash that
    // too, same as deleting it on its own would.
    if (item.driveFolderId) {
      try {
        await trashDriveFile(item.driveFolderId);
      } catch (e) {
        console.error("Failed to trash legacy library item's Drive folder", e);
      }
    }
  }
  await prisma.libraryItem.deleteMany({ where: { folderId: id } });

  // The calls above only trash files the app already knew about - the
  // category's own Drive folder (and anything dropped into it by hand)
  // needs its own trash so it doesn't linger as orphaned clutter.
  if (existing.driveFolderId) {
    try {
      await trashDriveFile(existing.driveFolderId);
    } catch (e) {
      console.error("Failed to trash library category's Drive folder", e);
    }
  }
  await prisma.libraryFolder.delete({ where: { id } });

  const remaining = await prisma.libraryFolder.findMany({ orderBy: { order: "asc" } });
  await prisma.$transaction(
    remaining.map((f, i) => prisma.libraryFolder.update({ where: { id: f.id }, data: { order: i } }))
  );

  return NextResponse.json({ ok: true });
}
