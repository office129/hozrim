import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId } = await params;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לתרגול" }, { status: 400 });

  const folderId = typeof body?.folderId === "string" && body.folderId ? body.folderId : null;
  if (folderId) {
    const folder = await prisma.exerciseFolder.findUnique({ where: { id: folderId } });
    if (!folder || folder.clientId !== clientId) return NextResponse.json({ error: "התיקייה לא נמצאה" }, { status: 404 });
  }

  const count = await prisma.exercise.count({ where: { clientId, folderId } });
  const exercise = await prisma.exercise.create({
    data: { clientId, title, number: count + 1, folderId },
  });

  return NextResponse.json({ exercise });
}
