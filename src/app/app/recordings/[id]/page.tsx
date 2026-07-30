import { notFound } from "next/navigation";
import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SessionDetailView } from "@/components/client/SessionDetailView";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = (await getClientId())!;
  const { id } = await params;

  const [session, client] = await Promise.all([
    prisma.lessonSession.findFirst({
      where: { id, clientId },
      include: { summaryFiles: { orderBy: { order: "asc" } } },
    }),
    prisma.client.findUnique({ where: { id: clientId }, select: { hasSeenSessionCompleteTip: true } }),
  ]);
  if (!session) notFound();

  return (
    <SessionDetailView
      showCompleteTip={!client?.hasSeenSessionCompleteTip}
      session={{
        id: session.id,
        number: session.number,
        title: session.title,
        date: session.createdAt.toISOString(),
        mediaType: session.mediaType,
        fileUrl: session.fileUrl,
        completed: session.completed,
        summaryText: session.summaryText,
        summaryFiles: session.summaryFiles,
        clientNote: session.clientNote,
      }}
    />
  );
}
