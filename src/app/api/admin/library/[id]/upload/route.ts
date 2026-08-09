import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { saveUpload, deleteUploadByUrl, UploadValidationError, UploadKind } from "@/lib/storage";
import { notifyAllClients } from "@/lib/notifications";

const SLOT_KIND: Record<string, UploadKind> = { video: "video", audio: "audio", file: "file" };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const existing = await prisma.libraryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const slot = form?.get("slot");
  if (!(file instanceof File) || typeof slot !== "string" || !SLOT_KIND[slot]) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  // Whether this upload is the item's first content of any kind - a
  // second file added afterward shouldn't notify all clients again.
  const hadNoContentYet = !existing.videoFileUrl && !existing.audioFileUrl && !existing.fileUrl;

  try {
    const { url, fileName } = await saveUpload(file, SLOT_KIND[slot], "library");
    let item;
    if (slot === "video") {
      await deleteUploadByUrl(existing.videoFileUrl);
      item = await prisma.libraryItem.update({
        where: { id },
        data: { videoFileUrl: url, videoFileName: fileName },
      });
    } else if (slot === "audio") {
      await deleteUploadByUrl(existing.audioFileUrl);
      item = await prisma.libraryItem.update({
        where: { id },
        data: { audioFileUrl: url, audioFileName: fileName },
      });
    } else {
      await deleteUploadByUrl(existing.fileUrl);
      item = await prisma.libraryItem.update({
        where: { id },
        data: { fileUrl: url, fileName },
      });
    }
    if (hadNoContentYet) {
      await notifyAllClients({ title: `תוכן חדש נוסף לספריית התכנים: ${item.title}`, link: "/app/roadmap" });
    }
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
