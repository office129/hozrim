"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "@/lib/api-client";

// Two-button control for pulling the channel's reels/shorts straight from
// YouTube into the "סרטונים קצרים" library folder.
export function YouTubeShortsSync() {
  const router = useRouter();
  const [loading, setLoading] = useState<null | "all" | "new">(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function pull(mode: "all" | "new") {
    setLoading(mode);
    setMsg("");
    setError("");
    try {
      const data = await apiSend("/api/admin/library/youtube-shorts", "POST", { mode });
      setMsg(
        data.added > 0
          ? `נוספו ${data.added} סרטונים (סה"כ ${data.total})`
          : "אין סרטונים חדשים — הכל מעודכן"
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "המשיכה נכשלה");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3.5 mb-5">
      <div className="text-[13px] font-semibold text-ink mb-1">סרטונים קצרים מיוטיוב</div>
      <div className="text-[12.5px] text-muted mb-3 leading-relaxed">
        משיכת רילסים ישירות מערוץ היוטיוב לתיקיית &quot;סרטונים קצרים&quot;. בפעם הראשונה — &quot;משוך הכל&quot;;
        אחר כך &quot;סרטונים חדשים&quot; כדי להוסיף רק מה שעלה מאז (בלי כפילויות).
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => pull("all")}
          disabled={loading !== null}
          className="px-3.5 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer disabled:opacity-50"
        >
          {loading === "all" ? "מושך…" : "משוך הכל מיוטיוב"}
        </button>
        <button
          onClick={() => pull("new")}
          disabled={loading !== null}
          className="px-3.5 py-1.5 rounded-lg border border-brand text-brand text-xs font-semibold cursor-pointer disabled:opacity-50"
        >
          {loading === "new" ? "בודק…" : "משוך סרטונים חדשים"}
        </button>
      </div>
      {msg && <div className="text-[12.5px] text-brand mt-2">{msg}</div>}
      {error && <div className="text-danger text-[12.5px] mt-2">{error}</div>}
    </div>
  );
}
