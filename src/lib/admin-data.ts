import { prisma } from "@/lib/prisma";

export async function getClientsOverview() {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "asc" },
    include: { sessions: { orderBy: { number: "asc" } } },
  });

  return clients.map((c) => {
    const total = c.sessions.length;
    const done = c.sessions.filter((s) => s.completed).length;
    const current = c.sessions.find((s) => !s.completed) || c.sessions[total - 1];
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      total,
      done,
      progressPct: total ? Math.round((done / total) * 100) : 0,
      stageName: current?.title ?? "—",
    };
  });
}
