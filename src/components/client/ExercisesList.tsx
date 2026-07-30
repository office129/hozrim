"use client";

import { useState } from "react";
import { ChevronDown, DocIcon, Waveform } from "@/components/icons";
import { AudioEmbed, DocEmbed } from "@/components/client/MediaEmbed";
import { driveEmbedUrl } from "@/lib/external-links";

type Exercise = {
  id: string;
  title: string;
  hasAudio: boolean;
  hasFile: boolean;
  audioUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
};

export function ExercisesList({ exercises }: { exercises: Exercise[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (exercises.length === 0) {
    return <div className="text-center py-16 text-muted text-sm">עדיין לא נוספו תרגולים</div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {exercises.map((ex) => {
        const open = openId === ex.id;
        const hasNeither = !ex.hasAudio && !ex.hasFile;
        return (
          <div key={ex.id} className="bg-card border border-border rounded-2xl overflow-hidden">
            <button
              onClick={() => setOpenId(open ? null : ex.id)}
              className="w-full cursor-pointer flex items-center gap-3.5 px-3.5 py-3 text-right"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-soft shrink-0 flex items-center justify-center">
                <DocIcon />
              </div>
              <div className="flex-1 min-w-0 text-sm font-semibold text-ink truncate">{ex.title}</div>
              <ChevronDown open={open} />
            </button>
            {open && (
              <div className="px-3.5 pb-3.5 flex flex-col gap-3">
                {ex.hasAudio &&
                  ex.audioUrl &&
                  (driveEmbedUrl(ex.audioUrl) ? (
                    <div className="rounded-[10px] overflow-hidden">
                      <AudioEmbed url={ex.audioUrl} className="w-full block" />
                    </div>
                  ) : (
                    <div className="bg-tile rounded-[10px] p-2.5 flex items-center gap-2.5">
                      <Waveform />
                      <AudioEmbed url={ex.audioUrl} className="flex-1 w-full h-9" />
                    </div>
                  ))}
                {ex.hasFile && ex.fileUrl && (
                  <div>
                    <div className="flex items-center gap-2.5 bg-tile rounded-[10px] px-3 py-2.5">
                      <DocIcon />
                      <div className="flex-1 text-[13px] text-ink truncate">{ex.fileName || "קובץ PDF"}</div>
                      <div className="flex items-center gap-3 shrink-0">
                        <a
                          href={ex.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12.5px] font-semibold text-brand"
                        >
                          פתיחה בחלון חדש
                        </a>
                        {!driveEmbedUrl(ex.fileUrl) && (
                          <a href={ex.fileUrl} download={ex.fileName || true} className="text-[12.5px] font-semibold text-brand">
                            הורדה
                          </a>
                        )}
                      </div>
                    </div>
                    <DocEmbed url={ex.fileUrl} className="w-full rounded-[10px] mt-2" />
                  </div>
                )}
                {hasNeither && (
                  <div className="text-[12.5px] text-muted-2 px-0.5">עדיין לא הועלה חומר לתרגול הזה</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
