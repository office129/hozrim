import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const pending = await prisma.meetRecordingImport.findUnique({ where: { id } });
  if (!pending) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  await prisma.meetRecordingImport.update({ where: { id }, data: { status: "ignored" } });
  return NextResponse.json({ ok: true });
}
