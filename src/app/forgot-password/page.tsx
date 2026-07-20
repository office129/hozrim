"use client";

import { useState } from "react";
import { apiSend } from "@/lib/api-client";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiSend("/api/client/forgot-password", "POST", { email });
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4" dir="rtl">
      <div className="w-full max-w-[380px] text-center">
        {!sent ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 items-center">
            <div className="font-heading font-bold text-2xl text-brand-dark">שחזור סיסמה</div>
            <div className="text-sm text-ink-soft">נשלח אליך קישור לאיפוס הסיסמה לכתובת האימייל שהזנת</div>
            <Input
              type="email"
              placeholder="אימייל"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="max-w-[280px]"
            />
            <Button type="submit" disabled={loading} className="max-w-[280px] w-full">
              {loading ? "שולח/ת…" : "שליחת קישור"}
            </Button>
            <a href="/login" className="text-[13px] text-ink-soft underline">
              חזרה למסך הכניסה
            </a>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-soft flex items-center justify-center">
              <div className="w-6 h-[18px] border-2 border-brand rounded-sm" />
            </div>
            <div className="font-heading font-bold text-[22px] text-brand-dark">שלחנו לך קישור לאיפוס</div>
            <div className="text-sm text-ink-soft max-w-[280px] leading-relaxed">
              אם קיים חשבון תחת <b>{email}</b>, תוך רגע יגיע אליו מייל עם קישור לאיפוס הסיסמה
            </div>
            <a
              href="/login"
              className="mt-4 px-7 py-3.5 rounded-2xl border border-brand text-brand text-sm font-semibold"
            >
              חזרה למסך הכניסה
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
