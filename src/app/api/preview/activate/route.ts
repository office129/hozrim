import { NextRequest, NextResponse } from "next/server";
import { activatePreviewClientSession } from "@/lib/auth";

// Not admin-gated - the token in the URL itself is the credential (a
// short-lived, single-client, journal-blocked preview link generated
// only from the admin panel). Opening it just sets the preview cookie
// and drops the coach straight into the client's own home screen.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const ok = token && (await activatePreviewClientSession(token));
  if (!ok) {
    return NextResponse.redirect(new URL("/login?error=preview-expired", req.url));
  }
  return NextResponse.redirect(new URL("/app/home", req.url));
}
