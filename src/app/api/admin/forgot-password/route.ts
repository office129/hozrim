import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateResetToken } from "@/lib/tokens";
import { sendMail } from "@/lib/email";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "נא להזין אימייל" }, { status: 400 });

  const admin = await prisma.admin.findUnique({ where: { email } });
  // Same response whether or not the account exists, so the endpoint can't
  // be used to enumerate registered emails.
  if (admin) {
    const { token, tokenHash } = generateResetToken();
    await prisma.adminPasswordResetToken.create({
      data: { adminId: admin.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const baseUrl = req.nextUrl.origin;
    const resetUrl = `${baseUrl}/admin/reset-password?token=${token}`;
    await sendMail(
      email,
      "חוזרים לבראשית — איפוס סיסמת ניהול",
      `שלום ${admin.name},\n\nלחצו על הקישור הבא כדי לאפס את הסיסמה שלכם לפאנל הניהול (תקף לשעה אחת):\n${resetUrl}\n\nאם לא ביקשתם איפוס סיסמה, אפשר להתעלם מהודעה זו.`
    );
  }

  return NextResponse.json({ ok: true });
}
