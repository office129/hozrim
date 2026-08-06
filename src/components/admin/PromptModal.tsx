"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function PromptModal({
  title,
  placeholder,
  checkboxLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  placeholder: string;
  checkboxLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string, checked: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);

  function confirm() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed, checked);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-[360px] bg-card rounded-[18px] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-heading font-bold text-lg text-ink mb-4">{title}</div>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
        />
        {checkboxLabel && (
          <label className="flex items-center gap-2 mt-3.5 text-[13px] text-ink cursor-pointer">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="cursor-pointer" />
            {checkboxLabel}
          </label>
        )}
        <div className="flex gap-2.5 mt-5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            ביטול
          </Button>
          <Button className="flex-1" onClick={confirm}>
            הוספה
          </Button>
        </div>
      </div>
    </div>
  );
}
