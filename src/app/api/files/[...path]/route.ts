import { NextRequest } from "next/server";
import { getAdminId, getClientId } from "@/lib/auth";
import { resolveStoredPath, streamFile } from "@/lib/storage";

// Serves uploaded video/audio/PDF files. Access rules:
//  - "library/..."       -> any authenticated client or admin (shared content)
//  - "clients/<id>/..."  -> the owning client, or any admin
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  if (!segments || segments.length < 2) {
    return new Response("Not found", { status: 404 });
  }

  const [scope, ...rest] = segments;
  const adminId = await getAdminId();
  const clientId = await getClientId();

  if (scope === "library") {
    if (!adminId && !clientId) return new Response("Unauthorized", { status: 401 });
  } else if (scope === "clients") {
    const ownerId = rest[0];
    if (!adminId && clientId !== ownerId) {
      return new Response("Unauthorized", { status: 401 });
    }
  } else {
    return new Response("Not found", { status: 404 });
  }

  const fullPath = resolveStoredPath(segments);
  if (!fullPath) return new Response("Not found", { status: 404 });

  try {
    return await streamFile(fullPath, req.headers.get("range"));
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
