import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { saveUpload, deleteUploadByUrl, UploadValidationError } from "@/lib/storage";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; exerciseId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, exerciseId } = await params;

  const existing = await prisma.exercise.findFirst({ where: { id: exerciseId, clientId } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const isAudio = file.type.startsWith("audio/");
  const isPdf = file.type === "application/pdf";
  if (!isAudio && !isPdf) {
    return NextResponse.json({ error: "יש להעלות קובץ אודיו או PDF" }, { status: 400 });
  }

  try {
    const { url, fileName } = await saveUpload(file, isAudio ? "audio" : "pdf", `clients/${clientId}`);
    await deleteUploadByUrl(isAudio ? existing.audioFileUrl : existing.pdfFileUrl);
    const exercise = await prisma.exercise.update({
      where: { id: exerciseId },
      data: isAudio ? { audioFileUrl: url, audioFileName: fileName } : { pdfFileUrl: url, pdfFileName: fileName },
    });
    return NextResponse.json({ exercise });
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
