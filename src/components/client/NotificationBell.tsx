"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/lib/api-client";

type Notification = {
  id: string;
  type: string;
  title: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell({
  showFirstTimeTip,
  onDismissFirstTimeTip,
}: {
  showFirstTimeTip?: boolean;
  onDismissFirstTimeTip?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet("/api/client/notifications")
      .then((data) => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && showFirstTimeTip) onDismissFirstTimeTip?.();
    if (next && unreadCount > 0) {
      setUnreadCount(0);
      apiSend("/api/client/notifications/read", "POST").catch(() => {});
    }
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={toggleOpen}
        aria-label="התראות"
        className="relative w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-on-brand cursor-pointer"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10.5px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {showFirstTimeTip && !open && (
        <div className="absolute top-[calc(100%+10px)] left-0 z-20 w-[200px] animate-fade-up">
          <div className="absolute -top-1.5 left-3 w-3 h-3 bg-card rotate-45" />
          <div className="relative bg-card rounded-2xl shadow-lg p-3.5">
            <div className="text-[13px] text-ink leading-relaxed">
              כאן תופיע התראה בכל פעם שמפגש או תרגול חדש מתווסף לך.
            </div>
            <button
              onClick={onDismissFirstTimeTip}
              className="mt-2 text-[12.5px] font-semibold text-brand cursor-pointer"
            >
              הבנתי
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="absolute top-[calc(100%+10px)] left-0 z-30 w-[280px] animate-fade-up">
          <div className="absolute -top-1.5 left-3 w-3 h-3 bg-card rotate-45" />
          <div className="relative bg-card rounded-2xl shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-sm font-semibold text-ink">התראות</div>
            <div className="max-h-[340px] overflow-y-auto">
              {notifications.length === 0 && (
                <div className="px-4 py-6 text-[13px] text-muted text-center">אין התראות עדיין</div>
              )}
              {notifications.map((n) => {
                const content = (
                  <div className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-cream-2 transition">
                    <div className="text-[13px] text-ink leading-snug">{n.title}</div>
                    <div className="text-[11px] text-muted mt-1">
                      {new Date(n.createdAt).toLocaleDateString("he-IL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                );
                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
