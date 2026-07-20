import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId } = await params;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לשיעור" }, { status: 400 });

  const count = await prisma.lessonSession.count({ where: { clientId } });
  const session = await prisma.lessonSession.create({
    data: { clientId, title, number: count + 1 },
  });

  return NextResponse.json({ session });
}
