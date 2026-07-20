"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Field";

export function InlineEditableText({
  value,
  onSave,
  onDelete,
  textClassName = "text-sm font-semibold text-ink",
  inputClassName = "text-sm",
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  onDelete?: () => void;
  textClassName?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div className="flex gap-2 items-center">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`flex-1 min-w-0 py-1.5 px-2.5 ${inputClassName}`}
        />
        <button
          className="shrink-0 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs cursor-pointer"
          onClick={() => {
            const next = draft.trim() || value;
            setEditing(false);
            if (next !== value) onSave(next);
          }}
        >
          שמירה
        </button>
        <button
          className="shrink-0 px-2.5 py-1.5 rounded-lg border border-border-strong text-muted text-xs cursor-pointer"
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
        >
          ביטול
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className={textClassName}>{value}</div>
      <button
        className="shrink-0 text-[11.5px] text-muted underline cursor-pointer"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        עריכה
      </button>
      {onDelete && (
        <button className="shrink-0 text-[11.5px] text-danger underline cursor-pointer" onClick={onDelete}>
          מחיקה
        </button>
      )}
    </div>
  );
}
