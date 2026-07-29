import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isResponse } from "@/lib/guard";
import { connectWithCode } from "@/lib/google-drive-oauth";

const STATE_COOKIE = "hlb_drive_oauth_state";
const RETURN_PATH = "/admin/team";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${req.nextUrl.origin}${RETURN_PATH}?drive_error=${encodeURIComponent(error)}`);
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${req.nextUrl.origin}${RETURN_PATH}?drive_error=invalid_state`);
  }

  const redirectUri = `${req.nextUrl.origin}/api/admin/drive-oauth/callback`;

  try {
    await connectWithCode(code, redirectUri);
  } catch (e) {
    console.error("Google Drive OAuth connect failed", e);
    return NextResponse.redirect(`${req.nextUrl.origin}${RETURN_PATH}?drive_error=connect_failed`);
  }

  const response = NextResponse.redirect(`${req.nextUrl.origin}${RETURN_PATH}?drive_connected=1`);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
