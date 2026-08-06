"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function PromptModal({
  title,
  placeholder,
  onCancel,
  onConfirm,
}: {
  title: string;
  placeholder: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  function confirm() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
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
