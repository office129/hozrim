"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiSend, ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiSend("/api/admin/login", "POST", { email, password });
      router.push("/admin/clients");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4" dir="rtl">
      <div className="w-full max-w-[380px] bg-card border border-border rounded-[20px] px-8 py-9 shadow-[0_20px_40px_-20px_oklch(0.2_0.03_150_/_0.25)]">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/assets/logo.png"
            alt="חוזרים לבראשית"
            width={72}
            height={72}
            className="rounded-full shadow-[0_6px_16px_oklch(0.3_0.05_150_/_0.2)]"
          />
          <div className="font-heading font-bold text-xl text-brand-dark mt-4">פאנל ניהול לקוחות</div>
          <div className="text-[13px] text-muted mt-1">חוזרים לבראשית</div>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 mt-7">
          <Input
            type="email"
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="text-danger text-[13px]">{error}</div>}
          <Button type="submit" disabled={loading} className="mt-1">
            {loading ? "מתחבר/ת…" : "כניסה לניהול"}
          </Button>
        </form>
      </div>
    </div>
  );
}
