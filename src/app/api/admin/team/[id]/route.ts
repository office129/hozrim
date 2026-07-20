import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await requireAdmin();
  if (isResponse(adminId)) return adminId;
  const { id } = await params;

  if (id === adminId) {
    return NextResponse.json({ error: "אי אפשר למחוק את החשבון שאיתו את/ה מחובר/ת כרגע" }, { status: 400 });
  }

  const count = await prisma.admin.count();
  if (count <= 1) {
    return NextResponse.json({ error: "לא ניתן למחוק — זהו חשבון הניהול היחיד" }, { status: 400 });
  }

  const result = await prisma.admin.deleteMany({ where: { id } });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
