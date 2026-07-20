const DRIVE_FILE_ID_RE = /\/file\/d\/([^/]+)/;

export function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function driveEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)drive\.google\.com$/.test(u.hostname)) return null;
    const match = DRIVE_FILE_ID_RE.exec(u.pathname);
    const fileId = match ? match[1] : u.searchParams.get("id");
    if (!fileId) return null;
    return `https://drive.google.com/file/d/${fileId}/preview`;
  } catch {
    return null;
  }
}
