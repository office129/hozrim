"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/Field";

// Lets the coach set/change/clear a client's personal Google Meet link.
// The client then sees it as an always-available "join your session" button.
export function ClientMeetLinkRow({ clientId, meetLink }: { clientId: string; meetLink: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(value: string) {
    setSaving(true);
    setError("");
    try {
      await apiSend(`/api/admin/clients/${clientId}`, "PATCH", { meetLink: value });
      setEditing(false);
      setUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("להסיר את לינק הפגישה של הלקוח/ה?")) return;
    await save("");
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[13px] text-muted">לינק פגישה (Google Meet):</span>
        {meetLink && !editing && (
          <>
            <a href={meetLink} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-brand break-all">
              {meetLink}
            </a>
            <button onClick={() => setEditing(true)} className="text-[11.5px] text-muted underline cursor-pointer">
              שינוי
            </button>
            <button onClick={remove} className="text-[11.5px] text-danger underline cursor-pointer">
              הסרה
            </button>
          </>
        )}
        {!meetLink && !editing && (
          <button onClick={() => setEditing(true)} className="text-[13px] font-semibold text-brand underline cursor-pointer">
            הוספת לינק פגישה
          </button>
        )}
      </div>
      {editing && (
        <div className="flex items-center gap-2 mt-2">
          <Input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="הדבק/י כאן את לינק ה-Google Meet הקבוע של הלקוח/ה"
            className="flex-1 min-w-0 py-1.5 px-2.5 text-[13px]"
          />
          <button
            onClick={() => url.trim() && save(url.trim())}
            disabled={saving || !url.trim()}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs cursor-pointer disabled:opacity-50"
          >
            {saving ? "שומר…" : "שמירה"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setUrl("");
              setError("");
            }}
            className="shrink-0 px-2.5 py-1.5 rounded-lg border border-border-strong text-muted text-xs cursor-pointer"
          >
            ביטול
          </button>
        </div>
      )}
      {error && <div className="text-danger text-xs mt-1.5">{error}</div>}
    </div>
  );
}
