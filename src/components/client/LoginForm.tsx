"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { apiSend, ApiError } from "@/lib/api-client";
import { PasswordInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  useEffect(() => {
    setWebauthnSupported(browserSupportsWebAuthn());
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiSend("/api/client/login", "POST", { email, password });
      router.push("/app/home");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  async function onPasskeyLogin() {
    setError("");
    setPasskeyLoading(true);
    try {
      const optionsJSON = await apiSend("/api/client/passkey/login-options", "POST");
      const authResp = await startAuthentication({ optionsJSON });
      await apiSend("/api/client/passkey/login", "POST", authResp);
      router.push("/app/home");
      router.refresh();
    } catch (err) {
      console.error("Passkey login failed", err);
      setError(err instanceof ApiError ? err.message : "הכניסה בטביעת אצבע נכשלה, נסה/י עם סיסמה");
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4" dir="rtl">
      <div className="w-full max-w-[380px] flex flex-col items-center text-center">
        <Image
          src="/assets/logo.png"
          alt="חוזרים לבראשית"
          width={132}
          height={132}
          className="rounded-full shadow-[0_8px_24px_oklch(0.3_0.05_150_/_0.2)]"
        />
        <div className="font-heading font-bold text-[30px] text-brand-dark mt-6">חוזרים לבראשית</div>
        <div className="text-sm text-ink-soft mt-1.5">מרחב הליווי האישי שלך</div>

        <form onSubmit={onSubmit} className="w-full max-w-[280px] flex flex-col gap-3.5 mt-11">
          <input
            type="email"
            name="username"
            autoComplete="username"
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-[15px] rounded-2xl border border-border-strong bg-white/70 text-[15px] text-ink outline-none focus:border-brand"
          />
          <PasswordInput
            name="password"
            autoComplete="current-password"
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            inputClassName="w-full px-4 py-[15px] rounded-2xl border border-border-strong bg-white/70 text-[15px] text-ink outline-none focus:border-brand"
          />
          {error && <div className="text-danger text-[13px]">{error}</div>}
          <Button type="submit" disabled={loading} className="mt-1.5 py-4 rounded-2xl text-base">
            {loading ? "מתחבר/ת…" : "כניסה"}
          </Button>
          <Link href="/forgot-password" className="text-[13px] text-ink-soft underline mt-1">
            שכחתי סיסמה
          </Link>

          {webauthnSupported && (
            <>
              <div className="flex items-center gap-2.5 text-ink-soft text-xs my-1">
                <div className="flex-1 h-px bg-border-strong" />
                או
                <div className="flex-1 h-px bg-border-strong" />
              </div>
              <button
                type="button"
                onClick={onPasskeyLogin}
                disabled={passkeyLoading}
                className="w-full py-4 rounded-2xl border border-brand text-brand text-base font-semibold cursor-pointer disabled:opacity-50"
              >
                {passkeyLoading ? "מתחבר/ת…" : "כניסה בטביעת אצבע"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
