"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { Textarea, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ChevronDown, DocIcon } from "@/components/icons";
import { VideoEmbed, AudioEmbed, DocEmbed } from "@/components/client/MediaEmbed";
import { tryUploadPersonalFileToDrive } from "@/lib/personal-upload-client";

type Entry = { id: string; text: string; date: string };
type UploadFile = { id: string; url: string; fileName: string; mediaType: string };
type Group = { id: string; title: string; files: UploadFile[] };

// Either uploading the first file of a brand-new named group (the group
// itself is created right before the upload starts), or adding another
// file to a group that already exists.
type PendingUpload = { kind: "new"; title: string } | { kind: "existing"; groupId: string };

function FileEmbed({ file }: { file: UploadFile }) {
  if (file.mediaType === "video") return <VideoEmbed url={file.url} className="w-full rounded-[10px]" />;
  if (file.mediaType === "audio") return <AudioEmbed url={file.url} className="w-full block rounded-[10px]" />;
  return <DocEmbed url={file.url} className="w-full rounded-[10px]" />;
}

export function JournalView({ entries, groups }: { entries: Entry[]; groups: Group[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef<PendingUpload | null>(null);

  // A large personal file can take a while to upload (see uploadFile) -
  // warn before an accidental refresh/close throws away the progress,
  // the same protection browsers show for an unsaved form.
  useEffect(() => {
    if (!uploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploading]);

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

  function startNewGroupUpload() {
    const title = newGroupTitle.trim();
    if (!title) return;
    pendingUploadRef.current = { kind: "new", title };
    fileInputRef.current?.click();
  }

  function startAddToGroupUpload(groupId: string) {
    pendingUploadRef.current = { kind: "existing", groupId };
    fileInputRef.current?.click();
  }

  async function handleFileChosen(file: File) {
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;
    if (!pending) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    try {
      let groupId: string;
      if (pending.kind === "new") {
        const { group } = (await apiSend("/api/client/upload-groups", "POST", { title: pending.title })) as {
          group: { id: string };
        };
        groupId = group.id;
      } else {
        groupId = pending.groupId;
      }

      const mediaType = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
      const viaDrive = await tryUploadPersonalFileToDrive(file, groupId, setUploadProgress);
      if (viaDrive) {
        await apiSend("/api/client/uploads", "PATCH", { ...viaDrive, groupId, mediaType });
      } else {
        const form = new FormData();
        form.append("file", file);
        form.append("groupId", groupId);
        const res = await fetch("/api/client/uploads", { method: "POST", credentials: "include", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "ההעלאה נכשלה");
        }
      }

      setCreatingGroup(false);
      setNewGroupTitle("");
      setExpandedId(groupId);
      router.refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(id: string) {
    await apiSend(`/api/client/uploads/${id}`, "DELETE");
    router.refresh();
  }

  async function removeGroup(id: string) {
    await apiSend(`/api/client/upload-groups/${id}`, "DELETE");
    if (expandedId === id) setExpandedId(null);
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

      <div className="mt-6 pt-5 border-t border-border">
        <div className="font-heading font-semibold text-base text-ink mb-1">ההעלאות שלי</div>
        <div className="text-[13px] text-muted mb-3.5">מקום פרטי להעלות לעצמך מסמכים, וידאו או אודיו לשימוש אישי</div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,application/pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleFileChosen(file);
          }}
        />

        {!creatingGroup ? (
          <Button variant="outline" onClick={() => setCreatingGroup(true)} disabled={uploading}>
            העלאת קובץ חדש
          </Button>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-2">
            <div className="text-[12.5px] text-muted">איך לקרוא לזה?</div>
            <Input
              autoFocus
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              placeholder='למשל: "מסמכי ביטוח"'
              className="text-[13px]"
              onKeyDown={(e) => e.key === "Enter" && startNewGroupUpload()}
            />
            <div className="flex items-center gap-2">
              <Button onClick={startNewGroupUpload} disabled={uploading || !newGroupTitle.trim()}>
                בחירת קובץ
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCreatingGroup(false);
                  setNewGroupTitle("");
                }}
                disabled={uploading}
              >
                ביטול
              </Button>
            </div>
          </div>
        )}
        {uploadError && <div className="text-danger text-xs mt-1.5">{uploadError}</div>}

        {groups.length > 0 && (
          <div className="flex flex-col gap-2.5 mt-3.5">
            {groups.map((group) => {
              const open = expandedId === group.id;
              return (
                <div key={group.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(open ? null : group.id)}
                    className="w-full cursor-pointer flex items-center gap-3.5 px-3.5 py-3 text-right"
                  >
                    <div className="w-10 h-10 rounded-xl bg-brand-soft shrink-0 flex items-center justify-center">
                      <DocIcon />
                    </div>
                    <div className="flex-1 min-w-0 text-sm font-semibold text-ink truncate">{group.title}</div>
                    <ChevronDown open={open} />
                  </button>
                  {open && (
                    <div className="px-3.5 pb-3.5 flex flex-col gap-3">
                      {group.files.map((file) => (
                        <div key={file.id}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-[12.5px] text-muted truncate">{file.fileName}</div>
                            <button
                              onClick={() => removeFile(file.id)}
                              className="text-[11.5px] text-danger cursor-pointer shrink-0"
                            >
                              מחיקה
                            </button>
                          </div>
                          <FileEmbed file={file} />
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1">
                        <Button
                          variant="outline"
                          onClick={() => startAddToGroupUpload(group.id)}
                          disabled={uploading}
                          className="text-[12.5px] px-3 py-2"
                        >
                          הוספת קובץ נוסף
                        </Button>
                        <button
                          onClick={() => removeGroup(group.id)}
                          className="text-[12.5px] text-danger cursor-pointer"
                        >
                          מחיקת התיקייה כולה
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {uploading && (
        <div className="fixed bottom-5 inset-x-0 flex justify-center z-50 pointer-events-none px-4">
          <div className="bg-ink text-cream text-[12.5px] font-medium rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gold animate-pulse shrink-0" />
            מעלה קובץ… {uploadProgress}% — נא לא לסגור או לרענן את הדף
          </div>
        </div>
      )}
    </div>
  );
}
