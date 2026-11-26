"use client";

import { useEffect, useState } from "react";
import { apiSend, ApiError } from "@/lib/api-client";

type Status = {
  configured: boolean;
  importEnabled: boolean;
  env: Record<string, boolean>;
  totals: {
    videosInApp: number;
    audiosInApp: number;
    ready: number;
    pending: number;
    failed: number;
    notYetSent: number;
    bunnyStorageGB: number;
    sourceGB: number;
    collections: number;
  };
  problems: { sourceKey: string; title: string; error: string | null; failed: boolean }[];
  pendingList: { title: string; status: number | null }[];
};

// Admin control for the Bunny Stream move: shows how many videos already
// play from Bunny, runs the migration step on demand (it also runs by
// itself every hour), and the one-time setup actions.
export function BunnyMediaCard() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    if (action !== "status") setMsg("");
    try {
      const data = await apiSend("/api/admin/bunny", "POST", { action, ...extra });
      if (action === "status") setSt(data);
      if (action === "sync") {
        setSt(data.status);
        setMsg(`נשלחו עכשיו ${data.imported.length}, מוכנים חדשים ${data.ready.length}, נשארו לשליחה ${data.remaining}${data.errors.length ? ` · שגיאות: ${data.errors.length}` : ""}`);
      }
      if (action === "inventory") {
        setMsg(`וידאו: ${data.video.files} קבצים (${data.video.GB}GB), מתוכם ב-Bunny ${data.videoOnBunny.files} (${data.videoOnBunny.GB}GB) · אודיו: ${data.audio.files} קבצים (${data.audio.GB}GB) — נשאר במקור`);
      }
      if (action === "copy-settings") {
        setMsg(data.identical ? "ההגדרות שקובעות מחיר זהות עכשיו לספריית האתר ✓" : `נשארו הבדלים: ${data.diffs.map((d: { key: string }) => d.key).join(", ")}`);
      }
      if (action === "secure") {
        setMsg(`אימות טוקן: ${data.tokenAuthOn ? "פעיל ✓" : "כבוי ✗"} · דומיינים מורשים: ${(data.allowedReferrers || []).join(", ")} · מפתח הטוקן ב-Vercel ${data.tokenKeyMatchesEnv ? "תואם ✓" : "לא תואם ✗"}`);
      }
      if (action === "retry") await run("status");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "הפעולה נכשלה");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void run("status");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = st?.totals;
  const btn = "px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50";

  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3.5 mb-5">
      <div className="text-[13px] font-semibold text-ink mb-1">צפייה דרך Bunny (במקום תעבורה דרך Vercel)</div>
      <div className="text-[12.5px] text-muted mb-3 leading-relaxed">
        הסרטונים מועתקים לספריית &quot;אפליקציית הליווי&quot; ב-Bunny (תיקייה לכל לקוח) ומנוגנים משם בקישור חתום וקצר-מועד.
        המקור בדרייב לא נמחק, ואם Bunny לא עונה — הנגן חוזר אליו לבד. סרטונים חדשים נשלחים אוטומטית כל שעה.
      </div>

      {st && !st.configured && (
        <div className="text-[12.5px] text-danger mb-3 leading-relaxed">
          Bunny עדיין לא פעיל — חסרים ב-Vercel:{" "}
          {["BUNNY_LIBRARY_ID", "BUNNY_API_KEY", "BUNNY_CDN_HOST", "BUNNY_TOKEN_KEY"].filter((k) => !st.env[k]).join(", ")}
          . עד אז הכל ממשיך לנגן כרגיל מהמקור.
        </div>
      )}

      {st?.configured && !st.importEnabled && (
        <div className="text-[12.5px] text-danger mb-3 leading-relaxed">
          השליחה ל-Bunny כבויה. לא נשלח שום קובץ עד שמוסיפים ב-Vercel את BUNNY_IMPORT_ENABLED=1 — רק אחרי שהספרייה מוגדרת בדיוק כמו של האתר.
        </div>
      )}

      {t && st?.configured && (
        <div className="text-[12.5px] text-ink mb-3 leading-relaxed">
          {t.ready} מתוך {t.videosInApp} סרטונים מנוגנים מ-Bunny · בעיבוד {t.pending} · טרם נשלחו {t.notYetSent}
          {t.failed ? ` · נכשלו ${t.failed}` : ""} · נפח ב-Bunny {t.bunnyStorageGB}GB · {t.collections} תיקיות
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => run("sync")} disabled={!!busy || !st?.importEnabled} className={`${btn} bg-brand text-on-brand`}>
          {busy === "sync" ? "מעביר…" : "העבר עכשיו"}
        </button>
        <button onClick={() => run("status")} disabled={!!busy} className={`${btn} border border-brand text-brand`}>
          {busy === "status" ? "בודק…" : "רענן מצב"}
        </button>
        <button onClick={() => run("inventory")} disabled={!!busy || !st?.configured} className={`${btn} border border-border text-muted`}>
          {busy === "inventory" ? "סופר…" : "נפחים"}
        </button>
        {st?.env.BUNNY_ACCOUNT_KEY && (
          <>
            <button onClick={() => run("copy-settings")} disabled={!!busy} className={`${btn} border border-border text-muted`}>
              {busy === "copy-settings" ? "מעתיק…" : "השווה הגדרות לאתר"}
            </button>
            <button onClick={() => run("secure")} disabled={!!busy} className={`${btn} border border-border text-muted`}>
              {busy === "secure" ? "נועל…" : "נעילת אבטחה"}
            </button>
          </>
        )}
      </div>

      {msg && <div className="text-[12.5px] text-brand mt-2 leading-relaxed">{msg}</div>}
      {error && <div className="text-danger text-[12.5px] mt-2">{error}</div>}

      {!!st?.problems.length && (
        <div className="mt-3 text-[12px] text-muted space-y-1">
          {st.problems.map((p) => (
            <div key={p.sourceKey} className="flex items-center gap-2">
              <span className="truncate">{p.title} — {p.error}</span>
              {p.failed && (
                <button onClick={() => run("retry", { sourceKey: p.sourceKey })} disabled={!!busy} className="text-brand underline cursor-pointer shrink-0">
                  נסה שוב
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
