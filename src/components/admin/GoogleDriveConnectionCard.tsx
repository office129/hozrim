"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiSend, ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/Field";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "האישור בוטל — לא נתת גישה לדרייב",
  invalid_state: "הבקשה פגה, נסה/י שוב",
  connect_failed: "החיבור נכשל, נסה/י שוב",
};

export function GoogleDriveConnectionCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{
    configured: boolean;
    connected: boolean;
    email: string | null;
    meetRecordingsFolderId: string | null;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [editingMeetFolder, setEditingMeetFolder] = useState(false);
  const [meetFolderUrl, setMeetFolderUrl] = useState("");
  const [savingMeetFolder, setSavingMeetFolder] = useState(false);
  const [meetFolderError, setMeetFolderError] = useState("");

  useEffect(() => {
    apiGet("/api/admin/drive-oauth/status")
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false, email: null, meetRecordingsFolderId: null }));

    if (searchParams.get("drive_connected")) {
      setMessage("גוגל דרייב חובר בהצלחה!");
      router.replace("/admin/team");
    } else if (searchParams.get("drive_error")) {
      const code = searchParams.get("drive_error") || "";
      setMessage(ERROR_MESSAGES[code] || "החיבור נכשל, נסה/י שוב");
      router.replace("/admin/team");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function disconnect() {
    if (!confirm("לנתק את חיבור גוגל דרייב? העלאות עתידיות יחזרו להשתמש באחסון של וורסל.")) return;
    setDisconnecting(true);
    try {
      await apiSend("/api/admin/drive-oauth/disconnect", "POST");
      setStatus((prev) => (prev ? { ...prev, connected: false, email: null } : prev));
    } finally {
      setDisconnecting(false);
    }
  }

  async function saveMeetFolder() {
    if (!meetFolderUrl.trim()) return;
    setSavingMeetFolder(true);
    setMeetFolderError("");
    try {
      await apiSend("/api/admin/drive-oauth/meet-folder", "PATCH", { folderUrl: meetFolderUrl.trim() });
      setStatus((prev) => (prev ? { ...prev, meetRecordingsFolderId: "set" } : prev));
      setEditingMeetFolder(false);
      setMeetFolderUrl("");
      router.refresh();
    } catch (err) {
      setMeetFolderError(err instanceof ApiError ? err.message : "השמירה נכשלה");
    } finally {
      setSavingMeetFolder(false);
    }
  }

  if (!status) return null;

  return (
    <div className="mb-6 bg-card border border-border rounded-2xl px-4 py-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-3.5">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink">חיבור לגוגל דרייב</div>
          <div className="text-xs text-muted mt-0.5">
            {!status.configured
              ? "טרם הוגדר בשרת"
              : status.connected
                ? `מחובר כ־${status.email}`
                : "לא מחובר — העלאות ילכו לאחסון של וורסל"}
          </div>
          {message && <div className="text-xs text-brand mt-1">{message}</div>}
        </div>
        {status.configured &&
          (status.connected ? (
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="text-xs text-danger underline cursor-pointer shrink-0 disabled:opacity-50"
            >
              {disconnecting ? "מנתק/ת…" : "ניתוק"}
            </button>
          ) : (
            <a
              href="/api/admin/drive-oauth/start"
              className="text-[12.5px] font-semibold text-brand border border-brand px-3 py-1.5 rounded-lg shrink-0"
            >
              חיבור לגוגל דרייב
            </a>
          ))}
      </div>

      {status.connected && (
        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] text-muted">תיקיית הקלטות Meet:</span>
            {status.meetRecordingsFolderId && !editingMeetFolder && (
              <>
                <span className="text-[13px] text-ink">מוגדרת</span>
                <button
                  onClick={() => setEditingMeetFolder(true)}
                  className="text-[11.5px] text-muted underline cursor-pointer"
                >
                  שינוי
                </button>
              </>
            )}
            {!status.meetRecordingsFolderId && !editingMeetFolder && (
              <button
                onClick={() => setEditingMeetFolder(true)}
                className="text-[13px] font-semibold text-brand underline cursor-pointer"
              >
                הגדרת תיקייה
              </button>
            )}
          </div>
          {editingMeetFolder && (
            <div className="flex items-center gap-2 mt-2">
              <Input
                autoFocus
                value={meetFolderUrl}
                onChange={(e) => setMeetFolderUrl(e.target.value)}
                placeholder="הדבק/י כאן קישור לתיקיית ה-Meet Recordings המשותפת"
                className="flex-1 min-w-0 py-1.5 px-2.5 text-[13px]"
              />
              <button
                onClick={saveMeetFolder}
                disabled={savingMeetFolder}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs cursor-pointer disabled:opacity-50"
              >
                {savingMeetFolder ? "שומר…" : "שמירה"}
              </button>
              <button
                onClick={() => {
                  setEditingMeetFolder(false);
                  setMeetFolderUrl("");
                  setMeetFolderError("");
                }}
                className="shrink-0 px-2.5 py-1.5 rounded-lg border border-border-strong text-muted text-xs cursor-pointer"
              >
                ביטול
              </button>
            </div>
          )}
          {meetFolderError && <div className="text-danger text-xs mt-1.5">{meetFolderError}</div>}
          <div className="text-[11.5px] text-muted mt-1.5">
            הקלטות חדשות בתיקייה הזו ייבדקו פעם ביום ויועברו אוטומטית לתיקיית הלקוח/ה המתאימ/ה, לפי שם שמופיע בשם ההקלטה.
          </div>
        </div>
      )}
    </div>
  );
}
