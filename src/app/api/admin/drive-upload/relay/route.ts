import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isResponse } from "@/lib/guard";

// Relays one chunk of a large file to Google's resumable-upload session
// URL. This is a plain server-to-server fetch — CORS never enters into it
// (CORS only restricts browser-initiated cross-origin requests) — which is
// exactly why the browser talks to this route instead of Google directly.
// The target is restricted to Google's own upload host to keep this from
// being usable as an open proxy to arbitrary URLs.
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const uploadUrl = req.headers.get("x-drive-upload-url") || "";
  if (!uploadUrl.startsWith("https://www.googleapis.com/upload/drive/")) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  const contentRange = req.headers.get("content-range");
  const contentType = req.headers.get("x-drive-content-type") || "application/octet-stream";

  const chunk = await req.arrayBuffer();

  let driveRes: Response;
  try {
    driveRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        ...(contentRange ? { "Content-Range": contentRange } : {}),
        "Content-Type": contentType,
      },
      body: chunk,
    });
  } catch (e) {
    console.error("Drive chunk relay network error", e);
    return NextResponse.json({ error: "העלאת חלק מהקובץ נכשלה" }, { status: 502 });
  }

  // 308 = "Resume Incomplete": Google received this chunk and is waiting
  // for the rest — not an error, just "keep going".
  if (driveRes.status === 308) {
    return NextResponse.json({ done: false });
  }
  if (driveRes.ok) {
    const file = await driveRes.json().catch(() => null);
    return NextResponse.json({ done: true, file });
  }

  console.error("Drive chunk relay rejected", driveRes.status, await driveRes.text().catch(() => ""));
  return NextResponse.json({ error: "העלאת חלק מהקובץ נכשלה" }, { status: 502 });
}
