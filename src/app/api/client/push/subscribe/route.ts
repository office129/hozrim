import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function POST(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.p256dh === "string" ? body.p256dh : "";
  const auth = typeof body?.auth === "string" ? body.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  // Same device re-subscribing (e.g. after clearing site data) reuses its
  // endpoint - keep it pointed at whichever client is currently logged in
  // rather than erroring on the unique constraint.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { clientId, p256dh, auth },
    create: { clientId, endpoint, p256dh, auth },
  });

  return NextResponse.json({ ok: true });
}
