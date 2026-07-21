import { NextRequest } from "next/server";
import { getAdminId, getClientId } from "@/lib/auth";
import { fetchDriveFile } from "@/lib/google-drive";

// Proxies a Drive file's bytes through our own server (via a service
// account that the coach shares their Drive folder with), so the browser
// can play it in our own <video>/<audio> element instead of Google's own
// embedded preview widget, which we don't control the look of.
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const adminId = await getAdminId();
  const clientId = await getClientId();
  if (!adminId && !clientId) return new Response("Unauthorized", { status: 401 });

  const { fileId } = await params;
  let driveRes: Response;
  try {
    driveRes = await fetchDriveFile(fileId, req.headers.get("range"));
  } catch {
    return new Response("Drive not configured", { status: 502 });
  }

  if (!driveRes.ok) {
    return new Response("Not found", { status: driveRes.status === 404 ? 404 : 502 });
  }

  const headers = new Headers();
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = driveRes.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("cache-control", "private, max-age=3600");
  return new Response(driveRes.body, { status: driveRes.status, headers });
}
