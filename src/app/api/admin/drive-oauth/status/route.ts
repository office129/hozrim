import { NextResponse } from "next/server";
import { requireAdmin, isResponse } from "@/lib/guard";
import { getConnection, isDriveOAuthConfigured } from "@/lib/google-drive-oauth";

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const configured = isDriveOAuthConfigured();
  const connection = configured ? await getConnection() : null;

  return NextResponse.json({
    configured,
    connected: !!connection,
    email: connection?.connectedEmail ?? null,
    meetRecordingsFolderId: connection?.meetRecordingsFolderId ?? null,
  });
}
