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

// Moves a file to the Drive trash (not a permanent delete) when its
// session/exercise/client is deleted from the app — recoverable from
// Drive's own trash for 30 days in case of a mistaken delete, same
// safety margin Drive itself gives for anything deleted by hand.
export async function trashDriveFile(fileId: string): Promise<void> {
  await driveApiFetch(`/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// Lists the actual files (not subfolders) directly inside a folder — used
// to scan a shared "Meet Recordings" folder for new recordings, and to
// reconcile a client's session/library folders against what the app
// already knows about (mimeType lets the caller tell a video/audio
// recording apart from a PDF summary).
export async function listFolderFiles(
  folderId: string
): Promise<{ id: string; name: string; createdTime: string; mimeType: string }[]> {
  const q = `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`;
  const res = (await driveApiFetch(
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,mimeType)&pageSize=1000`
  )) as { files: { id: string; name: string; createdTime: string; mimeType: string }[] };
  return res.files;
}

// Whether a folder (or any file) still exists and hasn't been trashed —
// used to notice a session/library-item folder the coach deleted (or
// trashed) directly in Drive, which listFolderFiles alone can't catch:
// it only reports the folder's own children, not whether the folder
// itself is still around.
export async function folderExists(fileId: string): Promise<boolean> {
  try {
    const res = (await driveApiFetch(`/files/${fileId}?fields=id,trashed`)) as { trashed: boolean };
    return !res.trashed;
  } catch (e) {
    if (e instanceof Error && /Drive API error: 404/.test(e.message)) return false;
    throw e;
  }
}

// Lists the subfolders directly inside a folder — used to notice a
// session/library-item folder the coach created by hand directly in
// Drive, with no matching row in the app yet.
export async function listSubfolders(folderId: string): Promise<{ id: string; name: string }[]> {
  const q = `'${folderId}' in parents and trashed=false and mimeType = 'application/vnd.google-apps.folder'`;
  const res = (await driveApiFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`)) as {
    files: { id: string; name: string }[];
  };
  return res.files;
}

// Copies a file into another folder — used to bring a Meet recording
// (which lives in a folder shared with, but not owned by, this account)
// into the matched client's own session folder without needing to move
// or take ownership of the original, which isn't reliably possible across
// two different Google accounts.
export async function copyDriveFile(fileId: string, destinationFolderId: string, name?: string): Promise<string> {
  const created = (await driveApiFetch(`/files/${fileId}/copy?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parents: [destinationFolderId], ...(name ? { name } : {}) }),
  })) as { id: string };
  return created.id;
}

const CLIENTS_PARENT_FOLDER_NAME = "חוזרים לבראשית - לקוחות";

// Persisted on the connection row (not just cached in memory - a
// serverless instance's memory doesn't survive between requests, so an
// in-memory-only cache re-does this name-based lookup constantly) so
// that renaming this folder in Drive later can't cause the lookup to
// miss it and create a duplicate - once found or created, its ID is
// fixed here regardless of what the folder gets renamed to afterward.
async function getOrCreateClientsParentFolder(): Promise<string> {
  const connection = await getConnection();
  if (connection?.clientsParentFolderId) return connection.clientsParentFolderId;

  const q = `mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQueryValue(CLIENTS_PARENT_FOLDER_NAME)}' and trashed=false and 'root' in parents`;
  const listRes = (await driveApiFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id)`)) as {
    files: { id: string }[];
  };

  let folderId: string;
  if (listRes.files.length) {
    folderId = listRes.files[0].id;
  } else {
    const created = (await driveApiFetch(`/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: CLIENTS_PARENT_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    })) as { id: string };
    folderId = created.id;
  }

  if (connection) {
    await prisma.googleDriveConnection.update({ where: { id: connection.id }, data: { clientsParentFolderId: folderId } });
  }
  return folderId;
}

const LIBRARY_FOLDER_NAME = "ספריית תכנים";

// A general (not per-client) folder for the opening-content library items,
// living as a sibling of the per-client folders under the same shared
// parent. Same persisted-by-ID reasoning as getOrCreateClientsParentFolder
// above - can also be set explicitly (see the "meet-folder"-style admin
// route) to repoint it at a specific folder, e.g. after renaming it.
export async function getOrCreateLibraryFolder(): Promise<string> {
  const connection = await getConnection();
  if (connection?.libraryFolderId) return connection.libraryFolderId;

  const parentId = await getOrCreateClientsParentFolder();
  const existing = await findSubfolder(parentId, LIBRARY_FOLDER_NAME);
  const folderId = existing || (await createFolder(LIBRARY_FOLDER_NAME, parentId));

  if (connection) {
    await prisma.googleDriveConnection.update({ where: { id: connection.id }, data: { libraryFolderId: folderId } });
  }
  return folderId;
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
const UPLOADS_SUBFOLDER_NAME = "ההעלאות שלי";

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

// Same idea, for "ההעלאות שלי" — unlike the other two subfolders, this one
// is never created eagerly when the client's Drive folder is first linked;
// it only comes into existence the first time the client actually uploads
// something personal of their own.
export async function findOrCreateUploadsFolder(clientFolderId: string): Promise<string> {
  const existing = await findSubfolder(clientFolderId, UPLOADS_SUBFOLDER_NAME);
  if (existing) return existing;
  return createFolder(UPLOADS_SUBFOLDER_NAME, clientFolderId);
}

// Same idea as findOrCreateSessionFolder, one folder per named personal-
// upload group (named after whatever the client typed) inside "ההעלאות
// שלי" - holding every file the client considers related to that group.
export async function findOrCreateUploadGroupFolder(uploadsFolderId: string, groupTitle: string): Promise<string> {
  const existing = await findSubfolder(uploadsFolderId, groupTitle);
  if (existing) return existing;
  return createFolder(groupTitle, uploadsFolderId);
}

// Each session gets its own folder inside "פגישות והקלטות", named
// exactly after the session's own title (one-to-one, whatever the coach
// typed when creating it) — holding both the recording and its PDF
// summary together.
export async function findOrCreateSessionFolder(meetingsFolderId: string, sessionTitle: string): Promise<string> {
  const existing = await findSubfolder(meetingsFolderId, sessionTitle);
  if (existing) return existing;
  return createFolder(sessionTitle, meetingsFolderId);
}

// Same idea as findOrCreateSessionFolder, one folder per library category
// (named after the category's own title) inside the general "ספריית
// תכנים" folder — lessons inside a category store their files directly
// here rather than each getting their own further-nested subfolder.
export async function findOrCreateLibraryCategoryFolder(libraryFolderId: string, categoryTitle: string): Promise<string> {
  const existing = await findSubfolder(libraryFolderId, categoryTitle);
  if (existing) return existing;
  return createFolder(categoryTitle, libraryFolderId);
}

// Renames a Drive file/folder in place - used when a category is renamed
// in the app so its Drive folder's name doesn't go stale.
export async function renameDriveFile(fileId: string, name: string): Promise<void> {
  await driveApiFetch(`/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

// Moves a file between two folders it's directly inside of - used when a
// lesson is reassigned to a different category (or back to the top-level
// library folder), so its actual file in Drive follows the same move
// instead of being left behind in its old location.
export async function moveDriveFile(fileId: string, fromFolderId: string, toFolderId: string): Promise<void> {
  await driveApiFetch(
    `/files/${fileId}?addParents=${encodeURIComponent(toFolderId)}&removeParents=${encodeURIComponent(fromFolderId)}`,
    { method: "PATCH" }
  );
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
