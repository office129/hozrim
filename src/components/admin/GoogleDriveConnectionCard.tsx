"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/lib/api-client";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "האישור בוטל — לא נתת גישה לדרייב",
  invalid_state: "הבקשה פגה, נסה/י שוב",
  connect_failed: "החיבור נכשל, נסה/י שוב",
};

export function GoogleDriveConnectionCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(
    null
  );
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiGet("/api/admin/drive-oauth/status")
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false, email: null }));

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

  if (!status) return null;

  return (
    <div className="mb-6 bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3.5">
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
  );
}
