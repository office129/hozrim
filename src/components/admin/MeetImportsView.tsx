"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "@/lib/api-client";

type Import = {
  id: string;
  fileName: string;
  recordingDate: Date | null;
  status: string;
  matchedNames: string | null;
  clientId: string | null;
};

type ClientOption = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  ambiguous: "כמה התאמות אפשריות",
  unmatched: "לא נמצאה התאמה",
  no_folder: "נמצאה התאמה, אך ללא תיקיית דרייב",
};

export function MeetImportsView({ imports, clients }: { imports: Import[]; clients: ClientOption[] }) {
  return (
    <div className="animate-fade-up">
      <div className="font-heading font-bold text-2xl text-ink mb-1.5">הקלטות לשיוך</div>
      <div className="text-[13px] text-muted mb-5">
        הקלטות Meet שהמערכת לא הצליחה לשייך אוטומטית ללקוח/ה — לפי שם שמופיע (או לא מופיע בבירור) בשם ההקלטה.
      </div>

      {imports.length === 0 && (
        <div className="text-center py-16 text-muted text-sm">אין כרגע הקלטות שממתינות לשיוך</div>
      )}

      <div className="flex flex-col gap-2.5">
        {imports.map((item) => (
          <ImportRow key={item.id} item={item} clients={clients} />
        ))}
      </div>
    </div>
  );
}

function ImportRow({ item, clients }: { item: Import; clients: ClientOption[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(item.clientId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const date = item.recordingDate ? new Date(item.recordingDate).toLocaleDateString("he-IL") : "";

  async function resolve() {
    if (!clientId) return;
    setSaving(true);
    setError("");
    try {
      await apiSend(`/api/admin/meet-imports/${item.id}/resolve`, "POST", { clientId });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השיוך נכשל");
    } finally {
      setSaving(false);
    }
  }

  async function ignore() {
    if (!confirm("להתעלם מההקלטה הזו? היא לא תופיע יותר ברשימה.")) return;
    setSaving(true);
    setError("");
    try {
      await apiSend(`/api/admin/meet-imports/${item.id}/ignore`, "POST");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "הפעולה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate">{item.fileName}</div>
          <div className="text-xs text-muted mt-0.5">
            {date && `${date} · `}
            {STATUS_LABEL[item.status] || item.status}
            {item.matchedNames && ` (${item.matchedNames})`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="text-[13px] border border-border-strong rounded-lg px-2.5 py-1.5 bg-card text-ink"
        >
          <option value="">בחר/י לקוח/ה…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={resolve}
          disabled={saving || !clientId}
          className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs cursor-pointer disabled:opacity-50"
        >
          {saving ? "משייך…" : "שיוך"}
        </button>
        <button
          onClick={ignore}
          disabled={saving}
          className="px-2.5 py-1.5 rounded-lg border border-border-strong text-muted text-xs cursor-pointer disabled:opacity-50"
        >
          התעלמות
        </button>
      </div>
      {error && <div className="text-danger text-xs">{error}</div>}
    </div>
  );
}
