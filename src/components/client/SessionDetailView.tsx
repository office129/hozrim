"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { driveEmbedUrl } from "@/lib/external-links";
import { DocIcon, PauseBars, PlayTriangle, Waveform } from "@/components/icons";

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

function fmt(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SessionDetailView({ session }: { session: SessionData }) {
  const router = useRouter();
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [completed, setCompleted] = useState(session.completed);
  const [note, setNote] = useState(session.clientNote || "");
  const [saveIndicator, setSaveIndicator] = useState("");
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const date = new Date(session.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  const playPct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const driveEmbed = session.fileUrl ? driveEmbedUrl(session.fileUrl) : null;
  const summaryIsDrive = session.summaryFileUrl ? !!driveEmbedUrl(session.summaryFileUrl) : false;

  function togglePlay() {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) el.play();
    else el.pause();
  }

  function scrub(e: React.MouseEvent<HTMLDivElement>) {
    const el = mediaRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const adjusted = document.dir === "rtl" || getComputedStyle(document.documentElement).direction === "rtl" ? 1 - ratio : ratio;
    el.currentTime = adjusted * duration;
    setCurrentTime(el.currentTime);
  }

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

      <div
        className="w-full rounded-[18px] overflow-hidden relative bg-black flex items-center justify-center"
        style={{ aspectRatio: "16/10" }}
      >
        {!session.fileUrl && (
          <div className="w-full h-full flex items-center justify-center text-on-brand/60 text-sm">
            טרם הועלתה הקלטה לפגישה זו
          </div>
        )}

        {session.fileUrl && driveEmbed && (
          <iframe src={driveEmbed} className="w-full h-full" style={{ border: 0 }} allow="autoplay" allowFullScreen />
        )}

        {session.fileUrl && !driveEmbed && (
          <>
            {session.mediaType === "video" ? (
              <video
                ref={mediaRef as React.RefObject<HTMLVideoElement>}
                src={session.fileUrl}
                className="w-full h-full object-contain"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            ) : (
              <>
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand to-brand-light">
                  <Waveform color="oklch(0.95 0.02 90)" />
                </div>
                <audio
                  ref={mediaRef as React.RefObject<HTMLAudioElement>}
                  src={session.fileUrl}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </>
            )}
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/25 cursor-pointer"
            >
              <div className="w-[60px] h-[60px] rounded-full bg-white/90 flex items-center justify-center">
                {isPlaying ? <PauseBars /> : <PlayTriangle size={11} />}
              </div>
            </button>
          </>
        )}
      </div>

      <div className="font-heading font-bold text-[19px] text-ink mt-4">{session.title}</div>
      <div className="text-[13px] text-muted mt-0.5">{driveEmbed ? date : `${date} · ${fmt(duration)}`}</div>

      {!driveEmbed && (
        <div className="flex flex-col gap-2 mt-4.5">
          <div className="w-full h-1.5 rounded-md bg-[oklch(0.92_0.02_150)] cursor-pointer" onClick={scrub}>
            <div className="h-full rounded-md bg-brand" style={{ width: `${playPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      )}

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
          <div
            className="flex items-center gap-2.5 bg-white/60 rounded-[10px] px-3 py-2.5"
            style={{ marginTop: hasSummaryText ? 10 : 0 }}
          >
            <DocIcon />
            <div className="flex-1 text-[13px] text-ink truncate">{session.summaryFileName}</div>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href={session.summaryFileUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12.5px] font-semibold text-brand"
              >
                צפייה
              </a>
              {!summaryIsDrive && (
                <a href={session.summaryFileUrl!} download className="text-[12.5px] font-semibold text-brand">
                  הורדה
                </a>
              )}
            </div>
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
