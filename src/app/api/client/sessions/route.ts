import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const sessions = await prisma.lessonSession.findMany({
    where: { clientId },
    orderBy: { number: "asc" },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      number: s.number,
      title: s.title,
      date: s.createdAt,
      completed: s.completed,
      hasMedia: !!s.fileUrl,
    })),
  });
}
