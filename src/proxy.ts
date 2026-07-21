import { NextRequest, NextResponse } from "next/server";
import { CLIENT_COOKIE, CLIENT_SESSION_TTL_SECONDS, signClientToken, verifyClientToken } from "@/lib/auth";

// Routes where a client isn't expected to already be logged in, or is in
// the middle of logging out — refreshing the cookie there would be
// pointless (login) or would just fight with the route handler that's
// about to clear it (logout).
const SKIP_PATHS = new Set([
  "/api/client/login",
  "/api/client/logout",
  "/api/client/forgot-password",
  "/api/client/reset-password",
]);

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (SKIP_PATHS.has(request.nextUrl.pathname)) return response;

  const token = request.cookies.get(CLIENT_COOKIE)?.value;
  if (!token) return response;

  const clientId = await verifyClientToken(token);
  if (!clientId) return response;

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
