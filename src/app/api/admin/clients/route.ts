import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/tokens";
import { sendMail } from "@/lib/email";
import { getClientsOverview } from "@/lib/admin-data";

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const clients = await getClientsOverview();
  return NextResponse.json({ clients });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const sessionCount = Math.max(1, Math.min(30, parseInt(body?.sessionCount, 10) || 1));

  if (!name || !email) {
    return NextResponse.json({ error: "נא למלא שם ואימייל" }, { status: 400 });
  }

  const existing = await prisma.client.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "כבר קיים חשבון עם האימייל הזה" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const libraryTitles = (
    await prisma.libraryItem.findMany({ orderBy: { number: "asc" }, take: sessionCount })
  ).map((l) => l.title);

  const client = await prisma.client.create({
    data: {
      name,
      email,
      passwordHash,
      sessions: {
        create: Array.from({ length: sessionCount }, (_, i) => ({
          number: i + 1,
          title: libraryTitles[i] || `שיעור ${i + 1}`,
        })),
      },
    },
  });

  let emailSent = false;
  try {
    await sendMail(
      email,
      "חוזרים לבראשית — פרטי הכניסה שלך",
      `שלום ${name},\n\nחשבונך במרחב הליווי האישי נוצר.\n\nכתובת אימייל להתחברות: ${email}\nסיסמה זמנית: ${tempPassword}\n\nמומלץ להחליף את הסיסמה מהאזור האישי לאחר הכניסה הראשונה.`
    );
    emailSent = process.env.SMTP_HOST != null;
  } catch (e) {
    console.error("Failed to send welcome email", e);
  }

  return NextResponse.json({
    client: { id: client.id, name: client.name, email: client.email },
    emailSent,
    tempPassword: emailSent ? undefined : tempPassword,
  });
}
