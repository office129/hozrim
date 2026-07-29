import { prisma } from "@/lib/prisma";
import { getServiceAccountEmail } from "@/lib/google-drive";

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

async function driveApiFetch(path: string, init?: RequestInit) {
  const token = await getDriveAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status} ${await res.text()}`);
  return res.json();
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const CLIENTS_PARENT_FOLDER_NAME = "חוזרים לבראשית - לקוחות";
// Cached per warm serverless instance only — harmless if it misses on a
// cold start, since the lookup-or-create below is idempotent either way.
let cachedParentFolderId: string | null = null;

async function getOrCreateClientsParentFolder(): Promise<string> {
  if (cachedParentFolderId) return cachedParentFolderId;

  const q = `mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQueryValue(CLIENTS_PARENT_FOLDER_NAME)}' and trashed=false and 'root' in parents`;
  const listRes = (await driveApiFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id)`)) as {
    files: { id: string }[];
  };
  if (listRes.files.length) {
    cachedParentFolderId = listRes.files[0].id;
    return cachedParentFolderId;
  }

  const created = (await driveApiFetch(`/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: CLIENTS_PARENT_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  })) as { id: string };
  cachedParentFolderId = created.id;
  return cachedParentFolderId;
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const created = (await driveApiFetch(`/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  })) as { id: string };
  return created.id;
}

async function findSubfolder(parentId: string, name: string): Promise<string | null> {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQueryValue(name)}' and trashed=false and '${parentId}' in parents`;
  const listRes = (await driveApiFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id)`)) as {
    files: { id: string }[];
  };
  return listRes.files[0]?.id ?? null;
}

export type ShareResult = { ok: true } | { ok: false; reason: "not_configured" | "request_failed"; detail?: string };

// Files created via OAuth belong to the coach's own Google account and are
// private by default — our read-only display proxy (google-drive.ts) reads
// through a separate identity, a service account, which has no access to
// them until explicitly granted. Sharing the client's top-level folder once
// is enough: Drive resolves access by walking up a file's ancestors, so
// everything already inside it (the "תרגולים" subfolder, files dropped in
// manually) and everything added later is covered by the same grant.
//
// Returns a result instead of throwing so callers can decide for
// themselves whether a failure matters — folder creation/linking treats it
// as best-effort (shouldn't block on Drive being briefly unreachable),
// while an admin-triggered "fix this now" action wants to surface exactly
// what went wrong instead of a silent no-op that looks like success.
export async function shareWithServiceAccount(folderId: string): Promise<ShareResult> {
  const email = getServiceAccountEmail();
  if (!email) return { ok: false, reason: "not_configured" };
  try {
    await driveApiFetch(`/files/${folderId}/permissions?sendNotificationEmail=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "user", emailAddress: email }),
    });
    return { ok: true };
  } catch (e) {
    console.error("Failed to share Drive folder with service account", e);
    return { ok: false, reason: "request_failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

const EXERCISES_SUBFOLDER_NAME = "תרגולים";

// Finds the "תרגולים" subfolder inside an existing client folder (the
// structure the coach already uses), creating it if it's genuinely
// missing — e.g. for a brand-new client folder we just created ourselves.
export async function findOrCreateExercisesFolder(clientFolderId: string): Promise<string> {
  const existing = await findSubfolder(clientFolderId, EXERCISES_SUBFOLDER_NAME);
  if (existing) return existing;
  return createFolder(EXERCISES_SUBFOLDER_NAME, clientFolderId);
}

// Creates a fresh folder (with its own "תרגולים" subfolder, matching the
// coach's existing structure) for a new client under the shared parent
// folder. Best-effort — callers should treat failure as non-fatal (client
// creation shouldn't fail just because Drive is briefly unreachable).
export async function createClientFolder(
  clientName: string
): Promise<{ folderId: string; exercisesFolderId: string }> {
  const parentId = await getOrCreateClientsParentFolder();
  const folderId = await createFolder(clientName, parentId);
  const exercisesFolderId = await createFolder(EXERCISES_SUBFOLDER_NAME, folderId);
  await shareWithServiceAccount(folderId);
  return { folderId, exercisesFolderId };
}

// Starts a resumable upload session and hands back its session URL. The
// actual bytes are sent later, in chunks, relayed through our own server
// (see /api/admin/drive-upload/relay) rather than PUT directly from the
// browser — Google's resumable endpoint doesn't support that over CORS.
export async function createResumableUploadSession(
  folderId: string,
  filename: string,
  mimeType: string,
  fileSize: number
): Promise<string> {
  const token = await getDriveAccessToken();
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(fileSize),
    },
    body: JSON.stringify({ name: filename, parents: [folderId] }),
  });
  if (!res.ok) throw new Error(`Failed to start Drive upload session: ${res.status} ${await res.text()}`);
  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) throw new Error("Drive did not return an upload session URL");
  return uploadUrl;
}
