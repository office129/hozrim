"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { InitialBadge } from "@/components/icons";
import { NewClientModal } from "./NewClientModal";

type ClientOverview = {
  id: string;
  name: string;
  email: string;
  total: number;
  done: number;
  progressPct: number;
  stageName: string;
};

export function ClientsListView({ initialClients }: { initialClients: ClientOverview[] }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [banner, setBanner] = useState<{ name: string; tempPassword?: string } | null>(null);

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-heading font-bold text-2xl text-ink">לקוחות</div>
          <div className="text-[13px] text-muted mt-0.5">{initialClients.length} לקוחות פעילים בתהליך</div>
        </div>
        <Button onClick={() => setShowModal(true)}>+ לקוח/ה חדש/ה</Button>
      </div>

      {banner && (
        <div className="mb-5 rounded-xl border border-brand-soft-2 bg-brand-soft-2 px-4 py-3 text-sm text-ink">
          חשבון של {banner.name} נוצר בהצלחה.{" "}
          {banner.tempPassword ? (
            <>
              שירות מייל לא מוגדר — יש למסור ידנית את הסיסמה הזמנית:{" "}
              <b className="font-mono">{banner.tempPassword}</b>
            </>
          ) : (
            "פרטי ההתחברות נשלחו לאימייל שהוזן."
          )}
          <button className="underline mr-3" onClick={() => setBanner(null)}>
            סגירה
          </button>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {initialClients.map((c) => (
          <Link
            key={c.id}
            href={`/admin/clients/${c.id}`}
            className="bg-card border border-border rounded-2xl p-[18px] hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <InitialBadge label={c.name.trim()[0] || "?"} />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-ink truncate">{c.name}</div>
                <div className="text-xs text-muted truncate">{c.email}</div>
              </div>
            </div>
            <div className="mt-3.5">
              <div className="flex justify-between text-xs text-muted mb-1.5">
                <span>{c.stageName}</span>
                <span>
                  {c.done}/{c.total}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[oklch(0.92_0.02_150)]">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${c.progressPct}%` }}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {initialClients.length === 0 && (
        <div className="text-center py-16 text-muted text-sm">עדיין אין לקוחות — התחילו ביצירת לקוח/ה חדש/ה</div>
      )}

      {showModal && (
        <NewClientModal
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
