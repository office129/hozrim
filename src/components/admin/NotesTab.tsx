"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "@/lib/api-client";

type Reply = { id: string; text: string; createdAt: string };
type Note = { id: string; text: string; createdAt: string; replies: Reply[] };
type NoteData = { sessionId: string; number: number; title: string; notes: Note[] };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function NotesTab({ clientId, notes }: { clientId: string; notes: NoteData[] }) {
  if (notes.length === 0) {
    return <div className="text-center py-9 text-muted text-[13.5px]">הלקוח/ה עדיין לא כתב/ה הערות</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((n) => (
        <div key={n.sessionId} className="bg-card border border-border rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-6 h-6 rounded-lg bg-brand-soft flex items-center justify-center text-[11.5px] font-bold text-brand shrink-0">
              {n.number}
            </div>
            <div className="text-[13px] font-semibold text-brand">{n.title}</div>
          </div>
          <div className="flex flex-col gap-2.5">
            {n.notes.map((note) => (
              <ClientNoteRow key={note.id} clientId={clientId} sessionId={n.sessionId} note={note} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientNoteRow({ clientId, sessionId, note }: { clientId: string; sessionId: string; note: Note }) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function sendReply() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      await apiSend(`/api/admin/clients/${clientId}/sessions/${sessionId}/notes`, "POST", { text, parentId: note.id });
      setDraft("");
      setReplying(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השליחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  async function deleteReply(replyId: string) {
    if (!confirm("למחוק את התגובה?")) return;
    await apiSend(`/api/admin/clients/${clientId}/sessions/${sessionId}/notes`, "DELETE", { noteId: replyId });
    router.refresh();
  }

  return (
    <div className="bg-tile rounded-xl px-3 py-2.5">
      <div className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">{note.text}</div>
      <div className="text-[11px] text-muted-2 mt-1.5">{formatDate(note.createdAt)}</div>

      {note.replies.map((r) => (
        <div key={r.id} className="mt-2.5 ps-3 border-r-2 border-brand-soft bg-card rounded-l-lg rounded-r-sm px-3 py-2">
          <div className="text-[11.5px] font-semibold text-brand mb-0.5">התגובה שלך</div>
          <div className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">{r.text}</div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-muted-2">{formatDate(r.createdAt)}</span>
            <button onClick={() => deleteReply(r.id)} className="text-[11px] text-danger underline cursor-pointer">
              מחיקה
            </button>
          </div>
        </div>
      ))}

      {replying ? (
        <div className="mt-2.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="כתוב/י תגובה ללקוח/ה…"
            className="w-full min-h-[70px] p-3 rounded-xl border border-border-strong bg-white/70 text-[13px] text-ink outline-none resize-y focus:border-brand"
          />
          <div className="flex items-center justify-between mt-2">
            {error ? <span className="text-danger text-[12px]">{error}</span> : <span />}
            <div className="flex gap-2">
              <button
                onClick={() => { setReplying(false); setDraft(""); setError(""); }}
                className="text-[12.5px] text-muted px-3 py-1.5 rounded-lg border border-border-strong cursor-pointer"
              >
                ביטול
              </button>
              <button
                onClick={sendReply}
                disabled={sending || !draft.trim()}
                className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg bg-brand text-on-brand cursor-pointer disabled:opacity-40"
              >
                {sending ? "שולח…" : "שליחת תגובה"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setReplying(true)} className="mt-2 text-[12px] font-semibold text-brand cursor-pointer">
          + תגובה
        </button>
      )}
    </div>
  );
}
