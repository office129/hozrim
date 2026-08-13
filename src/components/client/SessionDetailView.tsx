"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { driveEmbedUrl } from "@/lib/external-links";
import { AudioEmbed, DocEmbed, VideoEmbed } from "@/components/client/MediaEmbed";
import { DocIcon, Waveform } from "@/components/icons";

type SummaryFile = { id: string; url: string; fileName: string };

type SessionData = {
  id: string;
  number: number;
  title: string;
  mediaType: string | null;
  fileUrl: string | null;
  completed: boolean;
  summaryText: string | null;
  summaryFiles: SummaryFile[];
  clientNote: string | null;
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
  const [note, setNote] = useState(session.clientNote || "");
  const [saveIndicator, setSaveIndicator] = useState("");
  const [tipVisible, setTipVisible] = useState(!!showCompleteTip);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The note value the admin was last told about, so leaving the field
  // without any real change doesn't fire a pointless "new message" email.
  const lastNotifiedNote = useRef(session.clientNote || "");

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

  function onNoteChange(value: string) {
    setNote(value);
    setSaveIndicator("שומר…");
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(async () => {
      await apiSend(`/api/client/sessions/${session.id}`, "PATCH", { clientNote: value });
      setSaveIndicator("נשמר");
    }, 600);
  }

  // When the client finishes writing (leaves the field), tell the server
  // to email the admin the finished note - only if it actually changed
  // since the last time we notified.
  async function onNoteBlur() {
    const value = note.trim();
    if (!value || value === lastNotifiedNote.current.trim()) return;
    lastNotifiedNote.current = note;
    if (noteTimer.current) clearTimeout(noteTimer.current);
    await apiSend(`/api/client/sessions/${session.id}`, "PATCH", { clientNote: note, finalizeNote: true });
    setSaveIndicator("נשמר");
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
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          onBlur={onNoteBlur}
          placeholder="מה עולה לך מהפגישה הזו..."
          className="w-full min-h-[100px] p-3.5 rounded-2xl border border-border bg-card text-sm text-ink outline-none resize-y"
        />
        <div className="text-[11px] text-muted-2 mt-1.5">{saveIndicator}</div>
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
    </div>
  );
}
