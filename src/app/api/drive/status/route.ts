import { NextResponse } from "next/server";
import { getAdminId, getClientId } from "@/lib/auth";
import { isDriveReadEnabled } from "@/lib/google-drive-oauth";

export async function GET() {
  const adminId = await getAdminId();
  const clientId = await getClientId();
  if (!adminId && !clientId) return NextResponse.json({ error: "לא מחובר/ת" }, { status: 401 });

  return NextResponse.json({ enabled: await isDriveReadEnabled() });
}
