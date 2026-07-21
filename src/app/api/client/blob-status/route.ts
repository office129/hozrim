import { NextResponse } from "next/server";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET() {
  const client = await requireClient();
  if (isResponse(client)) return client;
  return NextResponse.json({ enabled: !!process.env.BLOB_READ_WRITE_TOKEN });
}
