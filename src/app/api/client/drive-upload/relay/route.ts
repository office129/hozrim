import { NextRequest, NextResponse } from "next/server";
import { requireNonPreviewClient, isResponse } from "@/lib/guard";

// Client-facing counterpart of /api/admin/drive-upload/relay - same plain
// server-to-server relay of one chunk to Google's resumable-upload session
// URL, just gated by requireNonPreviewClient instead of requireAdmin.
export async function PUT(req: NextRequest) {
  const clientId = await requireNonPreviewClient();
  if (isResponse(clientId)) return clientId;

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
