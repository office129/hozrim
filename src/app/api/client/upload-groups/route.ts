import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const groups = await prisma.personalUploadGroup.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { files: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא לתת שם" }, { status: 400 });

  const group = await prisma.personalUploadGroup.create({ data: { clientId, title } });
  return NextResponse.json({ group: { ...group, files: [] } });
}
