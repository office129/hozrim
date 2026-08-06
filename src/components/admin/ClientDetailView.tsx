"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";
import { InitialBadge } from "@/components/icons";
import { CopyableSecret } from "@/components/ui/CopyableSecret";
import { InlineEditableText } from "./InlineEditableText";
import { ClientDriveFolderRow } from "./ClientDriveFolderRow";
import { SessionsTab } from "./SessionsTab";
import { ExercisesTab } from "./ExercisesTab";
import { NotesTab } from "./NotesTab";

type ClientDetail = {
  id: string;
  name: string;
  email: string;
  totalSessions: number;
  driveFolderId: string | null;
  firstLoginAt: string | null;
  lastActiveAt: string | null;
  sessions: {
    id: string;
    number: number;
    title: string;
    mediaType: string | null;
    fileName: string | null;
    summaryText: string | null;
    summaryFiles: { id: string; url: string; fileName: string }[];
    viewedAt: string | null;
  }[];
  exercises: {
    id: string;
    number: number;
    title: string;
    audioFileName: string | null;
    pdfFileName: string | null;
    folderId: string | null;
  }[];
  exerciseFolders: {
    id: string;
    title: string;
    items: {
      id: string;
      number: number;
      title: string;
      audioFileName: string | null;
      pdfFileName: string | null;
      folderId: string | null;
    }[];
  }[];
  notes: { sessionId: string; number: number; title: string; text: string | null }[];
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const [deleting, setDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function createPreviewLink() {
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const data = await apiSend(`/api/admin/clients/${client.id}/preview-link`, "POST");
      setPreviewUrl(data.url);
    } finally {
      setPreviewLoading(false);
    }
  }

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

  async function deleteClient() {
    if (
      !confirm(
        `למחוק לצמיתות את ${client.name}? כל הפגישות, ההקלטות, התרגולים והיומן שלו/ה יימחקו ולא ניתן יהיה לשחזר. הפעולה בלתי הפיכה.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await apiSend(`/api/admin/clients/${client.id}`, "DELETE");
      router.push("/admin/clients");
      router.refresh();
    } catch {
      setDeleting(false);
      alert("המחיקה נכשלה, נסה/י שוב");
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
          onClick={createPreviewLink}
          disabled={previewLoading}
          className="text-[12.5px] font-semibold text-brand border border-brand px-3 py-1.5 rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
        >
          {previewLoading ? "יוצר/ת…" : "קישור תצוגה מקדימה"}
        </button>
        <button
          onClick={resetPassword}
          disabled={resetting}
          className="text-[12.5px] font-semibold text-brand border border-brand px-3 py-1.5 rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
        >
          {resetting ? "יוצר/ת…" : "סיסמה זמנית חדשה"}
        </button>
        <button
          onClick={deleteClient}
          disabled={deleting}
          className="text-[12.5px] font-semibold text-danger border border-danger px-3 py-1.5 rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
        >
          {deleting ? "מוחק/ת…" : "מחיקת לקוח/ה"}
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-3 -mt-3">
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-[12.5px] text-muted">
        <span>
          כניסה ראשונה:{" "}
          <span className="text-ink">{client.firstLoginAt ? formatDateTime(client.firstLoginAt) : "טרם נכנס/ה לאפליקציה"}</span>
        </span>
        {client.lastActiveAt && (
          <span>
            פעילות אחרונה: <span className="text-ink">{formatDateTime(client.lastActiveAt)}</span>
          </span>
        )}
      </div>

      <ClientDriveFolderRow clientId={client.id} driveFolderId={client.driveFolderId} />

      {previewUrl && (
        <div className="mb-5 rounded-xl border border-brand-soft-2 bg-brand-soft-2 px-4 py-3 text-sm text-ink">
          קישור זמני (בתוקף לשעה) לצפייה באפליקציה כפי שהלקוח/ה רואה אותה, ללא היומן האישי:{" "}
          <CopyableSecret value={previewUrl} />{" "}
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-semibold text-brand underline">
            פתיחה
          </a>
          <button className="underline mr-3" onClick={() => setPreviewUrl(null)}>
            סגירה
          </button>
        </div>
      )}

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
      {tab === "exercises" && (
        <ExercisesTab clientId={client.id} exercises={client.exercises} folders={client.exerciseFolders} />
      )}
      {tab === "notes" && <NotesTab notes={client.notes} />}
    </div>
  );
}
