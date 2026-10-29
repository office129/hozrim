import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (isResponse(adminId)) return adminId;

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.p256dh === "string" ? body.p256dh : "";
  const auth = typeof body?.auth === "string" ? body.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  // A device re-subscribing reuses its endpoint — keep it pointed at
  // whichever admin is currently logged in rather than hitting the unique
  // constraint.
  await prisma.adminPushSubscription.upsert({
    where: { endpoint },
    update: { adminId, p256dh, auth },
    create: { adminId, endpoint, p256dh, auth },
  });

  return NextResponse.json({ ok: true });
}
