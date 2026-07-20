"use client";

import { useState } from "react";
import { apiSend } from "@/lib/api-client";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiSend("/api/admin/forgot-password", "POST", { email });
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4" dir="rtl">
      <div className="w-full max-w-[380px] bg-card border border-border rounded-[20px] px-8 py-9 shadow-[0_20px_40px_-20px_oklch(0.2_0.03_150_/_0.25)] text-center">
        {!sent ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 items-center">
            <div className="font-heading font-bold text-xl text-brand-dark">שחזור סיסמת ניהול</div>
            <div className="text-sm text-muted">נשלח אליך קישור לאיפוס הסיסמה לכתובת האימייל שהזנת</div>
            <Input
              type="email"
              placeholder="אימייל"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "שולח/ת…" : "שליחת קישור"}
            </Button>
            <a href="/admin/login" className="text-[13px] text-muted underline">
              חזרה למסך הכניסה
            </a>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-soft flex items-center justify-center">
              <div className="w-6 h-[18px] border-2 border-brand rounded-sm" />
            </div>
            <div className="font-heading font-bold text-lg text-brand-dark">שלחנו לך קישור לאיפוס</div>
            <div className="text-sm text-muted leading-relaxed">
              אם קיים חשבון ניהול תחת <b>{email}</b>, תוך רגע יגיע אליו מייל עם קישור לאיפוס הסיסמה
            </div>
            <a
              href="/admin/login"
              className="mt-2 px-7 py-3.5 rounded-2xl border border-brand text-brand text-sm font-semibold"
            >
              חזרה למסך הכניסה
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
