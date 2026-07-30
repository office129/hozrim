import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

// Marks every currently-unread notification as read - called when the
// client opens the bell dropdown, so the badge clears without needing
// per-notification read tracking from the UI.
export async function POST() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  await prisma.notification.updateMany({
    where: { clientId, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
