import { notFound } from "next/navigation";
import { after } from "next/server";
import { getClientId, isPreviewClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SessionDetailView } from "@/components/client/SessionDetailView";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = (await getClientId())!;
  const { id } = await params;
  const preview = await isPreviewClientSession();

  const [session, client] = await Promise.all([
    prisma.lessonSession.findFirst({
      where: { id, clientId },
      include: {
        summaryFiles: { orderBy: { order: "asc" } },
        notes: {
          where: { parentId: null },
          orderBy: { createdAt: "asc" },
          include: { replies: { orderBy: { createdAt: "asc" } } },
        },
      },
    }),
    prisma.client.findUnique({ where: { id: clientId }, select: { hasSeenSessionCompleteTip: true } }),
  ]);
  if (!session) notFound();

  // First real look at this session's own page - the coach previewing it
  // themselves shouldn't count as the client having viewed it.
  if (!session.viewedAt && !preview) {
    const sessionId = session.id;
    after(() => prisma.lessonSession.update({ where: { id: sessionId }, data: { viewedAt: new Date() } }).catch(() => {}));
  }

  return (
    <SessionDetailView
      showCompleteTip={!client?.hasSeenSessionCompleteTip}
      session={{
        id: session.id,
        number: session.number,
        title: session.title,
        mediaType: session.mediaType,
        fileUrl: session.fileUrl,
        completed: session.completed,
        summaryText: session.summaryText,
        summaryFiles: session.summaryFiles,
        notes: session.notes.map((n) => ({
          id: n.id,
          text: n.text,
          createdAt: n.createdAt.toISOString(),
          replies: n.replies.map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt.toISOString(), author: r.author })),
        })),
      }}
    />
  );
}
