import { prisma } from "@/lib/prisma";

// The coach's own Drive, connected via a real "sign in with Google" (OAuth)
// flow — distinct from the read-only service account in google-drive.ts.
// This lets the server write files using the coach's own storage quota.

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const SCOPE = "https://www.googleapis.com/auth/drive openid email";

export function isDriveOAuthConfigured() {
  return !!CLIENT_ID && !!CLIENT_SECRET;
}

function requireCredentials() {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Google OAuth is not configured");
  return { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET };
}

export function buildAuthUrl(redirectUri: string, state: string) {
  const { clientId } = requireCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function connectWithCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = requireCredentials();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  if (!tokens.refresh_token) {
    // Happens if the coach already granted access before without revoking
    // it — Google only issues a refresh token on the first consent (or
    // when prompt=consent forces re-consent, which buildAuthUrl always
    // sets, so this shouldn't normally happen).
    throw new Error("Google לא החזיר הרשאה מתמשכת — נסה/י לנתק גישה קודמת ולחבר שוב");
  }

  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const user = userRes.ok ? ((await userRes.json()) as { email?: string }) : {};

  await prisma.googleDriveConnection.deleteMany({});
  await prisma.googleDriveConnection.create({
    data: { connectedEmail: user.email || "לא ידוע", refreshToken: tokens.refresh_token },
  });
}

export async function getConnection() {
  return prisma.googleDriveConnection.findFirst();
}

export async function disconnectDrive() {
  await prisma.googleDriveConnection.deleteMany({});
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function getDriveAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token;

  const { clientId, clientSecret } = requireCredentials();
  const connection = await prisma.googleDriveConnection.findFirst();
  if (!connection) throw new Error("Google Drive is not connected");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedAccessToken.token;
}
