import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { findOrCreateExercisesFolder, findOrCreateExerciseFolder } from "@/lib/google-drive-oauth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId } = await params;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לתרגול" }, { status: 400 });

  const count = await prisma.exercise.count({ where: { clientId } });
  const exercise = await prisma.exercise.create({
    data: { clientId, title, number: count + 1 },
  });

  // Best-effort: create the exercise's own Drive folder (named exactly
  // after its title) right away instead of waiting for the first upload,
  // matching what already happens for a new session.
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (client?.driveFolderId) {
    try {
      let exercisesFolderId = client.driveExercisesFolderId;
      if (!exercisesFolderId) {
        exercisesFolderId = await findOrCreateExercisesFolder(client.driveFolderId);
        await prisma.client.update({ where: { id: clientId }, data: { driveExercisesFolderId: exercisesFolderId } });
      }
      await findOrCreateExerciseFolder(exercisesFolderId, exercise.title);
    } catch (e) {
      console.error("Failed to create Drive folder for new exercise", e);
    }
  }

  return NextResponse.json({ exercise });
}
