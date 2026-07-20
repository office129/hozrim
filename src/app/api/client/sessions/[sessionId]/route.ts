import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;
  const { sessionId } = await params;

  const session = await prisma.lessonSession.findFirst({ where: { id: sessionId, clientId } });
  if (!session) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json({ session });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;
  const { sessionId } = await params;

  const body = await req.json().catch(() => null);
  const data: { completed?: boolean; clientNote?: string } = {};
  if (typeof body?.completed === "boolean") data.completed = body.completed;
  if (typeof body?.clientNote === "string") data.clientNote = body.clientNote;

  const result = await prisma.lessonSession.updateMany({ where: { id: sessionId, clientId }, data });
  if (!result.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const session = await prisma.lessonSession.findUnique({ where: { id: sessionId } });
  return NextResponse.json({ session });
}
