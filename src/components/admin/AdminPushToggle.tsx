"use client";

import { useEffect, useState } from "react";
import {
  isPushSupported,
  getExistingPushSubscription,
  enableAdminPushNotifications,
  disableAdminPushNotifications,
} from "@/lib/push-client";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

// Lets the coach turn on push alerts for the admin panel (e.g. a client
// wrote a note). On iOS this only works once the panel is installed to the
// home screen, so there it shows a short install hint instead.
export function AdminPushToggle({ compact = false }: { compact?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsInstall, setNeedsInstall] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    setSupported(true);
    setIos(isIOS());
    // iOS only allows web push from an installed (standalone) PWA.
    if (isIOS() && !isStandalone()) setNeedsInstall(true);
    getExistingPushSubscription()
      .then((sub) => setEnabled(!!sub))
      .catch(() => {});
  }, []);

  if (!supported) return null;

  const installHint = ios
    ? "כדי לקבל התראות: הוסף/י את פאנל הניהול למסך הבית — כפתור השיתוף ואז 'הוסף למסך הבית' — ופתח/י את הפאנל משם."
    : "כדי לקבל התראות: הוסף/י את פאנל הניהול למסך הבית מתפריט הדפדפן, ופתח/י אותו משם.";

  async function toggle() {
    setError("");
    setLoading(true);
    try {
      if (enabled) {
        await disableAdminPushNotifications();
        setEnabled(false);
      } else {
        await enableAdminPushNotifications();
        setEnabled(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  // Compact form (inside the admin chrome): a single small button. Before
  // the panel is installed (iOS), tapping explains how to install.
  if (compact) {
    if (needsInstall) {
      return (
        <button
          onClick={() => alert(installHint)}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-on-brand/15 text-on-brand cursor-pointer whitespace-nowrap"
        >
          הפעלת התראות
        </button>
      );
    }
    return (
      <button
        onClick={toggle}
        disabled={loading}
        className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap ${
          enabled ? "text-on-brand/80 border border-on-brand/30" : "bg-on-brand/15 text-on-brand"
        }`}
      >
        {loading ? "רגע…" : enabled ? "כיבוי התראות" : "הפעלת התראות"}
      </button>
    );
  }

  if (needsInstall) {
    return <div className="text-[12px] text-muted leading-relaxed">{installHint}</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={toggle}
        disabled={loading}
        className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50 ${
          enabled ? "text-danger border border-danger" : "text-brand border border-brand"
        }`}
      >
        {loading ? "רגע…" : enabled ? "כיבוי התראות בנייד" : "הפעלת התראות בנייד"}
      </button>
      {error && <div className="text-danger text-[11.5px]">{error}</div>}
    </div>
  );
}
