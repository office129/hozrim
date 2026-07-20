import { notFound } from "next/navigation";
import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SessionDetailView } from "@/components/client/SessionDetailView";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = (await getClientId())!;
  const { id } = await params;

  const session = await prisma.lessonSession.findFirst({ where: { id, clientId } });
  if (!session) notFound();

  return (
    <SessionDetailView
      session={{
        id: session.id,
        number: session.number,
        title: session.title,
        date: session.createdAt.toISOString(),
        mediaType: session.mediaType,
        fileUrl: session.fileUrl,
        completed: session.completed,
        summaryText: session.summaryText,
        summaryFileUrl: session.summaryFileUrl,
        summaryFileName: session.summaryFileName,
        clientNote: session.clientNote,
      }}
    />
  );
}
