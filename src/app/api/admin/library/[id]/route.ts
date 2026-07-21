import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { isHttpUrl } from "@/lib/external-links";

const LINK_SLOTS = {
  video: { urlField: "videoFileUrl", nameField: "videoFileName" },
  audio: { urlField: "audioFileUrl", nameField: "audioFileName" },
  file: { urlField: "fileUrl", nameField: "fileName" },
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const data: Record<string, string | null> = {};

  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim();

  let previousUrl: string | null = null;
  let hasLinkUpdate = false;
  if (body?.slot === "video" || body?.slot === "audio" || body?.slot === "file") {
    const slot: "video" | "audio" | "file" = body.slot;
    const existing = await prisma.libraryItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    const fields = LINK_SLOTS[slot];
    hasLinkUpdate = true;
    previousUrl = existing[fields.urlField];

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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "אין מה לעדכן" }, { status: 400 });
  }

  const item = await prisma.libraryItem.update({ where: { id }, data });
  if (hasLinkUpdate && previousUrl) await deleteUploadByUrl(previousUrl);
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
  await prisma.libraryItem.delete({ where: { id } });

  const remaining = await prisma.libraryItem.findMany({ orderBy: { number: "asc" } });
  await prisma.$transaction(
    remaining.map((it, i) => prisma.libraryItem.update({ where: { id: it.id }, data: { number: i + 1 } }))
  );

  return NextResponse.json({ ok: true });
}
