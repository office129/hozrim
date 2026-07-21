"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, apiUpload, ApiError } from "@/lib/api-client";
import { tryUploadFileDirect } from "@/lib/blob-upload-client";
import { useDragReorder } from "@/lib/useDragReorder";
import { DragHandle } from "@/components/icons";
import { InlineEditableText } from "./InlineEditableText";
import { Textarea } from "@/components/ui/Field";
import { PromptModal } from "./PromptModal";
import { UploadOrLinkControl } from "./UploadOrLinkControl";

type SessionData = {
  id: string;
  number: number;
  title: string;
  mediaType: string | null;
  fileName: string | null;
  summaryText: string | null;
  summaryFileName: string | null;
};

export function SessionsTab({ clientId, sessions }: { clientId: string; sessions: SessionData[] }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const { bind } = useDragReorder(sessions, async (orderedIds) => {
    await apiSend(`/api/admin/clients/${clientId}/sessions/reorder`, "POST", { orderedIds });
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-2.5">
      {sessions.map((sess, idx) => (
        <SessionRow key={sess.id} clientId={clientId} session={sess} dragProps={bind(idx)} />
      ))}
      <button
        className="mt-1.5 p-3 rounded-xl border border-dashed border-[oklch(0.7_0.03_150)] text-muted text-[13px] cursor-pointer"
        onClick={() => setShowAdd(true)}
      >
        + הוספת שיעור
      </button>

      {showAdd && (
        <PromptModal
          title="שיעור חדש"
          placeholder="שם השיעור"
          onCancel={() => setShowAdd(false)}
          onConfirm={async (title) => {
            setShowAdd(false);
            await apiSend(`/api/admin/clients/${clientId}/sessions`, "POST", { title });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function SessionRow({
  clientId,
  session,
  dragProps,
}: {
  clientId: string;
  session: SessionData;
  dragProps: ReturnType<ReturnType<typeof useDragReorder>["bind"]>;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(session.summaryText || "");
  const [error, setError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingMediaType, setPendingMediaType] = useState<"video" | "audio">(
    (session.mediaType as "video" | "audio") || "video"
  );

  function scheduleSummarySave(next: string) {
    setSummary(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await apiSend(`/api/admin/clients/${clientId}/sessions/${session.id}`, "PATCH", {
        summaryText: next,
      });
    }, 600);
  }

  async function handleMediaFile(file: File, mediaType: "video" | "audio") {
    setError("");
    try {
      const direct = await tryUploadFileDirect(file, mediaType, `clients/${clientId}`);
      if (direct) {
        await apiSend(`/api/admin/clients/${clientId}/sessions/${session.id}`, "PATCH", {
          fileUrl: direct.url,
          fileName: direct.fileName,
          mediaType,
        });
        router.refresh();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההעלאה נכשלה");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("mediaType", mediaType);
    try {
      await apiUpload(`/api/admin/clients/${clientId}/sessions/${session.id}/upload`, form);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ההעלאה נכשלה");
    }
  }

  async function handleMediaLink(url: string, mediaType: "video" | "audio") {
    setError("");
    try {
      await apiSend(`/api/admin/clients/${clientId}/sessions/${session.id}`, "PATCH", { fileUrl: url, mediaType });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "הקישור לא נשמר");
    }
  }

  async function handleSummaryFile(file: File) {
    setError("");
    try {
      const direct = await tryUploadFileDirect(file, "pdf", `clients/${clientId}`);
      if (direct) {
        await apiSend(`/api/admin/clients/${clientId}/sessions/${session.id}`, "PATCH", {
          summaryFileUrl: direct.url,
          summaryFileName: direct.fileName,
        });
        router.refresh();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההעלאה נכשלה");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    try {
      await apiUpload(`/api/admin/clients/${clientId}/sessions/${session.id}/summary-file`, form);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ההעלאה נכשלה");
    }
  }

  async function deleteSession() {
    if (!confirm(`למחוק את "${session.title}"?`)) return;
    await apiSend(`/api/admin/clients/${clientId}/sessions/${session.id}`, "DELETE");
    router.refresh();
  }

  return (
    <div
      {...dragProps}
      className="bg-card border border-border rounded-2xl px-4 py-3.5 flex flex-col gap-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <DragHandle />
          <div className="w-9 h-9 rounded-[10px] bg-brand-soft flex items-center justify-center font-bold text-brand shrink-0">
            {session.number}
          </div>
          <div className="flex-1 min-w-0">
            <InlineEditableText
              value={session.title}
              onSave={async (next) => {
                await apiSend(`/api/admin/clients/${clientId}/sessions/${session.id}`, "PATCH", { title: next });
                router.refresh();
              }}
              onDelete={deleteSession}
            />
            <div className="text-xs text-muted mt-0.5">{session.fileName || "טרם הועלתה הקלטה"}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold border border-brand cursor-pointer"
            style={{
              background: pendingMediaType === "video" ? "var(--color-brand)" : "transparent",
              color: pendingMediaType === "video" ? "var(--color-on-brand)" : "var(--color-brand)",
            }}
            onClick={() => setPendingMediaType("video")}
          >
            וידאו
          </button>
          <button
            className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold border border-brand cursor-pointer"
            style={{
              background: pendingMediaType === "audio" ? "var(--color-brand)" : "transparent",
              color: pendingMediaType === "audio" ? "var(--color-on-brand)" : "var(--color-brand)",
            }}
            onClick={() => setPendingMediaType("audio")}
          >
            אודיו
          </button>
          <UploadOrLinkControl
            accept={pendingMediaType === "video" ? "video/*" : "audio/*"}
            uploadLabel={session.fileName ? "החלפת קובץ" : "העלאת הקלטה"}
            onUpload={(file) => handleMediaFile(file, pendingMediaType)}
            onLink={(url) => handleMediaLink(url, pendingMediaType)}
          />
        </div>
      </div>

      <div>
        <div className="text-xs text-muted mb-1.5">סיכום פגישה ללקוח/ה</div>
        <Textarea
          value={summary}
          onChange={(e) => scheduleSummarySave(e.target.value)}
          placeholder="מה תרצה/י שהלקוח/ה יראה כסיכום לפגישה הזו..."
          className="min-h-[70px] text-[13px]"
        />
        <div className="flex items-center gap-2.5 mt-2">
          <label className="cursor-pointer text-[12.5px] font-semibold text-brand border border-brand px-3 py-1.5 rounded-[9px] shrink-0">
            {session.summaryFileName ? "החלפת PDF" : "העלאת PDF"}
            <input
              ref={summaryFileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleSummaryFile(file);
                e.target.value = "";
              }}
            />
          </label>
          <div className="text-xs text-muted">{session.summaryFileName || "לא הועלה קובץ PDF"}</div>
        </div>
      </div>

      {error && <div className="text-danger text-xs">{error}</div>}
    </div>
  );
}
