"use client";

import { useState } from "react";

// Renders a one-time secret (temp password) as an isolated, monospace block
// with a real copy button — selecting text by hand (double-click, drag) is
// error-prone since adjacent UI text can get glued on, so this gives a
// reliable exact-copy path instead.
export function CopyableSecret({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — the value is still visible to select manually
    }
  }

  return (
    <span className="inline-flex items-center gap-2 align-middle">
      <code className="font-mono bg-white/70 border border-border-strong rounded-md px-2 py-0.5 select-all">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="text-[12px] font-semibold text-brand underline cursor-pointer"
      >
        {copied ? "הועתק!" : "העתקה"}
      </button>
    </span>
  );
}
