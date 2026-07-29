const DRIVE_FILE_ID_RE = /\/file\/d\/([^/]+)/;
const DRIVE_FOLDER_ID_RE = /\/folders\/([^/?]+)/;

export function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function driveFileId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)drive\.google\.com$/.test(u.hostname)) return null;
    const match = DRIVE_FILE_ID_RE.exec(u.pathname);
    return match ? match[1] : u.searchParams.get("id");
  } catch {
    return null;
  }
}

export function driveEmbedUrl(url: string): string | null {
  const fileId = driveFileId(url);
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;
}

export function driveFolderId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)drive\.google\.com$/.test(u.hostname)) return null;
    const match = DRIVE_FOLDER_ID_RE.exec(u.pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
