import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = await req.json().catch(() => null);
  const orderedIds: string[] = Array.isArray(body?.orderedIds) ? body.orderedIds : [];
  if (!orderedIds.length) return NextResponse.json({ error: "רשימה ריקה" }, { status: 400 });

  await prisma.$transaction(
    orderedIds.map((id, i) => prisma.libraryItem.updateMany({ where: { id }, data: { number: i + 1 } }))
  );

  return NextResponse.json({ ok: true });
}
