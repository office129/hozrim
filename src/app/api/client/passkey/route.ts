import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const passkeys = await prisma.clientPasskey.findMany({
    where: { clientId },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ passkeys });
}
