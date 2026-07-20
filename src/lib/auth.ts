import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

const CLIENT_COOKIE = "hlb_client_session";
const ADMIN_COOKIE = "hlb_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

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

async function signSession(payload: ClientPayload | AdminPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
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

export async function createClientSession(clientId: string) {
  const token = await signSession({ kind: "client", id: clientId });
  const store = await cookies();
  store.set(CLIENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function createAdminSession(adminId: string) {
  const token = await signSession({ kind: "admin", id: adminId });
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
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
  const payload = await verifySession<ClientPayload>(store.get(CLIENT_COOKIE)?.value);
  return payload?.kind === "client" ? payload.id : null;
}

export async function getAdminId(): Promise<string | null> {
  const store = await cookies();
  const payload = await verifySession<AdminPayload>(store.get(ADMIN_COOKIE)?.value);
  return payload?.kind === "admin" ? payload.id : null;
}
