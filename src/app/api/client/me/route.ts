import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json({ client: { name: client.name, email: client.email } });
}

export async function PATCH(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const body = await req.json().catch(() => null);
  const data: { name?: string; passwordHash?: string } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.newPassword === "string" && body.newPassword.length > 0) {
    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: "הסיסמה חייבת להכיל לפחות 6 תווים" }, { status: 400 });
    }
    data.passwordHash = await hashPassword(body.newPassword);
  }

  const client = await prisma.client.update({ where: { id: clientId }, data });
  return NextResponse.json({ client: { name: client.name, email: client.email } });
}
