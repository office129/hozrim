"use client";

import { useEffect, useState } from "react";
import { apiSend } from "@/lib/api-client";
import { isPushSupported, getExistingPushSubscription, enablePushNotifications } from "@/lib/push-client";

// Notification onboarding banner. Two faces, decided at runtime:
//  - Installed app (standalone): a real "enable notifications" button. This
//    is the only context where the permission prompt actually works on
//    iOS, so we only offer it here and tie it to a deliberate click.
//  - Browser (not installed): a short "add to home screen" explainer,
//    since on iPhone push is impossible until the PWA is installed.
// Either way it stays until the client enables notifications or dismisses
// it (persisted via hasSeenPushHint); the personal area keeps the on/off
// toggle regardless.

type Mode = "hidden" | "enable" | "install";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari home-screen apps don't report the display-mode media query.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ masquerades as a Mac, so also treat touch-capable "Macs" as iOS.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

export function PushHintBanner({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(show);
  const [mode, setMode] = useState<Mode>("hidden");
  const [ios, setIos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    (async () => {
      setIos(isIOS());
      if (!isStandalone()) {
        // In a browser tab — point the way to installing.
        if (!cancelled) setMode("install");
        return;
      }
      // Installed app: only nudge if push works here and isn't on already.
      if (!isPushSupported()) {
        if (!cancelled) setMode("hidden");
        return;
      }
      const sub = await getExistingPushSubscription().catch(() => null);
      if (!cancelled) setMode(sub ? "hidden" : "enable");
    })();
    return () => {
      cancelled = true;
    };
  }, [show]);

  if (!visible || mode === "hidden") return null;

  function markSeen() {
    setVisible(false);
    apiSend("/api/client/me", "PATCH", { pushHintSeen: true });
  }

  async function enable() {
    setError("");
    setLoading(true);
    try {
      await enablePushNotifications();
      markSeen(); // enabled — no reason to nag again
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-brand-soft-2 border border-brand-soft rounded-2xl px-4 py-3 mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 text-[13px] text-ink leading-relaxed">
          {mode === "enable" ? (
            <>רוצה לקבל התראות ישירות לנייד — גם כשהאפליקציה סגורה?</>
          ) : ios ? (
            <>
              כדי לקבל התראות, יש להוסיף את האפליקציה למסך הבית: לחצו על כפתור השיתוף (ריבוע עם חץ
              כלפי מעלה) בתחתית המסך, ואז על <b>״הוסף למסך הבית״</b>. פתחו את האפליקציה משם — ותופיע
              בקשה להפעלת התראות.
            </>
          ) : (
            <>
              כדי לקבל התראות, הוסיפו את האפליקציה למסך הבית: מתפריט הדפדפן בחרו{" "}
              <b>״הוסף למסך הבית״</b> (או ״התקנת אפליקציה״). פתחו אותה משם — ותופיע בקשה להפעלת התראות.
            </>
          )}
        </div>
        <button onClick={markSeen} aria-label="סגירה" className="text-muted text-lg leading-none cursor-pointer shrink-0">
          ×
        </button>
      </div>

      {mode === "enable" && (
        <div className="mt-2.5 flex items-center gap-3 flex-wrap">
          <button
            onClick={enable}
            disabled={loading}
            className="text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-brand text-on-brand cursor-pointer disabled:opacity-50"
          >
            {loading ? "רגע…" : "הפעלת התראות"}
          </button>
          {error && <span className="text-danger text-[12.5px]">{error}</span>}
        </div>
      )}
    </div>
  );
}
