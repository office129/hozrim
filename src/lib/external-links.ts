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

// Recognises the common YouTube URL shapes (watch?v=, youtu.be/, /embed/,
// /shorts/) and returns a privacy-friendly nocookie embed URL, or null if
// it isn't a YouTube link at all.
export function youTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") {
      id = u.pathname.slice(1).split("/")[0] || null;
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        const m = /^\/(?:embed|shorts|v)\/([^/?]+)/.exec(u.pathname);
        id = m ? m[1] : null;
      }
    }
    if (!id || !/^[A-Za-z0-9_-]{6,}$/.test(id)) return null;
    return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    return null;
  }
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
