import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/tokens";
import { sendMail, isEmailConfigured } from "@/lib/email";
import { getClientsOverview } from "@/lib/admin-data";
import { createClientFolder, getConnection } from "@/lib/google-drive-oauth";

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
  const totalSessions = Math.max(1, Math.min(30, parseInt(body?.totalSessions, 10) || 6));

  if (!name || !email) {
    return NextResponse.json({ error: "נא למלא שם ואימייל" }, { status: 400 });
  }

  const existing = await prisma.client.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "כבר קיים חשבון עם האימייל הזה" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // totalSessions is just the planned/purchased count shown to the client
  // as a progress target ("X מתוך Y") — it does NOT create any session
  // rows. A session represents an actual recording that goes live after a
  // real meeting, so the admin adds each one manually (SessionsTab's
  // "+ הוספת שיעור") as it happens.
  const client = await prisma.client.create({
    data: { name, email, passwordHash, totalSessions },
  });

  // Best-effort: a new client's folder is a convenience, not something
  // that should ever block account creation if Drive is briefly slow or
  // unreachable — the admin can always link a folder later.
  if (await getConnection()) {
    try {
      const { folderId, exercisesFolderId, meetingsFolderId } = await createClientFolder(name);
      await prisma.client.update({
        where: { id: client.id },
        data: { driveFolderId: folderId, driveExercisesFolderId: exercisesFolderId, driveMeetingsFolderId: meetingsFolderId },
      });
    } catch (e) {
      console.error("Failed to create Drive folder for new client", e);
    }
  }

  let emailSent = false;
  try {
    const loginUrl = `${req.nextUrl.origin}/login`;
    await sendMail(
      email,
      "חוזרים לבראשית — פרטי הכניסה שלך",
      `שלום ${name},\n\nברוכים הבאים לאפליקציית הליווי של חוזרים לבראשית.\n\nפרטי ההתחברות שלך:\nקישור לאתר: ${loginUrl}\nמייל המשתמש: ${email}\nסיסמא זמנית: ${tempPassword}\n\n(באיזור האישי כדאי להחליף סיסמא)\n\nניפגש בפנים,\nיוסף חיים שטיינר`
    );
    emailSent = isEmailConfigured();
  } catch (e) {
    console.error("Failed to send welcome email", e);
  }

  return NextResponse.json({
    client: { id: client.id, name: client.name, email: client.email },
    emailSent,
    tempPassword: emailSent ? undefined : tempPassword,
  });
}
