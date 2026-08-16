import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientDetailView } from "@/components/admin/ClientDetailView";
import { syncClientFolders } from "@/lib/drive-sync-job";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  // Best-effort: catches up on anything created/removed by hand in this
  // client's Drive folders since the last daily sync, so it's reflected
  // here without waiting for the scheduled run. A failure (Drive down,
  // not connected) shouldn't block the page from loading.
  await syncClientFolders(id).catch((e) => console.error("Failed to sync client Drive folders", id, e));

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      sessions: {
        orderBy: { number: "asc" },
        include: {
          summaryFiles: { orderBy: { order: "asc" } },
          notes: {
            where: { parentId: null },
            orderBy: { createdAt: "asc" },
            include: { replies: { orderBy: { createdAt: "asc" } } },
          },
        },
      },
      exercises: { where: { folderId: null }, orderBy: { number: "asc" } },
      exerciseFolders: {
        orderBy: { order: "asc" },
        include: { items: { orderBy: { number: "asc" } } },
      },
    },
  });
  if (!client) notFound();

  return (
    <ClientDetailView
      initialTab={tab === "notes" || tab === "exercises" ? tab : undefined}
      client={{
        id: client.id,
        name: client.name,
        email: client.email,
        totalSessions: client.totalSessions,
        driveFolderId: client.driveFolderId,
        firstLoginAt: client.firstLoginAt?.toISOString() ?? null,
        lastActiveAt: client.lastActiveAt?.toISOString() ?? null,
        sessions: client.sessions.map((s) => ({ ...s, viewedAt: s.viewedAt?.toISOString() ?? null })),
        exercises: client.exercises,
        exerciseFolders: client.exerciseFolders,
        notes: client.sessions
          .filter((s) => s.notes.length > 0)
          .map((s) => ({
            sessionId: s.id,
            number: s.number,
            title: s.title,
            notes: s.notes.map((n) => ({
              id: n.id,
              text: n.text,
              createdAt: n.createdAt.toISOString(),
              replies: n.replies.map((r) => ({ id: r.id, text: r.text, createdAt: r.createdAt.toISOString(), author: r.author })),
            })),
          })),
      }}
    />
  );
}
