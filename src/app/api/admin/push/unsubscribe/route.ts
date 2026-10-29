import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (isResponse(adminId)) return adminId;

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  await prisma.adminPushSubscription.deleteMany({ where: { endpoint, adminId } });
  return NextResponse.json({ ok: true });
}
