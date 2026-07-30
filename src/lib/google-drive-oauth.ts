import { prisma } from "@/lib/prisma";

// The coach's own Drive, connected via a real "sign in with Google" (OAuth)
// flow. This lets the server both write files (using the coach's own
// storage quota) and read them back for in-app display — the same
// connection covers both, since the coach's account already owns
// everything it uploads and needs no separate sharing step to read it.

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

// Whether the in-app display proxy (streaming a Drive file's bytes through
// our own <video>/<audio> elements) can currently work — needs both the
// OAuth app credentials and an active connection to actually have a token.
export async function isDriveReadEnabled(): Promise<boolean> {
  return isDriveOAuthConfigured() && !!(await getConnection());
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

// Streams a Drive file's bytes through the coach's own OAuth connection,
// preserving Range support so the browser's native video/audio scrubber
// works. The caller forwards the response status/headers/body as-is.
export async function fetchDriveFile(fileId: string, rangeHeader: string | null): Promise<Response> {
  const token = await getDriveAccessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (rangeHeader) headers.Range = rangeHeader;
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers });
}

const EXERCISES_SUBFOLDER_NAME = "תרגולים";
const MEETINGS_SUBFOLDER_NAME = "פגישות והקלטות";

// Finds the "תרגולים" subfolder inside an existing client folder (the
// structure the coach already uses), creating it if it's genuinely
// missing — e.g. for a brand-new client folder we just created ourselves.
export async function findOrCreateExercisesFolder(clientFolderId: string): Promise<string> {
  const existing = await findSubfolder(clientFolderId, EXERCISES_SUBFOLDER_NAME);
  if (existing) return existing;
  return createFolder(EXERCISES_SUBFOLDER_NAME, clientFolderId);
}

// Same idea as findOrCreateExercisesFolder, for the "פגישות והקלטות"
// subfolder that holds one folder per session.
export async function findOrCreateMeetingsFolder(clientFolderId: string): Promise<string> {
  const existing = await findSubfolder(clientFolderId, MEETINGS_SUBFOLDER_NAME);
  if (existing) return existing;
  return createFolder(MEETINGS_SUBFOLDER_NAME, clientFolderId);
}

function formatSessionFolderDate(date: Date): string {
  // Always in Israel time regardless of the server's own timezone, so the
  // date matches what the coach actually expects to see, not whatever
  // instant Vercel's servers happen to run in.
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

// Each session gets its own folder (e.g. "פגישה 3 - 30.07.2026") inside
// "פגישות והקלטות", holding both the recording and its PDF summary
// together — mirroring how the coach already thinks about sessions in the
// app, with the date included so folders are identifiable at a glance
// without opening the app.
export async function findOrCreateSessionFolder(
  meetingsFolderId: string,
  sessionNumber: number,
  sessionDate: Date
): Promise<string> {
  const name = `פגישה ${sessionNumber} - ${formatSessionFolderDate(sessionDate)}`;
  const existing = await findSubfolder(meetingsFolderId, name);
  if (existing) return existing;
  return createFolder(name, meetingsFolderId);
}

// Creates a fresh folder (with its own "תרגולים" and "פגישות והקלטות"
// subfolders, matching the coach's existing structure) for a new client
// under the shared parent folder. Best-effort — callers should treat
// failure as non-fatal (client creation shouldn't fail just because Drive
// is briefly unreachable).
export async function createClientFolder(
  clientName: string
): Promise<{ folderId: string; exercisesFolderId: string; meetingsFolderId: string }> {
  const parentId = await getOrCreateClientsParentFolder();
  const folderId = await createFolder(clientName, parentId);
  const exercisesFolderId = await createFolder(EXERCISES_SUBFOLDER_NAME, folderId);
  const meetingsFolderId = await createFolder(MEETINGS_SUBFOLDER_NAME, folderId);
  return { folderId, exercisesFolderId, meetingsFolderId };
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
