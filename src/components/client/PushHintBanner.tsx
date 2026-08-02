"use client";

import Link from "next/link";
import { useState } from "react";
import { apiSend } from "@/lib/api-client";

// A one-time, easy-to-dismiss nudge toward the push-notification toggle
// in the personal area - not an actual permission prompt (browsers punish
// those when they're not tied to a deliberate click), just a pointer so
// the client doesn't miss that the option exists.
export function PushHintBanner({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(show);
  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    apiSend("/api/client/me", "PATCH", { pushHintSeen: true });
  }

  return (
    <div className="bg-brand-soft-2 border border-brand-soft rounded-2xl px-4 py-3 flex items-center gap-3 mb-4">
      <div className="flex-1 text-[13px] text-ink leading-relaxed">
        רוצה לקבל התראה גם כשהאפליקציה סגורה? אפשר להפעיל את זה ב
        <Link href="/app/profile" onClick={dismiss} className="text-brand font-semibold underline">
          {" "}
          האיזור האישי
        </Link>
        .
      </div>
      <button onClick={dismiss} aria-label="סגירה" className="text-muted text-lg leading-none cursor-pointer shrink-0">
        ×
      </button>
    </div>
  );
}
