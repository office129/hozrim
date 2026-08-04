import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { createPreviewClientToken } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/app-url";

// Generates a short-lived (1h) link the coach can open to see this
// client's own app exactly as they'd see it - journal excluded. Just
// signs a token, no DB row created: the link itself is the credential.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "לקוח/ה לא נמצא/ה" }, { status: 404 });

  const token = await createPreviewClientToken(client.id);
  const url = `${getAppBaseUrl()}/api/preview/activate?token=${encodeURIComponent(token)}`;
  return NextResponse.json({ url });
}
