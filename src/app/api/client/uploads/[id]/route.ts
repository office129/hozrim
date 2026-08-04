import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireNonPreviewClient, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const clientId = await requireNonPreviewClient();
  if (isResponse(clientId)) return clientId;
  const { id } = await params;

  const existing = await prisma.personalUpload.findFirst({ where: { id, group: { clientId } } });
  if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  await deleteUploadByUrl(existing.url);
  await prisma.personalUpload.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
