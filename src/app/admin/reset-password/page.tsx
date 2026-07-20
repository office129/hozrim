"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiSend, ApiError } from "@/lib/api-client";
import { PasswordInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

function AdminResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiSend("/api/admin/reset-password", "POST", { token, newPassword });
      setDone(true);
      setTimeout(() => router.push("/admin/login"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return <div className="text-danger text-sm">קישור לא תקין. יש לבקש קישור חדש מדף שכחתי סיסמה.</div>;
  }

  if (done) {
    return <div className="text-ink text-sm">הסיסמה עודכנה בהצלחה, מעביר/ה אותך להתחברות…</div>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 items-center w-full">
      <div className="font-heading font-bold text-xl text-brand-dark">בחירת סיסמת ניהול חדשה</div>
      <PasswordInput
        placeholder="סיסמה חדשה (6 תווים לפחות)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
        minLength={6}
        wrapperClassName="w-full"
      />
      {error && <div className="text-danger text-[13px]">{error}</div>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "מעדכן/ת…" : "עדכון סיסמה"}
      </Button>
    </form>
  );
}

export default function AdminResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4" dir="rtl">
      <div className="w-full max-w-[380px] bg-card border border-border rounded-[20px] px-8 py-9 shadow-[0_20px_40px_-20px_oklch(0.2_0.03_150_/_0.25)] text-center flex items-center justify-center">
        <Suspense fallback={null}>
          <AdminResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
