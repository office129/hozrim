"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, apiUpload, ApiError } from "@/lib/api-client";
import { tryUploadFileDirect } from "@/lib/blob-upload-client";
import { MAX_DIRECT_UPLOAD_BYTES } from "@/lib/upload-limits";
import { InlineEditableText } from "./InlineEditableText";
import { PromptModal } from "./PromptModal";
import { UploadOrLinkControl } from "./UploadOrLinkControl";

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
  const [pdfUploading, setPdfUploading] = useState(false);

  async function uploadAudio(file: File) {
    setError("");
    try {
      const direct = await tryUploadFileDirect(file, "audio", `clients/${clientId}`);
      if (direct) {
        await apiSend(`/api/admin/clients/${clientId}/exercises/${exercise.id}`, "PATCH", {
          audioFileUrl: direct.url,
          audioFileName: direct.fileName,
        });
        router.refresh();
        return;
      }
    } catch (err) {
      console.error("Audio upload failed", err);
      setError(err instanceof Error ? err.message : "ההעלאה נכשלה");
      return;
    }
    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      setError(
        `הקובץ גדול מדי להעלאה ישירה (${(file.size / (1024 * 1024)).toFixed(0)}MB) — לקבצים גדולים כאלה יש להשתמש באפשרות "קישור" ולהדביק קישור מגוגל דרייב במקום`
      );
      return;
    }
    const form = new FormData();
    form.append("file", file);
    try {
      await apiUpload(`/api/admin/clients/${clientId}/exercises/${exercise.id}/upload`, form);
      router.refresh();
    } catch (err) {
      console.error("Audio upload failed", err);
      setError(err instanceof ApiError ? err.message : "ההעלאה נכשלה");
    }
  }

  async function linkAudio(url: string) {
    setError("");
    try {
      await apiSend(`/api/admin/clients/${clientId}/exercises/${exercise.id}`, "PATCH", { audioFileUrl: url });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "הקישור לא נשמר");
    }
  }

  async function uploadPdf(file: File) {
    setError("");
    setPdfUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiUpload(`/api/admin/clients/${clientId}/exercises/${exercise.id}/upload`, form);
      router.refresh();
    } catch (err) {
      console.error("PDF upload failed", err);
      setError(err instanceof ApiError ? err.message : "ההעלאה נכשלה");
    } finally {
      setPdfUploading(false);
    }
  }

  async function deleteExercise() {
    if (!confirm(`למחוק את "${exercise.title}"?`)) return;
    await apiSend(`/api/admin/clients/${clientId}/exercises/${exercise.id}`, "DELETE");
    router.refresh();
  }

  return (
    <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-3.5">
        <div className="flex-1 min-w-0">
          <InlineEditableText
            value={exercise.title}
            onSave={async (next) => {
              await apiSend(`/api/admin/clients/${clientId}/exercises/${exercise.id}`, "PATCH", { title: next });
              router.refresh();
            }}
            onDelete={deleteExercise}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-tile rounded-[9px] px-2.5 py-1.5">
          <div className="text-[11.5px] text-muted">אודיו: {exercise.audioFileName || "לא הועלה"}</div>
          <UploadOrLinkControl
            accept="audio/*"
            uploadLabel={exercise.audioFileName ? "החלפה" : "העלאה"}
            onUpload={uploadAudio}
            onLink={linkAudio}
          />
        </div>
        <div className="flex items-center gap-2 bg-tile rounded-[9px] px-2.5 py-1.5">
          <div className="text-[11.5px] text-muted">PDF: {exercise.pdfFileName || "לא הועלה"}</div>
          <label
            className={`text-[11.5px] font-semibold text-brand border border-brand px-2.5 py-1 rounded-[7px] ${
              pdfUploading ? "opacity-50" : "cursor-pointer"
            }`}
          >
            {pdfUploading ? "מעלה…" : exercise.pdfFileName ? "החלפה" : "העלאה"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={pdfUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) uploadPdf(file);
              }}
            />
          </label>
        </div>
      </div>

      {error && <div className="text-danger text-xs">{error}</div>}
    </div>
  );
}
