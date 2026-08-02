import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/tokens";
import { sendMail, isEmailConfigured } from "@/lib/email";

// Issues a brand-new temporary password for an existing client — the admin's
// recovery path when a client says their credentials don't work (lost,
// mistyped, or copied incorrectly from the original welcome message).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "לא נמצא/ה" }, { status: 404 });

  const tempPassword = generateTempPassword();
  await prisma.client.update({
    where: { id },
    data: { passwordHash: await hashPassword(tempPassword) },
  });

  let emailSent = false;
  try {
    await sendMail(
      client.email,
      "חוזרים לבראשית — סיסמה זמנית חדשה",
      `שלום ${client.name},\n\nהונפקה עבורך סיסמה זמנית חדשה למרחב הליווי האישי.\n\nכתובת אימייל להתחברות: ${client.email}\nסיסמה זמנית: ${tempPassword}\n\nמומלץ להחליף את הסיסמה מהאיזור האישי לאחר הכניסה.`
    );
    emailSent = isEmailConfigured();
  } catch (e) {
    console.error("Failed to send password-reset email", e);
  }

  return NextResponse.json({ emailSent, tempPassword: emailSent ? undefined : tempPassword });
}
