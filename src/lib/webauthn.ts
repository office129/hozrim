import { NextRequest } from "next/server";
import { cookies } from "next/headers";

export const RP_NAME = "חוזרים לבראשית";

// Deriving rpID/origin from the incoming request (rather than hardcoding a
// domain) means this keeps working automatically on preview URLs, local
// dev, and after a future custom-domain switch — with one caveat: a
// passkey registered under one domain never carries over to another, since
// WebAuthn credentials are permanently bound to the rpID they were created
// with. Moving domains means clients re-enable it once.
export function getRpConfig(req: NextRequest) {
  return { rpName: RP_NAME, rpID: req.nextUrl.hostname, origin: req.nextUrl.origin };
}

const CHALLENGE_COOKIE = "hlb_webauthn_challenge";
const CHALLENGE_TTL_SECONDS = 300;

export async function setChallenge(challenge: string) {
  const store = await cookies();
  store.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  });
}

// One-time use: cleared as soon as it's read so a captured request can't be
// replayed against a fresh registration/authentication attempt.
export async function consumeChallenge(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CHALLENGE_COOKIE)?.value ?? null;
  store.delete(CHALLENGE_COOKIE);
  return value;
}
