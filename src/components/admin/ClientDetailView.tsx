"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { InitialBadge } from "@/components/icons";
import { CopyableSecret } from "@/components/ui/CopyableSecret";
import { InlineEditableText } from "./InlineEditableText";
import { SessionsTab } from "./SessionsTab";
import { ExercisesTab } from "./ExercisesTab";
import { NotesTab } from "./NotesTab";

type ClientDetail = {
  id: string;
  name: string;
  email: string;
  totalSessions: number;
  sessions: {
    id: string;
    number: number;
    title: string;
    mediaType: string | null;
    fileName: string | null;
    summaryText: string | null;
    summaryFileName: string | null;
  }[];
  exercises: { id: string; title: string; audioFileName: string | null; pdfFileName: string | null }[];
  notes: { sessionId: string; number: number; title: string; text: string | null }[];
};

const TABS = [
  { key: "sessions", label: "פגישות והקלטות" },
  { key: "exercises", label: "תרגולים" },
  { key: "notes", label: "הערות הלקוח/ה" },
] as const;

export function ClientDetailView({ client }: { client: ClientDetail }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("sessions");
  const [banner, setBanner] = useState<{ emailSent: boolean; tempPassword?: string } | null>(null);
  const [resetting, setResetting] = useState(false);

  async function resetPassword() {
    if (!confirm(`להנפיק סיסמה זמנית חדשה ל־${client.name}? הסיסמה הקודמת תפסיק לעבוד.`)) return;
    setResetting(true);
    setBanner(null);
    try {
      const data = await apiSend(`/api/admin/clients/${client.id}/reset-password`, "POST");
      setBanner(data);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <Link href="/admin/clients" className="text-brand text-sm inline-block mb-4">
        › חזרה לרשימת הלקוחות
      </Link>

      <div className="flex items-center gap-3.5 mb-6">
        <InitialBadge label={client.name.trim()[0] || "?"} size={52} />
        <div className="min-w-0 flex-1">
          <InlineEditableText
            value={client.name}
            textClassName="font-heading font-bold text-xl text-ink"
            onSave={async (next) => {
              await apiSend(`/api/admin/clients/${client.id}`, "PATCH", { name: next });
              router.refresh();
            }}
          />
          <div className="mt-0.5">
            <InlineEditableText
              value={client.email}
              textClassName="text-[13px] text-muted"
              inputClassName="text-[13px]"
              onSave={async (next) => {
                await apiSend(`/api/admin/clients/${client.id}`, "PATCH", { email: next });
                router.refresh();
              }}
            />
          </div>
        </div>
        <button
          onClick={resetPassword}
          disabled={resetting}
          className="text-[12.5px] font-semibold text-brand border border-brand px-3 py-1.5 rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
        >
          {resetting ? "יוצר/ת…" : "סיסמה זמנית חדשה"}
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-6 -mt-3">
        <span className="text-[13px] text-muted">מספר פגישות בתהליך:</span>
        <InlineEditableText
          value={String(client.totalSessions)}
          textClassName="text-[13px] font-semibold text-ink"
          inputClassName="text-[13px] w-16"
          onSave={async (next) => {
            const parsed = Math.max(1, Math.min(30, parseInt(next, 10) || client.totalSessions));
            await apiSend(`/api/admin/clients/${client.id}`, "PATCH", { totalSessions: parsed });
            router.refresh();
          }}
        />
      </div>

      {banner && (
        <div className="mb-5 rounded-xl border border-brand-soft-2 bg-brand-soft-2 px-4 py-3 text-sm text-ink">
          {banner.tempPassword ? (
            <>
              שירות מייל לא מוגדר — יש למסור ידנית את הסיסמה הזמנית החדשה:{" "}
              <CopyableSecret value={banner.tempPassword} />
            </>
          ) : (
            "הסיסמה החדשה נשלחה לאימייל של הלקוח/ה."
          )}
          <button className="underline mr-3" onClick={() => setBanner(null)}>
            סגירה
          </button>
        </div>
      )}

      <div className="flex gap-1.5 border-b border-border mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2.5 text-sm font-semibold cursor-pointer"
            style={{
              color: tab === t.key ? "var(--color-brand)" : "var(--color-muted-2)",
              borderBottom: `2px solid ${tab === t.key ? "var(--color-brand)" : "transparent"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sessions" && <SessionsTab clientId={client.id} sessions={client.sessions} />}
      {tab === "exercises" && <ExercisesTab clientId={client.id} exercises={client.exercises} />}
      {tab === "notes" && <NotesTab notes={client.notes} />}
    </div>
  );
}
