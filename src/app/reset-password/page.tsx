"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiSend, ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

function ResetPasswordForm() {
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
      await apiSend("/api/client/reset-password", "POST", { token, newPassword });
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4 items-center w-full max-w-[280px]">
      <div className="font-heading font-bold text-2xl text-brand-dark">בחירת סיסמה חדשה</div>
      <Input
        type="password"
        placeholder="סיסמה חדשה (6 תווים לפחות)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
        minLength={6}
        className="w-full"
      />
      {error && <div className="text-danger text-[13px]">{error}</div>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "מעדכן/ת…" : "עדכון סיסמה"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4" dir="rtl">
      <div className="w-full max-w-[380px] text-center flex items-center justify-center">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
