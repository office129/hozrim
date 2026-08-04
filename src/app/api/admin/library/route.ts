import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const items = await prisma.libraryItem.findMany({ orderBy: { number: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לשיעור" }, { status: 400 });

  const folderId = typeof body?.folderId === "string" && body.folderId ? body.folderId : null;
  if (folderId) {
    const folder = await prisma.libraryFolder.findUnique({ where: { id: folderId } });
    if (!folder) return NextResponse.json({ error: "התיקייה לא נמצאה" }, { status: 404 });
  }

  const count = await prisma.libraryItem.count({ where: { folderId } });
  const item = await prisma.libraryItem.create({ data: { title, number: count + 1, folderId } });

  return NextResponse.json({ item });
}
