"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, apiUpload, ApiError } from "@/lib/api-client";
import { InlineEditableText } from "./InlineEditableText";
import { PromptModal } from "./PromptModal";

type ExerciseData = {
  id: string;
  title: string;
  audioFileName: string | null;
  pdfFileName: string | null;
};

export function ExercisesTab({ clientId, exercises }: { clientId: string; exercises: ExerciseData[] }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex flex-col gap-2.5">
      {exercises.map((ex) => (
        <ExerciseRow key={ex.id} clientId={clientId} exercise={ex} />
      ))}
      <button
        className="mt-1.5 p-3 rounded-xl border border-dashed border-[oklch(0.7_0.03_150)] text-muted text-[13px] cursor-pointer"
        onClick={() => setShowAdd(true)}
      >
        + הוספת תרגול חדש
      </button>

      {showAdd && (
        <PromptModal
          title="תרגול חדש"
          placeholder="שם התרגול"
          onCancel={() => setShowAdd(false)}
          onConfirm={async (title) => {
            setShowAdd(false);
            await apiSend(`/api/admin/clients/${clientId}/exercises`, "POST", { title });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ExerciseRow({ clientId, exercise }: { clientId: string; exercise: ExerciseData }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const fileName = exercise.audioFileName || exercise.pdfFileName;

  async function upload(file: File) {
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      await apiUpload(`/api/admin/clients/${clientId}/exercises/${exercise.id}/upload`, form);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ההעלאה נכשלה");
    }
  }

  async function deleteExercise() {
    if (!confirm(`למחוק את "${exercise.title}"?`)) return;
    await apiSend(`/api/admin/clients/${clientId}/exercises/${exercise.id}`, "DELETE");
    router.refresh();
  }

  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3.5">
      <div className="w-9 h-[42px] rounded-md border-2 border-[oklch(0.6_0.05_155)] shrink-0 flex items-end justify-center pb-1">
        <span className="text-[8px] font-bold text-[oklch(0.4_0.06_155)]">
          {exercise.audioFileName ? "אודיו" : "PDF"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <InlineEditableText
          value={exercise.title}
          onSave={async (next) => {
            await apiSend(`/api/admin/clients/${clientId}/exercises/${exercise.id}`, "PATCH", { title: next });
            router.refresh();
          }}
          onDelete={deleteExercise}
        />
        <div className="text-xs text-muted mt-0.5">{fileName || "טרם הועלה קובץ"}</div>
        {error && <div className="text-danger text-xs mt-0.5">{error}</div>}
      </div>
      <label className="cursor-pointer text-[13px] font-semibold text-brand border border-brand px-3.5 py-2 rounded-[10px] shrink-0">
        {fileName ? "החלפת קובץ" : "העלאת PDF / אודיו"}
        <input
          type="file"
          accept="application/pdf,audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
