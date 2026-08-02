"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { tryUploadPersonalFileToDrive } from "@/lib/personal-upload-client";

type Entry = { id: string; text: string; date: string };
type Upload = { id: string; url: string; fileName: string; mediaType: string; date: string };

const MEDIA_LABELS: Record<string, string> = { video: "וידאו", audio: "אודיו", document: "מסמך" };

export function JournalView({ entries, uploads }: { entries: Entry[]; uploads: Upload[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setLoading(true);
    try {
      await apiSend("/api/client/journal", "POST", { text });
      setDraft("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await apiSend(`/api/client/journal/${id}`, "DELETE");
    router.refresh();
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    try {
      const mediaType = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
      const viaDrive = await tryUploadPersonalFileToDrive(file, setUploadProgress);
      if (viaDrive) {
        await apiSend("/api/client/uploads", "PATCH", { ...viaDrive, mediaType });
      } else {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/client/uploads", { method: "POST", credentials: "include", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "ההעלאה נכשלה");
        }
      }
      router.refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
    }
  }

  async function removeUpload(id: string) {
    await apiSend(`/api/client/uploads/${id}`, "DELETE");
    router.refresh();
  }

  return (
    <div>
      <div className="bg-card border border-border rounded-2xl p-3.5 mb-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="מה עולה לך היום..."
          className="min-h-[90px] border-none p-0 focus:border-none"
        />
        <Button className="mt-2" onClick={add} disabled={loading}>
          הוספה ליומן
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-9 text-muted">
          <div className="w-[52px] h-[52px] rounded-full bg-brand-soft-2 mx-auto mb-3.5" />
          <div className="text-sm">עדיין אין רשומות ביומן</div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <div key={entry.id} className="bg-card border border-border rounded-2xl p-3.5">
            <div className="flex justify-between items-baseline mb-2">
              <div className="text-xs font-semibold text-brand">{entry.date}</div>
              <button onClick={() => remove(entry.id)} className="text-xs text-danger cursor-pointer">
                מחיקה
              </button>
            </div>
            <div className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">{entry.text}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-5 border-t border-border">
        <div className="font-heading font-semibold text-base text-ink mb-1">ההעלאות שלי</div>
        <div className="text-[13px] text-muted mb-3.5">מקום פרטי להעלות לעצמך מסמכים, וידאו או אודיו לשימוש אישי</div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,application/pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) uploadFile(file);
          }}
        />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? `מעלה… ${uploadProgress}%` : "העלאת קובץ"}
        </Button>
        {uploadError && <div className="text-danger text-xs mt-1.5">{uploadError}</div>}

        {uploads.length > 0 && (
          <div className="flex flex-col gap-2.5 mt-3.5">
            {uploads.map((upload) => (
              <div key={upload.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink truncate">{upload.fileName}</div>
                  <div className="text-[11.5px] text-muted mt-0.5">
                    {MEDIA_LABELS[upload.mediaType] || upload.mediaType} · {upload.date}
                  </div>
                </div>
                <a
                  href={upload.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12.5px] text-brand underline shrink-0"
                >
                  פתיחה
                </a>
                <button onClick={() => removeUpload(upload.id)} className="text-xs text-danger cursor-pointer shrink-0">
                  מחיקה
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
