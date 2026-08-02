import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/app-url";
import { sendPushToClient, sendPushToAllClients } from "@/lib/push";

async function emailClient(clientId: string, title: string) {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { email: true, name: true } });
    if (!client) return;
    await sendMail(
      client.email,
      "חוזרים לבראשית — עדכון חדש",
      `שלום ${client.name},\n\n${title}\n\nלצפייה, היכנס/י למרחב הליווי האישי שלך:\n${getAppBaseUrl()}/login`
    );
  } catch (e) {
    console.error("Failed to send notification email", e);
  }
}

// A new session/exercise becoming available, or a broadcast the coach
// sends to every client at once - both land in the same bell icon in the
// client app, differentiated by `type` only for icon/styling purposes.
// The in-app row is the one thing that must always succeed; email and
// push are best-effort side channels on top of it.
export async function notifyClient(
  clientId: string,
  data: { type: "session" | "exercise" | "welcome"; title: string; link?: string }
): Promise<void> {
  await prisma.notification.create({
    data: { clientId, type: data.type, title: data.title, link: data.link },
  });

  if (data.type === "session" || data.type === "exercise") {
    await emailClient(clientId, data.title);
  }
  await sendPushToClient(clientId, { title: data.title, link: data.link });
}

// One row per client, so "read" stays a plain per-row timestamp - no
// separate join table needed to track who's seen a broadcast.
export async function notifyAllClients(data: { title: string; link?: string }): Promise<number> {
  const clients = await prisma.client.findMany({ select: { id: true } });
  if (!clients.length) return 0;
  await prisma.notification.createMany({
    data: clients.map((c) => ({ clientId: c.id, type: "broadcast", title: data.title, link: data.link ?? null })),
  });
  await sendPushToAllClients(data);
  return clients.length;
}
