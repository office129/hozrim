import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    "mailto:office@hozrimlebereshit.co.il",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

async function sendToSubscription(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: string
) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
  } catch (e: unknown) {
    // 404/410 = the browser/OS has dropped this subscription (uninstalled,
    // permission revoked, expired) - Google/Apple's own push service is
    // telling us it'll never succeed again, so it's cleaned up rather than
    // retried forever.
    const statusCode = (e as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    } else {
      console.error("Failed to send push notification", e);
    }
  }
}

export async function sendPushToClient(clientId: string, data: { title: string; link?: string }): Promise<void> {
  if (!isPushConfigured()) return;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { clientId } });
  if (!subscriptions.length) return;

  ensureConfigured();
  const payload = JSON.stringify({ title: "חוזרים לבראשית", body: data.title, link: data.link || "/app/home" });
  await Promise.all(subscriptions.map((sub) => sendToSubscription(sub, payload)));
}

export async function sendPushToAllClients(data: { title: string; link?: string }): Promise<void> {
  if (!isPushConfigured()) return;
  const subscriptions = await prisma.pushSubscription.findMany();
  if (!subscriptions.length) return;

  ensureConfigured();
  const payload = JSON.stringify({ title: "חוזרים לבראשית", body: data.title, link: data.link || "/app/home" });
  await Promise.all(subscriptions.map((sub) => sendToSubscription(sub, payload)));
}
