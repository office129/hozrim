import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { deleteUploadByUrl } from "@/lib/storage";
import { isHttpUrl } from "@/lib/external-links";
import { notifyClient } from "@/lib/notifications";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json({ client: { name: client.name, email: client.email, avatarUrl: client.avatarUrl } });
}

export async function PATCH(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const body = await req.json().catch(() => null);
  const data: {
    name?: string;
    passwordHash?: string;
    avatarUrl?: string;
    hasSeenProfileTip?: boolean;
    hasSeenSessionCompleteTip?: boolean;
    hasSeenWelcomePopup?: boolean;
    hasSeededWelcomeNotification?: boolean;
    hasSeenPushHint?: boolean;
  } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body?.profileTipSeen === true) data.hasSeenProfileTip = true;
  if (body?.sessionCompleteTipSeen === true) data.hasSeenSessionCompleteTip = true;
  if (body?.pushHintSeen === true) data.hasSeenPushHint = true;

  // Confirming the welcome popup also drops a real notification into the
  // bell - the client discovers it themselves the normal way (the same
  // red unread badge as any other notification), not a separate one-off
  // tooltip explaining what the bell does before they've even used it.
  let seedWelcomeNotification = false;
  if (body?.welcomePopupSeen === true) {
    data.hasSeenWelcomePopup = true;
    const existing = await prisma.client.findUnique({ where: { id: clientId }, select: { hasSeededWelcomeNotification: true } });
    if (existing && !existing.hasSeededWelcomeNotification) {
      seedWelcomeNotification = true;
      data.hasSeededWelcomeNotification = true;
    }
  }

  if (typeof body?.newPassword === "string" && body.newPassword.length > 0) {
    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: "הסיסמה חייבת להכיל לפחות 6 תווים" }, { status: 400 });
    }
    data.passwordHash = await hashPassword(body.newPassword);
  }

  let previousAvatarUrl: string | null = null;
  if (typeof body?.avatarUrl === "string") {
    if (!isHttpUrl(body.avatarUrl)) {
      return NextResponse.json({ error: "קישור לא תקין" }, { status: 400 });
    }
    const existing = await prisma.client.findUnique({ where: { id: clientId } });
    previousAvatarUrl = existing?.avatarUrl ?? null;
    data.avatarUrl = body.avatarUrl;
  }

  const client = await prisma.client.update({ where: { id: clientId }, data });
  if (data.avatarUrl && previousAvatarUrl) await deleteUploadByUrl(previousAvatarUrl);
  if (seedWelcomeNotification) {
    await notifyClient(clientId, { type: "welcome", title: "כאן תופיע התראה בכל פעם שמפגש או תרגול חדש מתווסף לך" });
  }
  return NextResponse.json({ client: { name: client.name, email: client.email, avatarUrl: client.avatarUrl } });
}
