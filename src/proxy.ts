import { NextRequest, NextResponse, after } from "next/server";
import { CLIENT_COOKIE, CLIENT_SESSION_TTL_SECONDS, signClientToken, verifyClientTokenFull } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Routes where a client isn't expected to already be logged in, or is in
// the middle of logging out — refreshing the cookie there would be
// pointless (login) or would just fight with the route handler that's
// about to clear it (logout).
const SKIP_PATHS = new Set([
  "/api/client/login",
  "/api/client/logout",
  "/api/client/forgot-password",
  "/api/client/reset-password",
  "/api/client/passkey/login-options",
  "/api/client/passkey/login",
]);

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (SKIP_PATHS.has(request.nextUrl.pathname)) return response;

  const token = request.cookies.get(CLIENT_COOKIE)?.value;
  if (!token) return response;

  const verified = await verifyClientTokenFull(token);
  if (!verified) return response;
  const { id: clientId, preview } = verified;

  // A preview link is deliberately short-lived and stays exactly as
  // issued - no sliding refresh (which would silently turn it into a
  // full 24h session and drop the preview flag), and none of this
  // browsing counts as the client's own activity.
  if (preview) return response;

  // Best-effort "was here recently" signal for the coach - runs after the
  // response is already on its way out, so it never adds to the client's
  // own request latency.
  after(() => prisma.client.update({ where: { id: clientId }, data: { lastActiveAt: new Date() } }).catch(() => {}));

  // Sliding 24h session: every authenticated request resets the clock, so
  // a client only gets logged out after a full day of no activity at all.
  const fresh = await signClientToken(clientId);
  response.cookies.set(CLIENT_COOKIE, fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CLIENT_SESSION_TTL_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/api/client/:path*"],
};
