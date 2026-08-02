import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { saveUpload, UploadValidationError } from "@/lib/storage";
import { notifyClient } from "@/lib/notifications";

// Appends one summary document (local-disk fallback path, used when
// neither Drive nor Blob is available) — a session can have several.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId } = await params;

  const existing = await prisma.lessonSession.findFirst({
    where: { id: sessionId, clientId },
    include: { summaryFiles: true },
  });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  // A session that gets only a PDF summary (no video/audio recording)
  // still needs to notify the client - this is the session's content,
  // just in a different format. If a recording already notified them,
  // don't notify again just for the PDF.
  const hadNoContentYet = !existing.fileUrl && existing.summaryFiles.length === 0;

  try {
    const { url, fileName } = await saveUpload(file, "pdf", `clients/${clientId}`);
    const last = await prisma.sessionSummaryFile.findFirst({ where: { sessionId }, orderBy: { order: "desc" } });
    const summaryFile = await prisma.sessionSummaryFile.create({
      data: { sessionId, url, fileName, order: (last?.order ?? -1) + 1 },
    });
    if (hadNoContentYet) {
      await notifyClient(clientId, {
        type: "session",
        title: `הקלטה חדשה נוספה: ${existing.title}`,
        link: `/app/recordings/${sessionId}`,
      });
    }
    return NextResponse.json({ file: summaryFile });
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
