"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";

const NAV = [
  { href: "/app/home", label: "בית" },
  { href: "/app/roadmap", label: "תחילת התהליך" },
  { href: "/app/recordings", label: "הקלטות" },
  { href: "/app/exercises", label: "תרגולים" },
  { href: "/app/journal", label: "יומן אישי" },
];

export function ClientShell({
  clientName,
  avatarUrl,
  children,
}: {
  clientName: string;
  avatarUrl?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isProfile = pathname === "/app/profile";

  async function logout() {
    await apiSend("/api/client/logout", "POST");
    router.push("/login");
    router.refresh();
  }

  const items = NAV.map((item) => ({
    ...item,
    active: item.href === "/app/recordings" ? pathname?.startsWith(item.href) : pathname === item.href,
  }));

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-cream-2" dir="rtl">
      {/* Desktop-only sidebar chrome */}
      <aside className="hidden md:flex w-64 shrink-0 bg-brand-dark min-h-screen px-5 py-7 flex-col gap-7">
        <div className="flex items-center gap-2.5">
          <Image src="/assets/logo.png" alt="" width={40} height={40} className="rounded-full" />
          <div>
            <div className="font-heading font-bold text-on-brand text-[15px]">חוזרים לבראשית</div>
            <div className="text-on-brand/60 text-[11px]">מרחב הליווי האישי שלך</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3.5 py-2.5 rounded-[10px] text-sm transition"
              style={{
                background: item.active ? "oklch(1 0 0 / 0.12)" : "transparent",
                color: item.active ? "var(--color-on-brand)" : "oklch(0.85 0.02 90 / 0.75)",
                fontWeight: item.active ? 600 : 400,
              }}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/app/profile"
            className="px-3.5 py-2.5 rounded-[10px] text-sm transition mt-2 border-t border-white/10 pt-4"
            style={{
              color: isProfile ? "var(--color-on-brand)" : "oklch(0.85 0.02 90 / 0.75)",
              fontWeight: isProfile ? 600 : 400,
            }}
          >
            האזור האישי שלי
          </Link>
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <div className="text-on-brand/45 text-[11px] truncate">מחובר/ת כ־{clientName}</div>
          <button onClick={logout} className="text-on-brand/70 text-[12px] text-right hover:underline cursor-pointer">
            התנתקות
          </button>
        </div>
      </aside>

      {/* Shared frame: phone-shell card on mobile, plain flexible column on desktop */}
      <div className="flex-1 flex justify-center md:justify-start">
        <div className="w-full sm:max-w-[412px] md:max-w-none sm:min-h-[844px] md:min-h-screen min-h-screen bg-cream sm:rounded-[28px] md:rounded-none shadow-[0_30px_60px_-20px_oklch(0.2_0.03_150_/_0.35),0_0_0_1px_oklch(0.9_0.02_150)] md:shadow-none overflow-hidden flex flex-col relative sm:my-8 md:my-0 mx-auto md:mx-0">
          <div className="px-6 md:px-10 pt-[22px] md:pt-8 pb-4 md:pb-6 bg-gradient-to-b from-brand-dark to-brand-light md:rounded-none rounded-b-[24px] shrink-0">
            {isProfile ? (
              <div className="flex items-center gap-2.5">
                <button onClick={() => router.back()} className="text-on-brand text-sm cursor-pointer">
                  ›
                </button>
                <div className="font-heading font-bold text-xl text-on-brand">האזור האישי שלי</div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-on-brand/70 text-[13px]">שלום, {clientName}</div>
                  <div className="font-heading font-bold text-xl text-on-brand mt-0.5">המסע שלך</div>
                </div>
                <Link
                  href="/app/profile"
                  className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-on-brand text-sm font-bold overflow-hidden shrink-0"
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (clientName.trim()[0] || "?").toUpperCase()
                  )}
                </Link>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="md:max-w-3xl md:mx-auto">{children}</div>
          </div>

          {!isProfile && (
            <nav className="md:hidden shrink-0 flex border-t border-border bg-card px-2 pt-2.5 pb-3.5">
              {items.map((item) => (
                <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: item.active ? "var(--color-brand)" : "var(--color-border-strong)" }}
                  />
                  <div
                    className="text-[11px]"
                    style={{
                      color: item.active ? "var(--color-ink)" : "var(--color-muted)",
                      fontWeight: item.active ? 600 : 400,
                    }}
                  >
                    {item.label}
                  </div>
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
