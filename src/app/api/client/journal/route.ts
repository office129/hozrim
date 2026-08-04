import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireNonPreviewClient, isResponse } from "@/lib/guard";

export async function GET() {
  const clientId = await requireNonPreviewClient();
  if (isResponse(clientId)) return clientId;

  const entries = await prisma.journalEntry.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const clientId = await requireNonPreviewClient();
  if (isResponse(clientId)) return clientId;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "נא לכתוב משהו" }, { status: 400 });

  const entry = await prisma.journalEntry.create({ data: { clientId, text } });
  return NextResponse.json({ entry });
}
