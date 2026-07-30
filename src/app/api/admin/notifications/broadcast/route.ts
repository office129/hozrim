import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isResponse } from "@/lib/guard";
import { notifyAllClients } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "נא לכתוב הודעה" }, { status: 400 });
  if (message.length > 300) return NextResponse.json({ error: "ההודעה ארוכה מדי (עד 300 תווים)" }, { status: 400 });

  const count = await notifyAllClients({ title: message });
  return NextResponse.json({ ok: true, count });
}
