import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const sessions = await prisma.lessonSession.findMany({
    where: { clientId },
    orderBy: { number: "asc" },
  });

  const totalCount = client.totalSessions;
  const completedCount = sessions.filter((s) => s.completed).length;
  const current = sessions.find((s) => !s.completed) || sessions[sessions.length - 1] || null;

  return NextResponse.json({
    clientName: client.name,
    totalCount,
    completedCount,
    currentStage: current ? { id: current.id, number: current.number, title: current.title } : null,
  });
}
