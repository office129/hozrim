import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const exercises = await prisma.exercise.findMany({ where: { clientId }, orderBy: { number: "asc" } });
  return NextResponse.json({
    exercises: exercises.map((ex) => ({
      id: ex.id,
      number: ex.number,
      title: ex.title,
      hasAudio: !!ex.audioFileUrl,
      hasFile: !!ex.pdfFileUrl,
      audioUrl: ex.audioFileUrl,
      fileUrl: ex.pdfFileUrl,
      fileName: ex.pdfFileName,
    })),
  });
}
