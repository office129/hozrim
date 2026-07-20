import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; exerciseId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, exerciseId } = await params;

  const body = await req.json().catch(() => null);
  const data: { title?: string } = {};
  if (typeof body?.title === "string" && body.title.trim()) data.title = body.title.trim();

  const result = await prisma.exercise.updateMany({ where: { id: exerciseId, clientId }, data });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
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
