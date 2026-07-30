"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/Field";

export function ClientDriveFolderRow({
  clientId,
  driveFolderId,
}: {
  clientId: string;
  driveFolderId: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!url.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiSend(`/api/admin/clients/${clientId}`, "PATCH", { driveFolderUrl: url.trim() });
      setEditing(false);
      setUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] text-muted">תיקיית דרייב:</span>
        {driveFolderId && !editing && (
          <>
            <a
              href={`https://drive.google.com/drive/folders/${driveFolderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-semibold text-brand"
            >
              פתיחת התיקייה
            </a>
            <button onClick={() => setEditing(true)} className="text-[11.5px] text-muted underline cursor-pointer">
              שינוי
            </button>
          </>
        )}
        {!driveFolderId && !editing && (
          <button onClick={() => setEditing(true)} className="text-[13px] font-semibold text-brand underline cursor-pointer">
            קישור לתיקייה קיימת
          </button>
        )}
      </div>
      {editing && (
        <div className="flex items-center gap-2 mt-2">
          <Input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="הדבק/י כאן קישור לתיקיית הלקוח בדרייב"
            className="flex-1 min-w-0 py-1.5 px-2.5 text-[13px]"
          />
          <button
            onClick={save}
            disabled={saving}
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
