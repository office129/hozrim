"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Field";

export function UploadOrLinkControl({
  accept,
  uploadLabel,
  onUpload,
  onLink,
}: {
  accept: string;
  uploadLabel: string;
  onUpload: (file: File) => void;
  onLink: (url: string) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [linkValue, setLinkValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (mode === "link") {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={linkValue}
          onChange={(e) => setLinkValue(e.target.value)}
          placeholder="קישור (Google Drive וכו')"
          className="py-1.5 px-2.5 text-[12px] w-44 sm:w-52"
        />
        <button
          className="text-[11.5px] font-semibold text-on-brand bg-brand px-2.5 py-1.5 rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
          disabled={!linkValue.trim() || saving}
          onClick={async () => {
            const url = linkValue.trim();
            if (!url) return;
            setSaving(true);
            await onLink(url);
            setSaving(false);
            setLinkValue("");
            setMode("upload");
          }}
        >
          {saving ? "שומר…" : "שמירה"}
        </button>
        <button
          className="text-[11px] text-muted underline shrink-0 cursor-pointer whitespace-nowrap"
          onClick={() => setMode("upload")}
        >
          העלאת קובץ
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <label className="cursor-pointer text-[12.5px] font-semibold text-on-brand bg-brand px-3 py-2 rounded-lg shrink-0">
        {uploadLabel}
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </label>
      <button
        className="text-[11px] text-muted underline shrink-0 cursor-pointer whitespace-nowrap"
        onClick={() => setMode("link")}
      >
        קישור
      </button>
    </div>
  );
}
