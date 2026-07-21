import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireClient, isResponse } from "@/lib/guard";
import { KIND_RULES, ALLOWED_CONTENT_TYPES, UploadKind } from "@/lib/storage";

// Client-side counterpart of /api/admin/blob-token — only ever used for a
// client's own profile photo upload, gated by a client (not admin) session.
export async function POST(request: NextRequest) {
  const client = await requireClient();
  if (isResponse(client)) return client;

  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const kind: UploadKind = clientPayload && clientPayload in KIND_RULES ? (clientPayload as UploadKind) : "image";
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
