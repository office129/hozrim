"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type Entry = { id: string; text: string; date: string };

export function JournalView({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setLoading(true);
    try {
      await apiSend("/api/client/journal", "POST", { text });
      setDraft("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await apiSend(`/api/client/journal/${id}`, "DELETE");
    router.refresh();
  }

  return (
    <div>
      <div className="bg-card border border-border rounded-2xl p-3.5 mb-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="מה עולה לך היום..."
          className="min-h-[90px] border-none p-0 focus:border-none"
        />
        <Button className="mt-2" onClick={add} disabled={loading}>
          הוספה ליומן
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-9 text-muted">
          <div className="w-[52px] h-[52px] rounded-full bg-brand-soft-2 mx-auto mb-3.5" />
          <div className="text-sm">עדיין אין רשומות ביומן</div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <div key={entry.id} className="bg-card border border-border rounded-2xl p-3.5">
            <div className="flex justify-between items-baseline mb-2">
              <div className="text-xs font-semibold text-brand">{entry.date}</div>
              <button onClick={() => remove(entry.id)} className="text-xs text-danger cursor-pointer">
                מחיקה
              </button>
            </div>
            <div className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">{entry.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
