import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClientSession, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "נא למלא אימייל וסיסמה" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { email } });
  if (!client || !(await verifyPassword(password, client.passwordHash))) {
    return NextResponse.json({ error: "אימייל או סיסמה שגויים" }, { status: 401 });
  }

  await createClientSession(client.id);
  return NextResponse.json({ ok: true, name: client.name });
}
