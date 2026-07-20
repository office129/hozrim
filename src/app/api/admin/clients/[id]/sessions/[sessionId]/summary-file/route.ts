import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { saveUpload, deleteUploadByUrl, UploadValidationError } from "@/lib/storage";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId } = await params;

  const existing = await prisma.lessonSession.findFirst({ where: { id: sessionId, clientId } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  try {
    const { url, fileName } = await saveUpload(file, "pdf", `clients/${clientId}`);
    await deleteUploadByUrl(existing.summaryFileUrl);
    const session = await prisma.lessonSession.update({
      where: { id: sessionId },
      data: { summaryFileUrl: url, summaryFileName: fileName },
    });
    return NextResponse.json({ session });
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
