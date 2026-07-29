"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { InitialBadge } from "@/components/icons";
import { CopyableSecret } from "@/components/ui/CopyableSecret";
import { InlineEditableText } from "./InlineEditableText";
import { NewAdminModal } from "./NewAdminModal";
import { GoogleDriveConnectionCard } from "./GoogleDriveConnectionCard";

type AdminData = { id: string; email: string; name: string };

export function TeamView({ currentAdminId, admins }: { currentAdminId: string; admins: AdminData[] }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [banner, setBanner] = useState<{ name: string; tempPassword?: string } | null>(null);
  const [error, setError] = useState("");

  async function removeAdmin(admin: AdminData) {
    if (!confirm(`למחוק את הגישה של "${admin.name}" לפאנל הניהול?`)) return;
    setError("");
    try {
      await apiSend(`/api/admin/team/${admin.id}`, "DELETE");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "המחיקה נכשלה");
    }
  }

  async function saveField(admin: AdminData, field: "name" | "email", next: string) {
    setError("");
    try {
      await apiSend(`/api/admin/team/${admin.id}`, "PATCH", { [field]: next });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השמירה נכשלה");
    }
  }

  return (
    <div className="animate-fade-up">
      <GoogleDriveConnectionCard />

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-heading font-bold text-2xl text-ink">צוות</div>
          <div className="text-[13px] text-muted mt-0.5">מי שיש לו/ה גישה לפאנל הניהול</div>
        </div>
        <Button onClick={() => setShowModal(true)}>+ מנהל/ת חדש/ה</Button>
      </div>

      {banner && (
        <div className="mb-5 rounded-xl border border-brand-soft-2 bg-brand-soft-2 px-4 py-3 text-sm text-ink">
          חשבון של {banner.name} נוצר בהצלחה.{" "}
          {banner.tempPassword ? (
            <>
              שירות מייל לא מוגדר — יש למסור ידנית את הסיסמה הזמנית:{" "}
              <CopyableSecret value={banner.tempPassword} />
            </>
          ) : (
            "פרטי ההתחברות נשלחו לאימייל שהוזן."
          )}
          <button className="underline mr-3" onClick={() => setBanner(null)}>
            סגירה
          </button>
        </div>
      )}

      {error && <div className="mb-4 text-danger text-sm">{error}</div>}

      <div className="flex flex-col gap-2.5">
        {admins.map((admin) => (
          <div
            key={admin.id}
            className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3.5"
          >
            <InitialBadge label={admin.name.trim()[0] || "?"} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <InlineEditableText
                  value={admin.name}
                  textClassName="text-sm font-semibold text-ink truncate"
                  onSave={(next) => saveField(admin, "name", next)}
                />
                {admin.id === currentAdminId && <span className="text-muted text-xs shrink-0">(את/ה)</span>}
              </div>
              <InlineEditableText
                value={admin.email}
                textClassName="text-xs text-muted truncate"
                inputClassName="text-xs"
                onSave={(next) => saveField(admin, "email", next)}
              />
            </div>
            {admin.id !== currentAdminId && admins.length > 1 && (
              <button
                onClick={() => removeAdmin(admin)}
                className="text-xs text-danger underline cursor-pointer shrink-0"
              >
                הסרת גישה
              </button>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <NewAdminModal
          onClose={() => setShowModal(false)}
          onCreated={(info) => {
            setShowModal(false);
            setBanner(info);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
