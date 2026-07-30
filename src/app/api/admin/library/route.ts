import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { getOrCreateLibraryFolder, findOrCreateLibraryItemFolder, getConnection } from "@/lib/google-drive-oauth";

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

  const count = await prisma.libraryItem.count();
  const item = await prisma.libraryItem.create({ data: { title, number: count + 1 } });

  // Best-effort: create the item's own Drive folder (named after its
  // title) right away instead of waiting for the first upload.
  if (await getConnection()) {
    try {
      const libraryFolderId = await getOrCreateLibraryFolder();
      await findOrCreateLibraryItemFolder(libraryFolderId, item.title);
    } catch (e) {
      console.error("Failed to create Drive folder for new library item", e);
    }
  }

  return NextResponse.json({ item });
}
