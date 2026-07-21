import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin, isResponse } from "@/lib/guard";
import { KIND_RULES, UploadKind } from "@/lib/storage";

const ALLOWED_CONTENT_TYPES: Record<UploadKind, string[] | undefined> = {
  video: ["video/*"],
  audio: ["audio/*"],
  pdf: ["application/pdf"],
  file: undefined,
};

// Mints short-lived client tokens so the browser can PUT large files
// directly to Vercel Blob, instead of proxying the bytes through this
// serverless function (which is capped at ~4.5MB per request).
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const kind: UploadKind = clientPayload && clientPayload in KIND_RULES ? (clientPayload as UploadKind) : "file";
        return {
          addRandomSuffix: false,
          maximumSizeInBytes: KIND_RULES[kind].maxBytes,
          allowedContentTypes: ALLOWED_CONTENT_TYPES[kind],
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
