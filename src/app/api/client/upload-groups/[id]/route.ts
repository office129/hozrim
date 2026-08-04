import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireNonPreviewClient, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { trashDriveFile } from "@/lib/google-drive-oauth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clientId = await requireNonPreviewClient();
  if (isResponse(clientId)) return clientId;
  const { id } = await params;

  const group = await prisma.personalUploadGroup.findFirst({ where: { id, clientId }, include: { files: true } });
  if (!group) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  for (const file of group.files) {
    await deleteUploadByUrl(file.url);
  }
  // The loop above trashes files the app already knew about - the
  // group's own Drive folder (and anything dropped into it by hand)
  // needs its own trash so it doesn't linger as orphaned clutter.
  if (group.driveFolderId) {
    try {
      await trashDriveFile(group.driveFolderId);
    } catch (e) {
      console.error("Failed to trash personal upload group's Drive folder", e);
    }
  }

  await prisma.personalUploadGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
