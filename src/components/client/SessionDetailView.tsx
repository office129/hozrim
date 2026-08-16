"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "@/lib/api-client";
import { driveEmbedUrl } from "@/lib/external-links";
import { AudioEmbed, DocEmbed, VideoEmbed } from "@/components/client/MediaEmbed";
import { DocIcon, Waveform } from "@/components/icons";

type SummaryFile = { id: string; url: string; fileName: string };
type Reply = { id: string; text: string; createdAt: string; author: string };
type Note = { id: string; text: string; createdAt: string; replies: Reply[] };

type SessionData = {
  id: string;
  number: number;
  title: string;
  mediaType: string | null;
  fileUrl: string | null;
  completed: boolean;
  summaryText: string | null;
  summaryFiles: SummaryFile[];
  notes: Note[];
};

export function SessionDetailView({
  session,
  showCompleteTip,
}: {
  session: SessionData;
  showCompleteTip?: boolean;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(session.completed);
  const [notes, setNotes] = useState<Note[]>(session.notes);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [tipVisible, setTipVisible] = useState(!!showCompleteTip);
  // Which thread the client is replying to, the reply text, and which
  // thread is showing the "this is a reply, not a new note" confirmation.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [confirmThread, setConfirmThread] = useState<string | null>(null);

  const driveEmbed = session.fileUrl ? driveEmbedUrl(session.fileUrl) : null;

  async function toggleComplete() {
    const next = !completed;
    setCompleted(next);
    await apiSend(`/api/client/sessions/${session.id}`, "PATCH", { completed: next });
    router.refresh();
  }

  function dismissTip() {
    setTipVisible(false);
    apiSend("/api/client/me", "PATCH", { sessionCompleteTipSeen: true });
  }

  async function sendNote() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setNoteError("");
    try {
      const { note } = await apiSend(`/api/client/sessions/${session.id}/notes`, "POST", { text });
      setNotes((prev) => [...prev, { ...note, replies: [] }]);
      setDraft("");
    } catch (err) {
      setNoteError(err instanceof ApiError ? err.message : "השליחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  async function deleteNote(noteId: string) {
    if (!confirm("למחוק את ההערה?")) return;
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    await apiSend(`/api/client/sessions/${session.id}/notes`, "DELETE", { noteId }).catch(() => router.refresh());
  }

  // The client confirmed (via the small popup) that they want to reply
  // within a thread rather than start a new note.
  function openReply(threadId: string) {
    setConfirmThread(null);
    setReplyingTo(threadId);
    setReplyDraft("");
  }

  async function sendReply(threadId: string) {
    const text = replyDraft.trim();
    if (!text || replySending) return;
    setReplySending(true);
    setNoteError("");
    try {
      const { note } = await apiSend(`/api/client/sessions/${session.id}/notes`, "POST", { text, parentId: threadId });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === threadId
            ? { ...n, replies: [...n.replies, { id: note.id, text: note.text, createdAt: note.createdAt, author: "client" }] }
            : n
        )
      );
      setReplyingTo(null);
      setReplyDraft("");
    } catch (err) {
      setNoteError(err instanceof ApiError ? err.message : "השליחה נכשלה");
    } finally {
      setReplySending(false);
    }
  }

  async function deleteReply(threadId: string, replyId: string) {
    if (!confirm("למחוק את התגובה?")) return;
    setNotes((prev) =>
      prev.map((n) => (n.id === threadId ? { ...n, replies: n.replies.filter((r) => r.id !== replyId) } : n))
    );
    await apiSend(`/api/client/sessions/${session.id}/notes`, "DELETE", { noteId: replyId }).catch(() => router.refresh());
  }

  const hasSummaryText = !!(session.summaryText && session.summaryText.trim());
  const hasSummaryFiles = session.summaryFiles.length > 0;

  return (
    <div className="p-6 md:p-0 pb-8 animate-fade-up md:max-w-2xl">
      <Link href="/app/recordings" className="text-brand text-sm inline-block mb-3.5">
        › חזרה לרשימה
      </Link>

      <div className="font-heading font-bold text-[19px] text-ink mb-3.5">{session.title}</div>

      {!session.fileUrl && (
        <div
          className="w-full rounded-[18px] bg-black flex items-center justify-center text-on-brand/60 text-sm"
          style={{ aspectRatio: "16/9" }}
        >
          טרם הועלתה הקלטה לפגישה זו
        </div>
      )}

      {session.fileUrl && session.mediaType === "video" && (
        <VideoEmbed url={session.fileUrl} className="w-full rounded-[18px] bg-black" />
      )}

      {session.fileUrl &&
        session.mediaType === "audio" &&
        (driveEmbed ? (
          <div className="rounded-[18px] overflow-hidden">
            <AudioEmbed url={session.fileUrl} className="w-full block" />
          </div>
        ) : (
          <div className="bg-tile rounded-[18px] p-3.5 flex items-center gap-3">
            <Waveform />
            <AudioEmbed url={session.fileUrl} className="flex-1 w-full h-9" />
          </div>
        ))}

      {tipVisible && (
        <div className="mt-3 bg-brand-soft-2 border border-brand-soft rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 animate-fade-up">
          <div className="flex-1 text-[12.5px] text-brand-dark leading-relaxed">
            אחרי צפייה בהקלטה ובסיכום, אפשר לסמן את הפגישה כהושלמה בתחתית העמוד.
          </div>
          <button onClick={dismissTip} className="text-[12px] font-semibold text-brand cursor-pointer shrink-0">
            הבנתי
          </button>
        </div>
      )}

      <div className="mt-6 bg-brand-soft-2 border border-brand-soft rounded-2xl p-4">
        <div className="text-sm font-semibold text-brand-dark mb-2">סיכום הפגישה</div>
        {hasSummaryText && (
          <div className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">{session.summaryText}</div>
        )}
        {hasSummaryFiles && (
          <div className="flex flex-col gap-3" style={{ marginTop: hasSummaryText ? 12 : 0 }}>
            {session.summaryFiles.map((f) => {
              const isDrive = !!driveEmbedUrl(f.url);
              return (
                <div key={f.id}>
                  <div className="flex items-center gap-2.5 bg-white/60 rounded-[10px] px-3 py-2.5">
                    <DocIcon />
                    <div className="flex-1 text-[13px] text-ink truncate">{f.fileName}</div>
                    <div className="flex items-center gap-3 shrink-0">
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12.5px] font-semibold text-brand"
                      >
                        פתיחה בחלון חדש
                      </a>
                      {!isDrive && (
                        <a href={f.url} download className="text-[12.5px] font-semibold text-brand">
                          הורדה
                        </a>
                      )}
                    </div>
                  </div>
                  <DocEmbed url={f.url} className="w-full rounded-[10px] mt-2" />
                </div>
              );
            })}
          </div>
        )}
        {!hasSummaryText && !hasSummaryFiles && (
          <div className="text-[13.5px] text-[oklch(0.4_0.03_150)]">עדיין אין סיכום לפגישה הזו</div>
        )}
      </div>

      <div className="mt-6">
        <div className="text-[13px] text-muted mb-2">הערות ליוסף</div>

        {notes.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {notes.map((n) => (
              <div key={n.id} className="bg-tile rounded-2xl px-3.5 py-3">
                <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{n.text}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-muted-2">
                    {new Date(n.createdAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                  <button onClick={() => deleteNote(n.id)} className="text-[11px] text-danger underline cursor-pointer">
                    מחיקה
                  </button>
                </div>
                {n.replies.map((r) => {
                  const fromCoach = r.author === "admin";
                  return (
                    <div
                      key={r.id}
                      className={`mt-2.5 mr-3 ps-3 border-r-2 px-3 py-2.5 rounded-l-xl rounded-r-sm ${
                        fromCoach ? "border-brand-soft bg-brand-soft-2" : "border-border-strong bg-card"
                      }`}
                    >
                      <div className={`text-[12px] font-semibold mb-0.5 ${fromCoach ? "text-brand" : "text-muted"}`}>
                        {fromCoach ? "יוסף" : "את/ה"}
                      </div>
                      <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{r.text}</div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[11px] text-muted-2">
                          {new Date(r.createdAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </span>
                        {!fromCoach && (
                          <button onClick={() => deleteReply(n.id, r.id)} className="text-[11px] text-danger underline cursor-pointer">
                            מחיקה
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {replyingTo === n.id ? (
                  <div className="mt-2.5">
                    <textarea
                      autoFocus
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder="התגובה שלך לשרשור…"
                      className="w-full min-h-[70px] p-3 rounded-xl border border-border-strong bg-card text-sm text-ink outline-none resize-y"
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <button
                        onClick={() => { setReplyingTo(null); setReplyDraft(""); }}
                        className="text-[12.5px] text-muted px-3 py-1.5 rounded-lg border border-border-strong cursor-pointer"
                      >
                        ביטול
                      </button>
                      <button
                        onClick={() => sendReply(n.id)}
                        disabled={replySending || !replyDraft.trim()}
                        className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg bg-brand text-on-brand cursor-pointer disabled:opacity-40"
                      >
                        {replySending ? "שולח…" : "שליחת תגובה"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConfirmThread(n.id)} className="mt-2 text-[12px] font-semibold text-brand cursor-pointer">
                    + תגובה לשרשור
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="מה עולה לך מהפגישה הזו..."
          className="w-full min-h-[90px] p-3.5 rounded-2xl border border-border bg-card text-sm text-ink outline-none resize-y"
        />
        <div className="flex items-center justify-between mt-2">
          {noteError ? <span className="text-danger text-[12px]">{noteError}</span> : <span />}
          <button
            onClick={sendNote}
            disabled={sending || !draft.trim()}
            className="text-[13px] font-semibold px-4 py-2 rounded-xl bg-brand text-on-brand cursor-pointer disabled:opacity-40"
          >
            {sending ? "שולח…" : "שליחה ליוסף"}
          </button>
        </div>
      </div>

      <button
        onClick={toggleComplete}
        className="w-full mt-6 py-3.5 rounded-2xl border border-brand text-sm font-semibold cursor-pointer transition"
        style={{
          background: completed ? "var(--color-brand)" : "transparent",
          color: completed ? "var(--color-on-brand)" : "var(--color-brand)",
        }}
      >
        {completed ? "✓ סומן כהושלם" : "סמן פגישה כהושלמה"}
      </button>

      {confirmThread && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmThread(null)}>
          <div className="w-full max-w-[340px] bg-card rounded-2xl p-5 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold text-ink mb-2">תגובה לשרשור</div>
            <div className="text-[13.5px] text-muted leading-relaxed mb-5">
              ההודעה הזו תתווסף כתגובה לשרשור הקיים — ולא כהערה חדשה. אם רצית לכתוב משהו חדש, סגור/י כאן והשתמש/י בתיבה שבתחתית.
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setConfirmThread(null)}
                className="flex-1 py-2.5 rounded-xl border border-border-strong text-[13px] text-muted cursor-pointer"
              >
                ביטול
              </button>
              <button
                onClick={() => openReply(confirmThread)}
                className="flex-1 py-2.5 rounded-xl bg-brand text-on-brand text-[13px] font-semibold cursor-pointer"
              >
                המשך לתגובה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
