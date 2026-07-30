"use client";

import { useState } from "react";
import { apiSend, ApiError } from "@/lib/api-client";

export function BroadcastNotificationCard() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function send() {
    if (!message.trim()) return;
    if (!confirm("לשלוח את ההתראה הזו לכל הלקוחות?")) return;
    setSending(true);
    setError("");
    setResult("");
    try {
      const res = await apiSend("/api/admin/notifications/broadcast", "POST", { message: message.trim() });
      setResult(`ההתראה נשלחה ל-${res.count} לקוחות`);
      setMessage("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השליחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-6 bg-card border border-border rounded-2xl px-4 py-3.5 flex flex-col gap-2.5">
      <div>
        <div className="text-sm font-semibold text-ink">שליחת התראה לכל הלקוחות</div>
        <div className="text-xs text-muted mt-0.5">
          ההודעה תופיע בפעמון ההתראות באפליקציה של כל הלקוחות הרשומים כרגע.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="לדוגמה: תזכורת - מחר בערב סגירה מוקדמת של המשרד"
          className="flex-1 min-w-0 py-2 px-2.5 text-[13px] rounded-lg border border-border-strong bg-cream resize-none"
        />
        <button
          onClick={send}
          disabled={sending || !message.trim()}
          className="shrink-0 px-3.5 py-2 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer disabled:opacity-50"
        >
          {sending ? "שולח…" : "שליחה"}
        </button>
      </div>
      {result && <div className="text-[12.5px] text-ink">{result}</div>}
      {error && <div className="text-danger text-xs">{error}</div>}
    </div>
  );
}
