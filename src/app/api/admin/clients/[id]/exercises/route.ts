import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";

// A new exercise starts with no Drive folder of its own - its files
// upload straight into the client's shared "תרגולים" folder unless the
// coach explicitly asks for a dedicated folder (see the
// [exerciseId]/drive-folder route), so most exercises stay simple and
// only the ones that actually need Drive-side file detection get one.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id: clientId } = await params;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "נא להזין שם לתרגול" }, { status: 400 });

  const count = await prisma.exercise.count({ where: { clientId } });
  const exercise = await prisma.exercise.create({
    data: { clientId, title, number: count + 1 },
  });

  return NextResponse.json({ exercise });
}
