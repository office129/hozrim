import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

export const CLIENT_COOKIE = "hlb_client_session";
const ADMIN_COOKIE = "hlb_admin_session";

// Clients get logged out after 24h of inactivity — the cookie is
// refreshed with a new 24h expiry on every request (see middleware.ts),
// so continued use keeps the session alive indefinitely.
export const CLIENT_SESSION_TTL_SECONDS = 60 * 60 * 24;
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, fixed from login

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

type ClientPayload = { kind: "client"; id: string };
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

export async function verifyClientToken(token: string | undefined): Promise<string | null> {
  const payload = await verifySession<ClientPayload>(token);
  return payload?.kind === "client" ? payload.id : null;
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
