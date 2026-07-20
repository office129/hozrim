import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { number: "asc" } },
      exercises: { orderBy: { number: "asc" } },
    },
  });
  if (!client) return NextResponse.json({ error: "לקוח/ה לא נמצא/ה" }, { status: 404 });

  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      sessions: client.sessions,
      exercises: client.exercises,
      notes: client.sessions
        .filter((s) => s.clientNote && s.clientNote.trim())
        .map((s) => ({ sessionId: s.id, number: s.number, title: s.title, text: s.clientNote })),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const data: { name?: string; email?: string } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.email === "string" && body.email.trim()) data.email = body.email.trim().toLowerCase();

  if (data.email) {
    const dup = await prisma.client.findFirst({ where: { email: data.email, NOT: { id } } });
    if (dup) return NextResponse.json({ error: "כבר קיים חשבון עם האימייל הזה" }, { status: 409 });
  }

  const client = await prisma.client.update({ where: { id }, data });
  return NextResponse.json({ client: { id: client.id, name: client.name, email: client.email } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;
  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
