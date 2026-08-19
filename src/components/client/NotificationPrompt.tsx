"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiSend } from "@/lib/api-client";
import { isPushSupported, getExistingPushSubscription, enablePushNotifications } from "@/lib/push-client";

// A prominent, one-tap notification opt-in shown right after the welcome
// popup on a client's first open. Self-gating: it only actually renders
// inside the installed app, where push works and isn't already on — in a
// browser (or if already enabled) it closes itself immediately, and the
// smaller PushHintBanner handles the "add to home screen" nudge instead.
// The permission prompt is tied to the button tap on purpose (iOS requires
// a gesture, and a reflexive "no" on an auto-popped prompt blocks it for
// good).

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function NotificationPrompt({ onClose }: { onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isStandalone() || !isPushSupported()) {
        onClose();
        return;
      }
      const sub = await getExistingPushSubscription().catch(() => null);
      if (cancelled) return;
      if (sub) onClose(); // already enabled — nothing to ask
      else setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // onClose is stable enough for this one-shot mount check
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;

  async function enable() {
    setError("");
    setLoading(true);
    try {
      await enablePushNotifications();
      // Enabled — also silence the smaller banner so it won't ask again.
      apiSend("/api/client/me", "PATCH", { pushHintSeen: true });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-5" dir="rtl">
      <div className="bg-card rounded-[22px] w-full max-w-[340px] p-6 text-center shadow-2xl animate-fade-up">
        <div className="w-14 h-14 rounded-full mx-auto mb-3.5 bg-brand-soft flex items-center justify-center text-[26px]">
          🔔
        </div>
        <div className="text-[16.5px] font-heading font-bold text-brand mb-2.5 text-balance">
          שלא תפספס/י כלום
        </div>
        <div className="text-[13px] text-ink leading-relaxed mb-1">
          נשלח לך התראה עדינה לנייד בכל פעם שיוסף מעלה לך מפגש, הקלטה או תרגול חדש — גם כשהאפליקציה
          סגורה.
        </div>

        <Button className="mt-5 w-full" onClick={enable} disabled={loading}>
          {loading ? "רגע…" : "כן, אשמח לקבל התראות"}
        </Button>
        <button
          onClick={onClose}
          disabled={loading}
          className="mt-3 text-[13px] text-muted cursor-pointer disabled:opacity-50"
        >
          אולי מאוחר יותר
        </button>

        {error && <div className="mt-3 text-danger text-[12.5px]">{error}</div>}
      </div>
    </div>
  );
}
