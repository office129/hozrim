import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientDetailView } from "@/components/admin/ClientDetailView";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { number: "asc" } },
      exercises: { orderBy: { number: "asc" } },
    },
  });
  if (!client) notFound();

  return (
    <ClientDetailView
      client={{
        id: client.id,
        name: client.name,
        email: client.email,
        totalSessions: client.totalSessions,
        sessions: client.sessions,
        exercises: client.exercises,
        notes: client.sessions
          .filter((s) => s.clientNote && s.clientNote.trim())
          .map((s) => ({ sessionId: s.id, number: s.number, title: s.title, text: s.clientNote })),
      }}
    />
  );
}
