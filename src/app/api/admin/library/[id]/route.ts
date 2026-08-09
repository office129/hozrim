import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { isHttpUrl, driveFileId } from "@/lib/external-links";
import { trashDriveFile, getOrCreateLibraryFolder, findOrCreateLibraryCategoryFolder, moveDriveFile } from "@/lib/google-drive-oauth";
import { notifyAllClients } from "@/lib/notifications";

const LINK_SLOTS = {
  video: { urlField: "videoFileUrl", nameField: "videoFileName" },
  audio: { urlField: "audioFileUrl", nameField: "audioFileName" },
  file: { urlField: "fileUrl", nameField: "fileName" },
} as const;

async function renumberContainer(folderId: string | null) {
  const remaining = await prisma.libraryItem.findMany({ where: { folderId }, orderBy: { number: "asc" } });
  await prisma.$transaction(
    remaining.map((it, i) => prisma.libraryItem.update({ where: { id: it.id }, data: { number: i + 1 } }))
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const data: Record<string, string | number | null> = {};

  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim();

  let previousUrl: string | null = null;
  let hasLinkUpdate = false;
  let hadNoContentYet = false;
  if (body?.slot === "video" || body?.slot === "audio" || body?.slot === "file") {
    const slot: "video" | "audio" | "file" = body.slot;
    const existing = await prisma.libraryItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    const fields = LINK_SLOTS[slot];
    hasLinkUpdate = true;
    previousUrl = existing[fields.urlField];
    // Whether this update is the item's first content of any kind - a
    // second file added afterward shouldn't notify all clients again.
    hadNoContentYet = !existing.videoFileUrl && !existing.audioFileUrl && !existing.fileUrl;

    if (body?.remove === true) {
      data[fields.urlField] = null;
      data[fields.nameField] = null;
    } else {
      if (typeof body?.url !== "string" || !isHttpUrl(body.url)) {
        return NextResponse.json({ error: "קישור לא תקין" }, { status: 400 });
      }
      data[fields.urlField] = body.url;
      data[fields.nameField] = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : body.url;
    }
  }

  // Moving a lesson into a different category (or back to the top level,
  // via folderId: null) - it goes to the end of its new container and the
  // gap it leaves behind in the old one is closed up.
  let moveFrom: { folderId: string | null } | null = null;
  if ("folderId" in (body ?? {})) {
    const targetFolderId = typeof body.folderId === "string" && body.folderId ? body.folderId : null;
    const existing = await prisma.libraryItem.findUnique({ where: { id }, include: { folder: true } });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

    const targetFolder = targetFolderId ? await prisma.libraryFolder.findUnique({ where: { id: targetFolderId } }) : null;
    if (targetFolderId && !targetFolder) return NextResponse.json({ error: "התיקייה לא נמצאה" }, { status: 404 });

    if (targetFolderId !== existing.folderId) {
      const count = await prisma.libraryItem.count({ where: { folderId: targetFolderId } });
      data.folderId = targetFolderId;
      data.number = count + 1;
      moveFrom = { folderId: existing.folderId };

      // A legacy item with its own Drive folder keeps its files there
      // regardless of grouping - only a newer item (files living directly
      // in a shared container folder) needs its actual files moved along
      // with it.
      if (!existing.driveFolderId) {
        try {
          const libraryFolderId = await getOrCreateLibraryFolder();
          const fromFolderId = existing.folder?.driveFolderId ?? libraryFolderId;

          let toFolderId = libraryFolderId;
          if (targetFolder) {
            toFolderId = targetFolder.driveFolderId || (await findOrCreateLibraryCategoryFolder(libraryFolderId, targetFolder.title));
            if (!targetFolder.driveFolderId) {
              await prisma.libraryFolder.update({ where: { id: targetFolder.id }, data: { driveFolderId: toFolderId } });
            }
          }

          if (fromFolderId !== toFolderId) {
            for (const url of [existing.videoFileUrl, existing.audioFileUrl, existing.fileUrl]) {
              const fileId = url ? driveFileId(url) : null;
              if (fileId) await moveDriveFile(fileId, fromFolderId, toFolderId);
            }
          }
        } catch (e) {
          console.error("Failed to move library item's Drive files between folders", e);
        }
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "אין מה לעדכן" }, { status: 400 });
  }

  const item = await prisma.libraryItem.update({ where: { id }, data });
  if (hasLinkUpdate && previousUrl) await deleteUploadByUrl(previousUrl);
  if (moveFrom) await renumberContainer(moveFrom.folderId);
  if (hadNoContentYet && (data.videoFileUrl || data.audioFileUrl || data.fileUrl)) {
    await notifyAllClients({ title: `תוכן חדש נוסף לספריית התכנים: ${item.title}`, link: "/app/roadmap" });
  }
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const existing = await prisma.libraryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  await deleteUploadByUrl(existing.videoFileUrl);
  await deleteUploadByUrl(existing.audioFileUrl);
  await deleteUploadByUrl(existing.fileUrl);
  // The calls above only trash files the app already knew about — the
  // item's own Drive folder (and anything dropped into it by hand) needs
  // its own trash so it doesn't linger as orphaned clutter.
  if (existing.driveFolderId) {
    try {
      await trashDriveFile(existing.driveFolderId);
    } catch (e) {
      console.error("Failed to trash library item's Drive folder", e);
    }
  }
  await prisma.libraryItem.delete({ where: { id } });
  await renumberContainer(existing.folderId);

  return NextResponse.json({ ok: true });
}
