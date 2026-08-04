import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const CLIENT_COOKIE = "hlb_client_session";
const ADMIN_COOKIE = "hlb_admin_session";

// Clients get logged out after 24h of inactivity — the cookie is
// refreshed with a new 24h expiry on every request (see middleware.ts),
// so continued use keeps the session alive indefinitely.
export const CLIENT_SESSION_TTL_SECONDS = 60 * 60 * 24;
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, fixed from login

// A coach-generated "see the client's own app as them" link, used purely
// to eyeball how something newly added actually looks - short-lived on
// purpose, and never counted toward the client's own activity tracking.
export const PREVIEW_SESSION_TTL_SECONDS = 60 * 60; // 1 hour

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

type ClientPayload = { kind: "client"; id: string; preview?: boolean };
type AdminPayload = { kind: "admin"; id: string };

async function signSession(payload: ClientPayload | AdminPayload, ttlSeconds: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

async function verifySession<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as T;
  } catch {
    return null;
  }
}

// Exported (rather than only used via createClientSession) so
// middleware.ts — which can't use next/headers' cookies() — can verify
// and re-sign the client cookie directly on the request/response objects.
export async function signClientToken(clientId: string) {
  return signSession({ kind: "client", id: clientId }, CLIENT_SESSION_TTL_SECONDS);
}

// Exported (rather than folded into verifyClientToken) so proxy.ts can
// tell a preview session apart from a real one - a preview must never be
// upgraded into a full 24h session by the normal sliding-refresh below,
// which would both outlive its intended 1h lifetime and quietly drop the
// preview flag that keeps the journal blocked.
export async function verifyClientTokenFull(token: string | undefined): Promise<{ id: string; preview: boolean } | null> {
  const payload = await verifySession<ClientPayload>(token);
  if (!payload || payload.kind !== "client") return null;
  return { id: payload.id, preview: !!payload.preview };
}

export async function verifyClientToken(token: string | undefined): Promise<string | null> {
  const result = await verifyClientTokenFull(token);
  return result?.id ?? null;
}

export async function createClientSession(clientId: string) {
  const token = await signClientToken(clientId);
  const store = await cookies();
  store.set(CLIENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CLIENT_SESSION_TTL_SECONDS,
  });

  // firstLoginAt only ever gets set once - lets the coach tell "created
  // but never actually opened the app" apart from "has logged in before".
  const now = new Date();
  await prisma.client.updateMany({ where: { id: clientId, firstLoginAt: null }, data: { firstLoginAt: now } });
  await prisma.client.update({ where: { id: clientId }, data: { lastActiveAt: now } }).catch(() => {});
}

// Signs a short-lived, journal-blocked client token for the coach to open
// in a browser and see the client's own app pages exactly as they'd see
// them - returned as a plain string to embed in a link, not set as a
// cookie here (this runs from the admin's own authenticated request, so
// touching the client cookie here would be the wrong session entirely).
export async function createPreviewClientToken(clientId: string): Promise<string> {
  return signSession({ kind: "client", id: clientId, preview: true }, PREVIEW_SESSION_TTL_SECONDS);
}

// The other half of createPreviewClientToken - called from the public
// activation link itself, which is the first request that actually has
// nowhere else to carry the token except a URL. Deliberately reuses the
// token's own signature/expiry as-is (no re-signing) since it's already a
// complete, stateless, short-lived credential.
export async function activatePreviewClientSession(token: string): Promise<boolean> {
  const payload = await verifySession<ClientPayload>(token);
  if (!payload || payload.kind !== "client" || !payload.preview) return false;

  const store = await cookies();
  store.set(CLIENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PREVIEW_SESSION_TTL_SECONDS,
  });
  return true;
}

// Whether the current client cookie is a coach preview link rather than
// the client's own real login - checked wherever content needs to stay
// private even from a preview (the personal journal).
export async function isPreviewClientSession(): Promise<boolean> {
  const store = await cookies();
  const payload = await verifySession<ClientPayload>(store.get(CLIENT_COOKIE)?.value);
  return !!payload && payload.kind === "client" && payload.preview === true;
}

export async function createAdminSession(adminId: string) {
  const token = await signSession({ kind: "admin", id: adminId }, ADMIN_SESSION_TTL_SECONDS);
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
}

export async function destroyClientSession() {
  const store = await cookies();
  store.delete(CLIENT_COOKIE);
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function getClientId(): Promise<string | null> {
  const store = await cookies();
  return verifyClientToken(store.get(CLIENT_COOKIE)?.value);
}

export async function getAdminId(): Promise<string | null> {
  const store = await cookies();
  const payload = await verifySession<AdminPayload>(store.get(ADMIN_COOKIE)?.value);
  return payload?.kind === "admin" ? payload.id : null;
}
