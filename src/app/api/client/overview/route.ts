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

  // If more sessions actually exist than the coach originally planned for
  // (e.g. the process ran longer than expected), the displayed total
  // should reflect reality rather than show progress past 100% - this
  // only affects what's shown here, not the totalSessions the coach set.
  const totalCount = Math.max(client.totalSessions, sessions.length);
  const completedCount = sessions.filter((s) => s.completed).length;
  const current = sessions.find((s) => !s.completed) || sessions[sessions.length - 1] || null;

  return NextResponse.json({
    clientName: client.name,
    totalCount,
    completedCount,
    currentStage: current ? { id: current.id, number: current.number, title: current.title } : null,
  });
}
