import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { getConnection, getOrCreateLibraryFolder, findOrCreateLibraryCategoryFolder } from "@/lib/google-drive-oauth";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לתיקייה" }, { status: 400 });

  const count = await prisma.libraryFolder.count();
  const folder = await prisma.libraryFolder.create({ data: { title, order: count } });

  // Best-effort: create the matching Drive folder right away, so lessons
  // added into this category have somewhere to upload into immediately.
  if (await getConnection()) {
    try {
      const libraryFolderId = await getOrCreateLibraryFolder();
      const driveFolderId = await findOrCreateLibraryCategoryFolder(libraryFolderId, title);
      await prisma.libraryFolder.update({ where: { id: folder.id }, data: { driveFolderId } });
    } catch (e) {
      console.error("Failed to create Drive folder for new library category", e);
    }
  }

  return NextResponse.json({ folder });
}
