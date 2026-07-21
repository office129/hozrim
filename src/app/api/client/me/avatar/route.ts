import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";
import { saveUpload, deleteUploadByUrl, UploadValidationError } from "@/lib/storage";

// Server-proxied fallback for environments without Blob configured (local
// disk dev) — mirrors the admin upload routes' fallback path.
export async function POST(req: NextRequest) {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  try {
    const existing = await prisma.client.findUnique({ where: { id: clientId } });
    const { url } = await saveUpload(file, "image", `clients/${clientId}`);
    await prisma.client.update({ where: { id: clientId }, data: { avatarUrl: url } });
    if (existing?.avatarUrl) await deleteUploadByUrl(existing.avatarUrl);
    return NextResponse.json({ avatarUrl: url });
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
