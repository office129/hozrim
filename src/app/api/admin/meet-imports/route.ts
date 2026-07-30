import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

// The review queue — recordings the daily import job couldn't file
// automatically (name matched no client, matched several, or matched a
// client with no Drive folder linked yet).
export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const imports = await prisma.meetRecordingImport.findMany({
    where: { status: { in: ["ambiguous", "unmatched", "no_folder"] } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ imports });
}
