import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { findOrCreateExercisesFolder, findOrCreateExerciseFolder } from "@/lib/google-drive-oauth";

// Explicit, on-demand creation of an exercise's own Drive folder - most
// exercises never need one (their files just sit in the client's shared
// "תרגולים" folder), so this only runs when the coach specifically asks
// for it, e.g. because they want to drop files into it directly from
// Drive later.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; exerciseId: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, exerciseId } = await params;

  const exercise = await prisma.exercise.findFirst({ where: { id: exerciseId, clientId } });
  if (!exercise) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  if (exercise.driveFolderId) return NextResponse.json({ exercise });

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client?.driveFolderId) {
    return NextResponse.json({ error: "לא קושרה תיקיית דרייב ללקוח/ה זה/ו" }, { status: 400 });
  }

  try {
    let exercisesFolderId = client.driveExercisesFolderId;
    if (!exercisesFolderId) {
      exercisesFolderId = await findOrCreateExercisesFolder(client.driveFolderId);
      await prisma.client.update({ where: { id: clientId }, data: { driveExercisesFolderId: exercisesFolderId } });
    }
    const driveFolderId = await findOrCreateExerciseFolder(exercisesFolderId, exercise.title);
    const updated = await prisma.exercise.update({ where: { id: exerciseId }, data: { driveFolderId } });
    return NextResponse.json({ exercise: updated });
  } catch (e) {
    console.error("Failed to create Drive folder for exercise", e);
    return NextResponse.json({ error: "לא ניתן ליצור תיקייה בדרייב" }, { status: 502 });
  }
}
