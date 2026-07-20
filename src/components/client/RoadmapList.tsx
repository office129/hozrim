"use client";

import { useState } from "react";
import { ChevronDown, DocIcon, PlayTriangle, Waveform } from "@/components/icons";

type Item = {
  id: string;
  title: string;
  hasVideo: boolean;
  hasAudio: boolean;
  hasFile: boolean;
  videoUrl: string | null;
  audioUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
};

export function RoadmapList({ items }: { items: Item[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => {
        const open = openId === item.id;
        const hasNothing = !item.hasVideo && !item.hasAudio && !item.hasFile;
        return (
          <div key={item.id} className="bg-card border border-border rounded-2xl overflow-hidden">
            <button
              onClick={() => setOpenId(open ? null : item.id)}
              className="w-full cursor-pointer flex items-center gap-3.5 px-3.5 py-3 text-right"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-soft shrink-0 flex items-center justify-center">
                <PlayTriangle />
              </div>
              <div className="flex-1 min-w-0 text-sm font-semibold text-ink">{item.title}</div>
              <ChevronDown open={open} />
            </button>
            {open && (
              <div className="px-3.5 pb-3.5 flex flex-col gap-3">
                {item.hasVideo && item.videoUrl && (
                  <video controls preload="metadata" className="w-full rounded-[10px] bg-black" src={item.videoUrl} />
                )}
                {item.hasAudio && item.audioUrl && (
                  <div className="bg-tile rounded-[10px] p-2.5 flex items-center gap-2.5">
                    <Waveform />
                    <audio controls preload="metadata" className="flex-1 w-full h-9" src={item.audioUrl} />
                  </div>
                )}
                {item.hasFile && item.fileUrl && (
                  <a
                    href={item.fileUrl}
                    download={item.fileName || true}
                    className="flex items-center gap-2.5 bg-tile rounded-[10px] px-3 py-2.5"
                  >
                    <DocIcon />
                    <div className="flex-1 text-[13px] text-ink truncate">{item.fileName || "קובץ"}</div>
                    <div className="text-[12.5px] font-semibold text-brand shrink-0">להורדה</div>
                  </a>
                )}
                {hasNothing && (
                  <div className="text-[12.5px] text-muted-2 px-0.5">עדיין לא הועלה חומר כאן</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
