import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { deleteUploadByUrl } from "@/lib/storage";
import { driveFolderId } from "@/lib/external-links";
import { findOrCreateExercisesFolder, findOrCreateMeetingsFolder } from "@/lib/google-drive-oauth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      sessions: {
        orderBy: { number: "asc" },
        include: { summaryFiles: { orderBy: { order: "asc" } } },
      },
      exercises: { orderBy: { number: "asc" } },
    },
  });
  if (!client) return NextResponse.json({ error: "לקוח/ה לא נמצא/ה" }, { status: 404 });

  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      sessions: client.sessions,
      exercises: client.exercises,
      notes: client.sessions
        .filter((s) => s.clientNote && s.clientNote.trim())
        .map((s) => ({ sessionId: s.id, number: s.number, title: s.title, text: s.clientNote })),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const data: {
    name?: string;
    email?: string;
    totalSessions?: number;
    driveFolderId?: string;
    driveExercisesFolderId?: string;
    driveMeetingsFolderId?: string;
  } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.email === "string" && body.email.trim()) data.email = body.email.trim().toLowerCase();
  if (body?.totalSessions !== undefined) {
    const parsed = parseInt(body.totalSessions, 10);
    if (!Number.isFinite(parsed)) return NextResponse.json({ error: "מספר לא תקין" }, { status: 400 });
    data.totalSessions = Math.max(1, Math.min(30, parsed));
  }
  if (typeof body?.driveFolderUrl === "string" && body.driveFolderUrl.trim()) {
    const folderId = driveFolderId(body.driveFolderUrl.trim());
    if (!folderId) return NextResponse.json({ error: "קישור תיקייה לא תקין" }, { status: 400 });
    data.driveFolderId = folderId;
    // Best-effort: the coach's existing folders already have a "תרגולים"
    // subfolder — find it now so exercise uploads know where to go later,
    // without needing a second manual link. A failure here (Drive
    // unreachable, unexpected structure) shouldn't block saving the link.
    try {
      data.driveExercisesFolderId = await findOrCreateExercisesFolder(folderId);
    } catch (e) {
      console.error("Failed to find/create exercises subfolder", e);
    }
    // Same idea for the "פגישות והקלטות" subfolder that will hold each
    // session's own "פגישה N" folder.
    try {
      data.driveMeetingsFolderId = await findOrCreateMeetingsFolder(folderId);
    } catch (e) {
      console.error("Failed to find/create meetings subfolder", e);
    }
  }

  if (data.email) {
    const dup = await prisma.client.findFirst({ where: { email: data.email, NOT: { id } } });
    if (dup) return NextResponse.json({ error: "כבר קיים חשבון עם האימייל הזה" }, { status: 409 });
  }

  const client = await prisma.client.update({ where: { id }, data });
  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      totalSessions: client.totalSessions,
      driveFolderId: client.driveFolderId,
      driveExercisesFolderId: client.driveExercisesFolderId,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: { sessions: { include: { summaryFiles: true } }, exercises: true },
  });
  if (!client) return NextResponse.json({ error: "לא נמצא/ה" }, { status: 404 });

  // Deleting the row cascades to sessions/exercises/journal/passkeys in the
  // DB, but the actual uploaded files live outside it (Blob storage or
  // local disk) and won't clean themselves up.
  await deleteUploadByUrl(client.avatarUrl);
  for (const s of client.sessions) {
    await deleteUploadByUrl(s.fileUrl);
    for (const f of s.summaryFiles) {
      await deleteUploadByUrl(f.url);
    }
  }
  for (const e of client.exercises) {
    await deleteUploadByUrl(e.audioFileUrl);
    await deleteUploadByUrl(e.pdfFileUrl);
  }

  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
