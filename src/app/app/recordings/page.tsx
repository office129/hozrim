import Link from "next/link";
import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(d: Date) {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

export default async function RecordingsPage() {
  const clientId = (await getClientId())!;
  const sessions = await prisma.lessonSession.findMany({
    where: { clientId },
    orderBy: { number: "asc" },
  });

  return (
    <div className="p-6 md:p-0 pb-8 animate-fade-up">
      <div className="font-heading font-bold text-[19px] md:text-2xl text-ink mb-4 md:mb-6">הפגישות המוקלטות</div>
      <div className="grid md:grid-cols-2 gap-2.5 md:gap-3">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/app/recordings/${s.id}`}
            className="flex items-center gap-3.5 bg-card border border-border rounded-2xl px-3.5 py-3"
          >
            <div
              className="w-[46px] h-[46px] rounded-xl shrink-0 flex items-center justify-center font-heading font-bold text-base"
              style={{
                background: s.completed ? "var(--color-brand)" : "oklch(0.9 0.02 150)",
                color: s.completed ? "var(--color-on-brand)" : "oklch(0.45 0.02 150)",
              }}
            >
              {s.number}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink truncate">{s.title}</div>
              <div className="text-xs text-muted mt-0.5">{formatDate(s.createdAt)}</div>
            </div>
            <div
              className="text-[11px] font-semibold shrink-0"
              style={{ color: s.completed ? "var(--color-brand)" : "var(--color-muted)" }}
            >
              {s.completed ? "הושלם" : "לצפייה"}
            </div>
          </Link>
        ))}
      </div>
      {sessions.length === 0 && (
        <div className="text-center py-16 text-muted text-sm">עדיין אין פגישות מתועדות</div>
      )}
    </div>
  );
}
