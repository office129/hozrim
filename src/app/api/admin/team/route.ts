import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/tokens";
import { sendMail, isEmailConfigured } from "@/lib/email";

export async function GET() {
  const adminId = await requireAdmin();
  if (isResponse(adminId)) return adminId;

  const admins = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    admins: admins.map((a) => ({ id: a.id, email: a.email, name: a.name })),
    currentAdminId: adminId,
  });
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (isResponse(adminId)) return adminId;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name || !email) {
    return NextResponse.json({ error: "נא למלא שם ואימייל" }, { status: 400 });
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "כבר קיים חשבון ניהול עם האימייל הזה" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const admin = await prisma.admin.create({ data: { name, email, passwordHash } });

  let emailSent = false;
  try {
    await sendMail(
      email,
      "חוזרים לבראשית — גישה לפאנל ניהול",
      `שלום ${name},\n\nנוצרה עבורך גישה לפאנל הניהול של חוזרים לבראשית.\n\nכתובת אימייל להתחברות: ${email}\nסיסמה זמנית: ${tempPassword}\n\nמומלץ להחליף סיסמה בהקדם.`
    );
    emailSent = isEmailConfigured();
  } catch (e) {
    console.error("Failed to send admin invite email", e);
  }

  return NextResponse.json({
    admin: { id: admin.id, email: admin.email, name: admin.name },
    emailSent,
    tempPassword: emailSent ? undefined : tempPassword,
  });
}
