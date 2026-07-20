import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

// body: { orderedIds: string[] } — full ordered list of this client's session ids.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId } = await params;

  const body = await req.json().catch(() => null);
  const orderedIds: string[] = Array.isArray(body?.orderedIds) ? body.orderedIds : [];
  if (!orderedIds.length) return NextResponse.json({ error: "רשימה ריקה" }, { status: 400 });

  await prisma.$transaction(
    orderedIds.map((sessionId, i) =>
      prisma.lessonSession.updateMany({
        where: { id: sessionId, clientId },
        data: { number: i + 1 },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
