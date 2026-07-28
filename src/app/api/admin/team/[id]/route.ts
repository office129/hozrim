import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await requireAdmin();
  if (isResponse(adminId)) return adminId;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const data: { name?: string; email?: string } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.email === "string" && body.email.trim()) data.email = body.email.trim().toLowerCase();

  if (data.email) {
    const dup = await prisma.admin.findFirst({ where: { email: data.email, NOT: { id } } });
    if (dup) return NextResponse.json({ error: "כבר קיים חשבון ניהול עם האימייל הזה" }, { status: 409 });
  }

  const admin = await prisma.admin.update({ where: { id }, data });
  return NextResponse.json({ admin: { id: admin.id, name: admin.name, email: admin.email } });
}

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
