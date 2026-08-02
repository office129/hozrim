import { prisma } from "@/lib/prisma";

// A new session/exercise becoming available, or a broadcast the coach
// sends to every client at once - both land in the same bell icon in the
// client app, differentiated by `type` only for icon/styling purposes.
export async function notifyClient(
  clientId: string,
  data: { type: "session" | "exercise" | "welcome"; title: string; link?: string }
): Promise<void> {
  await prisma.notification.create({
    data: { clientId, type: data.type, title: data.title, link: data.link },
  });
}

// One row per client, so "read" stays a plain per-row timestamp - no
// separate join table needed to track who's seen a broadcast.
export async function notifyAllClients(data: { title: string; link?: string }): Promise<number> {
  const clients = await prisma.client.findMany({ select: { id: true } });
  if (!clients.length) return 0;
  await prisma.notification.createMany({
    data: clients.map((c) => ({ clientId: c.id, type: "broadcast", title: data.title, link: data.link ?? null })),
  });
  return clients.length;
}
