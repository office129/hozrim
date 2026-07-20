"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, apiUpload, ApiError } from "@/lib/api-client";
import { useDragReorder } from "@/lib/useDragReorder";
import { DragHandle } from "@/components/icons";
import { InlineEditableText } from "./InlineEditableText";
import { PromptModal } from "./PromptModal";

type LibraryItemData = {
  id: string;
  number: number;
  title: string;
  videoFileName: string | null;
  audioFileName: string | null;
  fileName: string | null;
};

export function LibraryView({ items }: { items: LibraryItemData[] }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const { bind } = useDragReorder(items, async (orderedIds) => {
    await apiSend("/api/admin/library/reorder", "POST", { orderedIds });
    router.refresh();
  });

  return (
    <div className="animate-fade-up">
      <div className="font-heading font-bold text-2xl text-ink mb-1.5">ספריית תכנים</div>
      <div className="text-[13px] text-muted mb-5">
        תבנית התהליך הכללית — שם הפגישות והתרגולים המוצעים לכל לקוח/ה חדש/ה
      </div>

      <div className="flex flex-col gap-2.5">
        {items.map((item, idx) => (
          <LibraryRow key={item.id} item={item} dragProps={bind(idx)} />
        ))}
        <button
          className="mt-1.5 p-3 rounded-xl border border-dashed border-[oklch(0.7_0.03_150)] text-muted text-[13px] cursor-pointer"
          onClick={() => setShowAdd(true)}
        >
          + הוספת שיעור
        </button>
      </div>

      {showAdd && (
        <PromptModal
          title="שיעור פתיחה חדש"
          placeholder="שם השיעור"
          onCancel={() => setShowAdd(false)}
          onConfirm={async (title) => {
            setShowAdd(false);
            await apiSend("/api/admin/library", "POST", { title });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LibraryRow({
  item,
  dragProps,
}: {
  item: LibraryItemData;
  dragProps: ReturnType<ReturnType<typeof useDragReorder>["bind"]>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function deleteItem() {
    if (!confirm(`למחוק את "${item.title}"?`)) return;
    await apiSend(`/api/admin/library/${item.id}`, "DELETE");
    router.refresh();
  }

  async function upload(slot: "video" | "audio" | "file", file: File) {
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("slot", slot);
    try {
      await apiUpload(`/api/admin/library/${item.id}/upload`, form);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ההעלאה נכשלה");
    }
  }

  const slots: { key: "video" | "audio" | "file"; label: string; accept: string; fileName: string | null }[] = [
    { key: "video", label: "וידאו", accept: "video/*", fileName: item.videoFileName },
    { key: "audio", label: "אודיו", accept: "audio/*", fileName: item.audioFileName },
    { key: "file", label: "קובץ", accept: "*/*", fileName: item.fileName },
  ];

  return (
    <div {...dragProps} className="bg-card border border-border rounded-2xl px-4 py-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-3.5">
        <DragHandle />
        <div className="w-9 h-9 rounded-[10px] bg-brand-soft flex items-center justify-center font-bold text-brand shrink-0">
          {item.number}
        </div>
        <div className="flex-1 min-w-0">
          <InlineEditableText
            value={item.title}
            onSave={async (next) => {
              await apiSend(`/api/admin/library/${item.id}`, "PATCH", { title: next });
              router.refresh();
            }}
            onDelete={deleteItem}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {slots.map((s) => (
          <div key={s.key} className="flex items-center gap-2 bg-tile rounded-[9px] px-2.5 py-1.5">
            <div className="text-[11.5px] text-muted">
              {s.label}: {s.fileName || "לא הועלה"}
            </div>
            <label className="cursor-pointer text-[11.5px] font-semibold text-brand border border-brand px-2.5 py-1 rounded-[7px]">
              {s.fileName ? "החלפה" : "העלאה"}
              <input
                type="file"
                accept={s.accept}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(s.key, file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        ))}
      </div>
      {error && <div className="text-danger text-xs">{error}</div>}
    </div>
  );
}
