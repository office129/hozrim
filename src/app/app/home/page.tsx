import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Waveform, DocIcon } from "@/components/icons";

export default async function HomePage() {
  const clientId = (await getClientId())!;
  const [client, sessions] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { totalSessions: true } }),
    prisma.lessonSession.findMany({ where: { clientId }, orderBy: { number: "asc" } }),
  ]);
  // A stale session cookie can outlive the client it belonged to (e.g. the
  // account was deleted in admin) — the layout normally catches this, but
  // don't crash here either if it slips through.
  if (!client) redirect("/login");

  // If more sessions actually exist than the coach originally planned for
  // (e.g. the process ran longer than expected), the displayed total
  // should reflect reality rather than show progress past 100% - this
  // only affects what's shown here, not the totalSessions the coach set.
  const totalCount = Math.max(client.totalSessions, sessions.length);
  const completedCount = sessions.filter((s) => s.completed).length;
  const current = sessions.find((s) => !s.completed) || sessions[sessions.length - 1] || null;
  const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="p-6 md:p-0 animate-fade-up">
      <div className="grid md:grid-cols-3 gap-4 md:gap-5">
        <div className="md:col-span-2 bg-card border border-border rounded-[20px] p-[22px]">
          <div className="flex justify-between items-baseline">
            <div className="text-sm text-muted">התקדמות בתהליך</div>
            <div className="text-sm font-semibold text-brand">
              {completedCount} מתוך {totalCount}
            </div>
          </div>
          <div className="w-full h-2.5 rounded-md bg-[oklch(0.92_0.02_150)] mt-3 overflow-hidden">
            <div
              className="h-full rounded-md bg-gradient-to-r from-brand to-gold"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {current && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-[13px] text-muted">השלב הנוכחי</div>
              <div className="font-heading font-semibold text-lg text-ink mt-1">{current.title}</div>
            </div>
          )}
          <Link
            href="/app/roadmap"
            className="block mt-3.5 pt-3.5 border-t border-border text-[13px] text-brand underline"
          >
            לחומרי הפתיחה של התהליך ‹
          </Link>
        </div>

        <div className="hidden md:flex flex-col gap-3">
          <Link
            href="/app/recordings"
            className="bg-card border border-border rounded-[18px] p-[18px] flex flex-col gap-2"
          >
            <Waveform />
            <div className="text-sm font-semibold text-ink">הקלטות</div>
            <div className="text-xs text-muted">האזנה חוזרת לפגישות</div>
          </Link>
          <Link
            href="/app/exercises"
            className="bg-card border border-border rounded-[18px] p-[18px] flex flex-col gap-2"
          >
            <DocIcon />
            <div className="text-sm font-semibold text-ink">תרגולים</div>
            <div className="text-xs text-muted">חומרים לתרגול עצמי</div>
          </Link>
        </div>
      </div>

      <div className="md:hidden grid grid-cols-2 gap-3 mt-4">
        <Link href="/app/recordings" className="bg-card border border-border rounded-[18px] p-[18px] flex flex-col gap-2">
          <div className="w-[34px] h-[34px] rounded-full bg-brand-soft flex items-center justify-center">
            <Waveform />
          </div>
          <div className="text-sm font-semibold text-ink">הקלטות</div>
          <div className="text-xs text-muted">האזנה חוזרת לפגישות</div>
        </Link>
        <Link href="/app/exercises" className="bg-card border border-border rounded-[18px] p-[18px] flex flex-col gap-2">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-brand-soft flex items-center justify-center">
            <DocIcon />
          </div>
          <div className="text-sm font-semibold text-ink">תרגולים</div>
          <div className="text-xs text-muted">חומרים לתרגול עצמי</div>
        </Link>
      </div>

      {current && (
        <div className="mt-5">
          <div className="text-[13px] text-muted mb-2.5">הפגישה הבאה שלך</div>
          <Link
            href={`/app/recordings/${current.id}`}
            className="flex items-center justify-between rounded-[18px] p-[18px] bg-gradient-to-br from-brand to-brand-light"
          >
            <div>
              <div className="text-xs text-on-brand/70">פגישה {current.number}</div>
              <div className="text-base font-semibold text-on-brand mt-0.5">{current.title}</div>
            </div>
            <div className="w-[38px] h-[38px] rounded-full bg-gold shrink-0 flex items-center justify-center">
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "7px solid transparent",
                  borderBottom: "7px solid transparent",
                  borderRight: "11px solid var(--color-gold-ink)",
                  marginRight: -3,
                }}
              />
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
