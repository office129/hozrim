"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { driveEmbedUrl } from "@/lib/external-links";
import { AudioEmbed, DocEmbed, VideoEmbed } from "@/components/client/MediaEmbed";
import { DocIcon, Waveform } from "@/components/icons";

type SessionData = {
  id: string;
  number: number;
  title: string;
  date: string;
  mediaType: string | null;
  fileUrl: string | null;
  completed: boolean;
  summaryText: string | null;
  summaryFileUrl: string | null;
  summaryFileName: string | null;
  clientNote: string | null;
};

export function SessionDetailView({ session }: { session: SessionData }) {
  const router = useRouter();
  const [completed, setCompleted] = useState(session.completed);
  const [note, setNote] = useState(session.clientNote || "");
  const [saveIndicator, setSaveIndicator] = useState("");
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const date = new Date(session.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  const driveEmbed = session.fileUrl ? driveEmbedUrl(session.fileUrl) : null;
  const summaryIsDrive = session.summaryFileUrl ? !!driveEmbedUrl(session.summaryFileUrl) : false;

  async function toggleComplete() {
    const next = !completed;
    setCompleted(next);
    await apiSend(`/api/client/sessions/${session.id}`, "PATCH", { completed: next });
    router.refresh();
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

  const hasSummaryText = !!(session.summaryText && session.summaryText.trim());
  const hasSummaryFile = !!session.summaryFileUrl;

  return (
    <div className="p-6 md:p-0 pb-8 animate-fade-up md:max-w-2xl">
      <Link href="/app/recordings" className="text-brand text-sm inline-block mb-3.5">
        › חזרה לרשימה
      </Link>

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

      <div className="font-heading font-bold text-[19px] text-ink mt-4">{session.title}</div>
      <div className="text-[13px] text-muted mt-0.5">{date}</div>

      <button
        onClick={toggleComplete}
        className="w-full mt-5 py-3.5 rounded-2xl border border-brand text-sm font-semibold cursor-pointer transition"
        style={{
          background: completed ? "var(--color-brand)" : "transparent",
          color: completed ? "var(--color-on-brand)" : "var(--color-brand)",
        }}
      >
        {completed ? "✓ סומן כהושלם" : "סמן פגישה כהושלמה"}
      </button>

      <div className="mt-6 bg-brand-soft-2 border border-brand-soft rounded-2xl p-4">
        <div className="text-sm font-semibold text-brand-dark mb-2">סיכום הפגישה</div>
        {hasSummaryText && (
          <div className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">{session.summaryText}</div>
        )}
        {hasSummaryFile && (
          <div style={{ marginTop: hasSummaryText ? 10 : 0 }}>
            <div className="flex items-center gap-2.5 bg-white/60 rounded-[10px] px-3 py-2.5">
              <DocIcon />
              <div className="flex-1 text-[13px] text-ink truncate">{session.summaryFileName}</div>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href={session.summaryFileUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12.5px] font-semibold text-brand"
                >
                  פתיחה בחלון חדש
                </a>
                {!summaryIsDrive && (
                  <a href={session.summaryFileUrl!} download className="text-[12.5px] font-semibold text-brand">
                    הורדה
                  </a>
                )}
              </div>
            </div>
            <DocEmbed url={session.summaryFileUrl!} className="w-full rounded-[10px] mt-2" />
          </div>
        )}
        {!hasSummaryText && !hasSummaryFile && (
          <div className="text-[13.5px] text-[oklch(0.4_0.03_150)]">עדיין אין סיכום לפגישה הזו</div>
        )}
      </div>

      <div className="mt-6">
        <div className="text-[13px] text-muted mb-2">הערות ליוסף</div>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="מה עולה לך מהפגישה הזו..."
          className="w-full min-h-[100px] p-3.5 rounded-2xl border border-border bg-card text-sm text-ink outline-none resize-y"
        />
        <div className="text-[11px] text-muted-2 mt-1.5">{saveIndicator}</div>
      </div>
    </div>
  );
}
