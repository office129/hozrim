"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, apiUpload, ApiError } from "@/lib/api-client";
import { tryUploadFileDirect } from "@/lib/blob-upload-client";
import { tryUploadLibraryFileToDrive } from "@/lib/drive-upload-client";
import { MAX_DIRECT_UPLOAD_BYTES } from "@/lib/upload-limits";
import { useDragReorder } from "@/lib/useDragReorder";
import { DragHandle, ChevronDown, FolderIcon } from "@/components/icons";
import { InlineEditableText } from "./InlineEditableText";
import { PromptModal } from "./PromptModal";
import { UploadOrLinkControl } from "./UploadOrLinkControl";

const NO_FOLDER = "__none__";

type LibraryItemData = {
  id: string;
  number: number;
  title: string;
  folderId: string | null;
  videoFileName: string | null;
  audioFileName: string | null;
  fileName: string | null;
};

type LibraryFolderData = {
  id: string;
  title: string;
  items: LibraryItemData[];
};

export function LibraryView({ items, folders }: { items: LibraryItemData[]; folders: LibraryFolderData[] }) {
  const router = useRouter();
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const folderOptions = folders.map((f) => ({ id: f.id, title: f.title }));

  const { bind: bindItems } = useDragReorder(items, async (orderedIds) => {
    await apiSend("/api/admin/library/reorder", "POST", { orderedIds, folderId: null });
    router.refresh();
  });
  const { bind: bindFolders } = useDragReorder(folders, async (orderedIds) => {
    await apiSend("/api/admin/library/folders/reorder", "POST", { orderedIds });
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
          <LibraryRow key={item.id} item={item} folders={folderOptions} dragProps={bindItems(idx)} />
        ))}
        <button
          className="mt-1.5 p-3 rounded-xl border border-dashed border-[oklch(0.7_0.03_150)] text-muted text-[13px] cursor-pointer"
          onClick={() => setShowAddItem(true)}
        >
          + הוספת שיעור
        </button>
      </div>

      <div className="mt-7 flex flex-col gap-2.5">
        <div className="font-heading font-bold text-base text-ink">תיקיות</div>
        {folders.map((folder, idx) => (
          <FolderSection key={folder.id} folder={folder} folders={folderOptions} dragProps={bindFolders(idx)} />
        ))}
        <button
          className="p-3 rounded-xl border border-dashed border-[oklch(0.7_0.03_150)] text-muted text-[13px] cursor-pointer"
          onClick={() => setShowAddFolder(true)}
        >
          + הוספת תיקייה
        </button>
      </div>

      {showAddItem && (
        <PromptModal
          title="שיעור פתיחה חדש"
          placeholder="שם השיעור"
          onCancel={() => setShowAddItem(false)}
          onConfirm={async (title) => {
            setShowAddItem(false);
            await apiSend("/api/admin/library", "POST", { title });
            router.refresh();
          }}
        />
      )}
      {showAddFolder && (
        <PromptModal
          title="תיקייה חדשה"
          placeholder="שם התיקייה"
          onCancel={() => setShowAddFolder(false)}
          onConfirm={async (title) => {
            setShowAddFolder(false);
            await apiSend("/api/admin/library/folders", "POST", { title });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FolderSection({
  folder,
  folders,
  dragProps,
}: {
  folder: LibraryFolderData;
  folders: { id: string; title: string }[];
  dragProps: ReturnType<ReturnType<typeof useDragReorder>["bind"]>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const { bind } = useDragReorder(folder.items, async (orderedIds) => {
    await apiSend("/api/admin/library/reorder", "POST", { orderedIds, folderId: folder.id });
    router.refresh();
  });

  async function deleteFolder() {
    if (!confirm(`למחוק את התיקייה "${folder.title}"? כל השיעורים שבתוכה יימחקו גם הם.`)) return;
    await apiSend(`/api/admin/library/folders/${folder.id}`, "DELETE");
    router.refresh();
  }

  return (
    <div {...dragProps} className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <DragHandle />
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer text-right">
          <FolderIcon />
          <span className="text-[13px] text-muted shrink-0">({folder.items.length})</span>
        </button>
        <div className="flex-1 min-w-0">
          <InlineEditableText
            value={folder.title}
            onSave={async (next) => {
              await apiSend(`/api/admin/library/folders/${folder.id}`, "PATCH", { title: next });
              router.refresh();
            }}
            onDelete={deleteFolder}
          />
        </div>
        <ChevronDown open={open} />
      </div>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-2.5">
          {folder.items.map((item, idx) => (
            <LibraryRow key={item.id} item={item} folders={folders} dragProps={bind(idx)} />
          ))}
          <button
            className="p-2.5 rounded-xl border border-dashed border-[oklch(0.7_0.03_150)] text-muted text-[12.5px] cursor-pointer"
            onClick={() => setShowAdd(true)}
          >
            + הוספת שיעור לתיקייה
          </button>
        </div>
      )}
      {showAdd && (
        <PromptModal
          title="שיעור חדש"
          placeholder="שם השיעור"
          onCancel={() => setShowAdd(false)}
          onConfirm={async (title) => {
            setShowAdd(false);
            await apiSend("/api/admin/library", "POST", { title, folderId: folder.id });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LibraryRow({
  item,
  folders,
  dragProps,
}: {
  item: LibraryItemData;
  folders: { id: string; title: string }[];
  dragProps: ReturnType<ReturnType<typeof useDragReorder>["bind"]>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fileUploading, setFileUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [audioProgress, setAudioProgress] = useState<number | null>(null);

  async function deleteItem() {
    if (!confirm(`למחוק את "${item.title}"?`)) return;
    await apiSend(`/api/admin/library/${item.id}`, "DELETE");
    router.refresh();
  }

  async function moveToFolder(folderId: string | null) {
    await apiSend(`/api/admin/library/${item.id}`, "PATCH", { folderId });
    router.refresh();
  }

  async function upload(slot: "video" | "audio" | "file", file: File) {
    setError("");
    if (slot === "file") setFileUploading(true);
    const setProgress = slot === "video" ? setVideoProgress : slot === "audio" ? setAudioProgress : null;
    setProgress?.(0);
    try {
      const toDrive = await tryUploadLibraryFileToDrive(file, item.id, setProgress ?? undefined);
      if (toDrive) {
        await apiSend(`/api/admin/library/${item.id}`, "PATCH", { slot, url: toDrive.url, name: toDrive.fileName });
        router.refresh();
        return;
      }
      if (slot !== "file") {
        const direct = await tryUploadFileDirect(file, slot, "library", setProgress ?? undefined);
        if (direct) {
          await apiSend(`/api/admin/library/${item.id}`, "PATCH", { slot, url: direct.url, name: direct.fileName });
          router.refresh();
          return;
        }
      }
      if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
        setError(
          `הקובץ גדול מדי להעלאה ישירה (${(file.size / (1024 * 1024)).toFixed(0)}MB) — לקבצים גדולים כאלה יש להשתמש באפשרות "קישור" ולהדביק קישור מגוגל דרייב במקום`
        );
        return;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("slot", slot);
      await apiUpload(`/api/admin/library/${item.id}/upload`, form);
      router.refresh();
    } catch (err) {
      console.error("Library upload failed", err);
      setError(err instanceof ApiError ? err.message : "ההעלאה נכשלה");
    } finally {
      if (slot === "file") setFileUploading(false);
      setProgress?.(null);
    }
  }

  async function link(slot: "video" | "audio", url: string) {
    setError("");
    try {
      await apiSend(`/api/admin/library/${item.id}`, "PATCH", { slot, url });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "הקישור לא נשמר");
    }
  }

  async function removeSlot(slot: "video" | "audio" | "file") {
    if (!confirm("למחוק את הקובץ?")) return;
    setError("");
    try {
      await apiSend(`/api/admin/library/${item.id}`, "PATCH", { slot, remove: true });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "המחיקה נכשלה");
    }
  }

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
        <div className="flex items-center gap-2 bg-tile rounded-[9px] px-2.5 py-1.5">
          <div className="text-[11.5px] text-muted">וידאו: {item.videoFileName || "לא הועלה"}</div>
          <UploadOrLinkControl
            accept="video/*"
            uploadLabel={item.videoFileName ? "החלפה" : "העלאה"}
            onUpload={(file) => upload("video", file)}
            onLink={(url) => link("video", url)}
            progress={videoProgress}
          />
          {item.videoFileName && (
            <button onClick={() => removeSlot("video")} className="text-[11px] text-danger underline cursor-pointer shrink-0">
              מחיקה
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 bg-tile rounded-[9px] px-2.5 py-1.5">
          <div className="text-[11.5px] text-muted">אודיו: {item.audioFileName || "לא הועלה"}</div>
          <UploadOrLinkControl
            accept="audio/*"
            uploadLabel={item.audioFileName ? "החלפה" : "העלאה"}
            onUpload={(file) => upload("audio", file)}
            onLink={(url) => link("audio", url)}
            progress={audioProgress}
          />
          {item.audioFileName && (
            <button onClick={() => removeSlot("audio")} className="text-[11px] text-danger underline cursor-pointer shrink-0">
              מחיקה
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 bg-tile rounded-[9px] px-2.5 py-1.5">
          <div className="text-[11.5px] text-muted">קובץ: {item.fileName || "לא הועלה"}</div>
          <label
            className={`text-[11.5px] font-semibold text-brand border border-brand px-2.5 py-1 rounded-[7px] ${
              fileUploading ? "opacity-50" : "cursor-pointer"
            }`}
          >
            {fileUploading ? "מעלה…" : item.fileName ? "החלפה" : "העלאה"}
            <input
              type="file"
              accept="*/*"
              className="hidden"
              disabled={fileUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload("file", file);
              }}
            />
          </label>
          {item.fileName && (
            <button onClick={() => removeSlot("file")} className="text-[11px] text-danger underline cursor-pointer shrink-0">
              מחיקה
            </button>
          )}
        </div>
        {folders.length > 0 && (
          <select
            value={item.folderId ?? NO_FOLDER}
            onChange={(e) => moveToFolder(e.target.value === NO_FOLDER ? null : e.target.value)}
            className="text-[11.5px] text-muted bg-tile rounded-[9px] px-2.5 py-1.5 border-none outline-none cursor-pointer"
          >
            <option value={NO_FOLDER}>ללא תיקייה</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <div className="text-danger text-xs">{error}</div>}
    </div>
  );
}
