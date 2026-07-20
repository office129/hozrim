import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClient, isResponse } from "@/lib/guard";

export async function GET() {
  const clientId = await requireClient();
  if (isResponse(clientId)) return clientId;

  const items = await prisma.libraryItem.findMany({ orderBy: { number: "asc" } });
  return NextResponse.json({
    items: items.map((it) => ({
      id: it.id,
      title: it.title,
      hasVideo: !!it.videoFileUrl,
      hasAudio: !!it.audioFileUrl,
      hasFile: !!it.fileUrl,
      videoUrl: it.videoFileUrl,
      audioUrl: it.audioFileUrl,
      fileUrl: it.fileUrl,
      fileName: it.fileName,
    })),
  });
}
