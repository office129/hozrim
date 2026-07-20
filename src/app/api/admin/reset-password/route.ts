import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!token || newPassword.length < 6) {
    return NextResponse.json({ error: "קישור לא תקין או סיסמה קצרה מדי (6 תווים לפחות)" }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const record = await prisma.adminPasswordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "הקישור פג תוקף או שכבר נעשה בו שימוש" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.admin.update({ where: { id: record.adminId }, data: { passwordHash } }),
    prisma.adminPasswordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
