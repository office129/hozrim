"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { apiSend } from "@/lib/api-client";

const NAV = [
  { href: "/admin/clients", label: "לקוחות", match: "/admin/clients" },
  { href: "/admin/library", label: "ספריית תכנים", match: "/admin/library" },
  { href: "/admin/team", label: "צוות", match: "/admin/team" },
];

export function AdminShell({
  adminEmail,
  children,
}: {
  adminEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await apiSend("/api/admin/logout", "POST");
    router.push("/admin/login");
    router.refresh();
  }

  const navItems = NAV.map((item) => ({
    ...item,
    active: pathname?.startsWith(item.match) ?? false,
  }));

  return (
    <div className="min-h-screen flex flex-col md:flex-row" dir="rtl">
      {/* Mobile topbar */}
      <div className="md:hidden sticky top-0 z-10 flex items-center justify-between bg-brand-dark px-[18px] py-3.5">
        <div className="text-on-brand font-semibold text-[15px]">פאנל ניהול</div>
        <Image src="/assets/logo.png" alt="" width={30} height={30} className="rounded-full" />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] shrink-0 bg-brand-dark min-h-screen px-[18px] py-6 flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <Image src="/assets/logo.png" alt="" width={38} height={38} className="rounded-full" />
          <div>
            <div className="font-heading font-bold text-on-brand text-[15px]">חוזרים לבראשית</div>
            <div className="text-on-brand/60 text-[11px]">פאנל ניהול לקוחות</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="cursor-pointer px-3.5 py-2.5 rounded-[10px] text-sm transition"
              style={{
                background: item.active ? "oklch(1 0 0 / 0.12)" : "transparent",
                color: item.active ? "var(--color-on-brand)" : "oklch(0.85 0.02 90 / 0.75)",
                fontWeight: item.active ? 600 : 400,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <div className="text-on-brand/45 text-[11px] truncate">מחוברת כ־{adminEmail}</div>
          <button onClick={logout} className="text-on-brand/70 text-[12px] text-right hover:underline cursor-pointer">
            התנתקות
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav (simple, since sidebar is hidden) */}
      <nav className="md:hidden order-3 flex border-t border-border bg-card px-2 py-2.5 sticky bottom-0">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 text-center py-2 text-[13px]"
            style={{
              color: item.active ? "var(--color-brand)" : "var(--color-muted)",
              fontWeight: item.active ? 600 : 400,
            }}
          >
            {item.label}
          </Link>
        ))}
        <button onClick={logout} className="flex-1 text-center py-2 text-[13px] text-muted">
          יציאה
        </button>
      </nav>

      <main className="flex-1 min-w-0 px-5 py-6 md:px-10 md:py-9">{children}</main>
    </div>
  );
}
