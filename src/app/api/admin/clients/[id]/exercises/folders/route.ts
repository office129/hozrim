import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { findOrCreateExercisesFolder, findOrCreateExerciseCategoryFolder } from "@/lib/google-drive-oauth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId } = await params;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לתיקייה" }, { status: 400 });

  const count = await prisma.exerciseFolder.count({ where: { clientId } });
  const folder = await prisma.exerciseFolder.create({ data: { clientId, title, order: count } });

  // Best-effort: create the matching Drive folder right away, so
  // exercises added into this category have somewhere to upload into
  // immediately.
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (client?.driveFolderId) {
    try {
      let exercisesFolderId = client.driveExercisesFolderId;
      if (!exercisesFolderId) {
        exercisesFolderId = await findOrCreateExercisesFolder(client.driveFolderId);
        await prisma.client.update({ where: { id: clientId }, data: { driveExercisesFolderId: exercisesFolderId } });
      }
      const driveFolderId = await findOrCreateExerciseCategoryFolder(exercisesFolderId, title);
      await prisma.exerciseFolder.update({ where: { id: folder.id }, data: { driveFolderId } });
    } catch (e) {
      console.error("Failed to create Drive folder for new exercise category", e);
    }
  }

  return NextResponse.json({ folder: { ...folder, items: [] } });
}
