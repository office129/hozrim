"use client";

let driveConnected: Promise<boolean> | null = null;

function isDriveConnected(): Promise<boolean> {
  if (!driveConnected) {
    driveConnected = fetch("/api/admin/drive-oauth/status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { connected: false }))
      .then((data) => !!data.connected)
      .catch(() => false);
  }
  return driveConnected;
}

// Uploads straight from the browser to Google Drive (bypassing our
// server's ~4.5MB request body limit) into the given client's linked
// folder, using the coach's own Drive storage instead of Vercel Blob.
// Returns null when Drive isn't connected or the client has no folder
// linked yet, so the caller can fall back to the existing Blob/local path.
export async function tryUploadFileToDrive(
  file: File,
  clientId: string,
  folder: "main" | "exercises",
  onProgress?: (percentage: number) => void
): Promise<{ url: string; fileName: string } | null> {
  if (!(await isDriveConnected())) return null;

  const initRes = await fetch("/api/admin/drive-upload/init", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      folder,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    }),
  });
  if (!initRes.ok) return null; // no folder linked (yet), or Drive unreachable

  const { uploadUrl } = (await initRes.json()) as { uploadUrl: string };

  const fileId = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve((JSON.parse(xhr.responseText) as { id: string }).id);
        } catch {
          reject(new Error("תגובה לא צפויה מגוגל דרייב"));
        }
      } else {
        reject(new Error(`העלאה לדרייב נכשלה (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("העלאה לדרייב נכשלה — בדוק/י את החיבור לרשת"));
    xhr.send(file);
  });

  return { url: `https://drive.google.com/file/d/${fileId}/view`, fileName: file.name };
}
