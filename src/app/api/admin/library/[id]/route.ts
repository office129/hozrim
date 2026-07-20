import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם" }, { status: 400 });

  const item = await prisma.libraryItem.update({ where: { id }, data: { title } });
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
