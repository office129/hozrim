import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { clientId, readAt: null } }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
