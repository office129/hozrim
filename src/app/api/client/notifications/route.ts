import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  // A notification sticks around unread indefinitely, but once the client
  // has actually opened it, it's served its purpose - it quietly drops out
  // of the list 24h after that rather than piling up forever.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { clientId, OR: [{ readAt: null }, { readAt: { gt: dayAgo } }] },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { clientId, readAt: null } }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
