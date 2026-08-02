import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import { saveUpload, UploadValidationError } from "@/lib/storage";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const uploads = await prisma.personalUpload.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ uploads });
}

// Fallback path when Drive isn't connected (or the client has no Drive
// folder linked) - the client-facing counterpart of the admin session/
// exercise upload routes, storing to Blob/local instead. The direct-to-
// Drive path (see /api/client/drive-upload/init) is tried first from the
// browser; this only runs when that one isn't usable.
export async function POST(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const mediaType = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
  const kind = mediaType === "document" ? "file" : mediaType;

  try {
    const { url, fileName } = await saveUpload(file, kind, `clients/${clientId}`);
    const upload = await prisma.personalUpload.create({
      data: { clientId, url, fileName, mediaType },
    });
    return NextResponse.json({ upload });
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

// Registers a file already uploaded straight to Drive (see
// /api/client/drive-upload/init + relay) as a personal upload row.
export async function PATCH(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";
  const fileName = typeof body?.fileName === "string" ? body.fileName : "";
  const mediaType = body?.mediaType === "video" || body?.mediaType === "audio" ? body.mediaType : "document";
  if (!url || !fileName) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const upload = await prisma.personalUpload.create({ data: { clientId, url, fileName, mediaType } });
  return NextResponse.json({ upload });
}
