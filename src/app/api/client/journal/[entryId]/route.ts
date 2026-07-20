import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;
  const { entryId } = await params;

  const result = await prisma.journalEntry.deleteMany({ where: { id: entryId, clientId } });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
