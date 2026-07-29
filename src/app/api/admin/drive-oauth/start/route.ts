import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin, isResponse } from "@/lib/guard";
import { buildAuthUrl, isDriveOAuthConfigured } from "@/lib/google-drive-oauth";

const STATE_COOKIE = "hlb_drive_oauth_state";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  if (!isDriveOAuthConfigured()) {
    return NextResponse.json({ error: "חיבור Google Drive לא מוגדר בשרת" }, { status: 400 });
  }

  const redirectUri = `${req.nextUrl.origin}/api/admin/drive-oauth/callback`;
  const state = randomUUID();
  const authUrl = buildAuthUrl(redirectUri, state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
