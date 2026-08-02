"use client";

import { apiSend } from "@/lib/api-client";

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

// Web Push's applicationServerKey wants raw bytes, not the base64url
// string VAPID keys are normally shared as.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// Registers the service worker (idempotent - a second call is a no-op if
// one's already registered), asks for notification permission, and sends
// the resulting subscription to the server. Throws with a Hebrew message
// on anything the caller should show to the client (permission denied,
// unsupported browser, missing server config).
export async function enablePushNotifications(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("הדפדפן הזה לא תומך בהתראות");
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("התראות לא הוגדרו עדיין בשרת");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("ההרשאה נדחתה - אפשר לאשר אותה מחדש דרך הגדרות הדפדפן");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const json = subscription.toJSON();
  await apiSend("/api/client/push/subscribe", "POST", {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });
}

export async function disablePushNotifications(): Promise<void> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;
  await apiSend("/api/client/push/unsubscribe", "POST", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
