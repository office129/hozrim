import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { isHttpUrl } from "@/lib/external-links";
import { notifyClient } from "@/lib/notifications";

// Appends one summary document to a session — a session can have several
// (e.g. two separate summary PDFs from the same meeting), so this adds
// rather than replaces.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId } = await params;

  const existing = await prisma.lessonSession.findFirst({
    where: { id: sessionId, clientId },
    include: { summaryFiles: true },
  });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";
  const fileName = typeof body?.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : url;
  if (!url || !isHttpUrl(url)) return NextResponse.json({ error: "קישור לא תקין" }, { status: 400 });

  // A session that gets only a PDF summary (no video/audio recording)
  // still needs to notify the client - this is the session's content,
  // just in a different format. If a recording already notified them,
  // don't notify again just for the PDF.
  const hadNoContentYet = !existing.fileUrl && existing.summaryFiles.length === 0;

  const last = await prisma.sessionSummaryFile.findFirst({ where: { sessionId }, orderBy: { order: "desc" } });
  const file = await prisma.sessionSummaryFile.create({
    data: { sessionId, url, fileName, order: (last?.order ?? -1) + 1 },
  });
  if (hadNoContentYet) {
    await notifyClient(clientId, {
      type: "session",
      title: `הקלטה חדשה נוספה: ${existing.title}`,
      link: `/app/recordings/${sessionId}`,
    });
  }
  return NextResponse.json({ file });
}
