import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; fileId: string }> }
) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId, sessionId, fileId } = await params;

  const file = await prisma.sessionSummaryFile.findFirst({
    where: { id: fileId, sessionId, session: { clientId } },
  });
  if (!file) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  await prisma.sessionSummaryFile.delete({ where: { id: fileId } });
  await deleteUploadByUrl(file.url);

  return NextResponse.json({ ok: true });
}
