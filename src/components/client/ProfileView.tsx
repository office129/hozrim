"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { apiGet, apiSend, apiUpload, ApiError } from "@/lib/api-client";
import { resizeAvatarFile } from "@/lib/resizeImage";
import { Input, Label, PasswordInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type Passkey = { id: string; createdAt: string };

export function ProfileView({
  email,
  name,
  avatarUrl,
}: {
  email: string;
  name: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [newPassword, setNewPassword] = useState("");
  const [indicator, setIndicator] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  const [passkeyMsg, setPasskeyMsg] = useState("");

  useEffect(() => {
    if (!browserSupportsWebAuthn()) return;
    setWebauthnSupported(true);
    apiGet("/api/client/passkey")
      .then((data) => setPasskeys(data.passkeys))
      .catch(() => {});
  }, []);

  async function addPasskey() {
    setPasskeyError("");
    setPasskeyMsg("");
    setAddingPasskey(true);
    try {
      const optionsJSON = await apiSend("/api/client/passkey/register-options", "POST");
      const attResp = await startRegistration({ optionsJSON });
      await apiSend("/api/client/passkey/register", "POST", attResp);
      setPasskeyMsg("כניסה בטביעת אצבע נוספה בהצלחה");
      const data = await apiGet("/api/client/passkey");
      setPasskeys(data.passkeys);
    } catch (err) {
      console.error("Passkey registration failed", err);
      setPasskeyError(err instanceof ApiError ? err.message : "לא הצלחנו להוסיף — ודא/י שהמכשיר תומך בטביעת אצבע/זיהוי פנים");
    } finally {
      setAddingPasskey(false);
    }
  }

  async function removePasskey(id: string) {
    if (!confirm("להסיר את הכניסה בטביעת אצבע הזו?")) return;
    setPasskeyError("");
    try {
      await apiSend(`/api/client/passkey/${id}`, "DELETE");
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setPasskeyError(err instanceof ApiError ? err.message : "ההסרה נכשלה");
    }
  }

  async function logout() {
    await apiSend("/api/client/logout", "POST");
    router.push("/login");
    router.refresh();
  }

  async function save() {
    setError("");
    setLoading(true);
    try {
      await apiSend("/api/client/me", "PATCH", { name: displayName, newPassword: newPassword || undefined });
      setIndicator("השינויים נשמרו");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  async function onAvatarChosen(file: File) {
    setError("");
    setAvatarUploading(true);
    try {
      const resized = await resizeAvatarFile(file);
      const form = new FormData();
      form.append("file", resized);
      const data = await apiUpload("/api/client/me/avatar", form);
      setAvatar(data.avatarUrl);
      router.refresh();
    } catch (err) {
      console.error("Avatar upload failed", err);
      setError(err instanceof ApiError ? err.message : "העלאת התמונה נכשלה");
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-[20px] p-[22px] flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-brand-soft flex items-center justify-center overflow-hidden shrink-0">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="font-heading font-bold text-xl text-brand">{(name.trim()[0] || "?").toUpperCase()}</span>
          )}
        </div>
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="text-[12.5px] font-semibold text-brand border border-brand px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {avatarUploading ? "מעלה…" : avatar ? "החלפת תמונה" : "הוספת תמונה"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAvatarChosen(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div>
        <Label>אימייל (לא ניתן לשינוי)</Label>
        <div className="px-3.5 py-3 rounded-xl bg-[oklch(0.93_0.015_150)] text-[oklch(0.55_0.02_150)] text-sm">
          {email}
        </div>
      </div>
      <div>
        <Label>שם משתמש</Label>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div>
        <Label>סיסמה חדשה</Label>
        <PasswordInput
          placeholder="השאירו ריק כדי לא לשנות"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      {error && <div className="text-danger text-[13px]">{error}</div>}
      <Button onClick={save} disabled={loading}>
        {loading ? "שומר…" : "שמירת שינויים"}
      </Button>
      {indicator && <div className="text-xs text-muted text-center">{indicator}</div>}

      {webauthnSupported && (
        <div className="pt-3 border-t border-border flex flex-col gap-2.5">
          <Label>כניסה בטביעת אצבע</Label>
          {passkeys.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-tile text-sm">
              <span className="text-ink">
                נוסף בתאריך {new Date(p.createdAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </span>
              <button onClick={() => removePasskey(p.id)} className="text-danger text-xs underline cursor-pointer">
                הסרה
              </button>
            </div>
          ))}
          <button
            onClick={addPasskey}
            disabled={addingPasskey}
            className="text-[12.5px] font-semibold text-brand border border-brand px-3 py-2 rounded-lg cursor-pointer disabled:opacity-50 self-start"
          >
            {addingPasskey ? "מוסיף/ה…" : "+ הוספת כניסה בטביעת אצבע"}
          </button>
          {passkeyError && <div className="text-danger text-[13px]">{passkeyError}</div>}
          {passkeyMsg && <div className="text-xs text-muted">{passkeyMsg}</div>}
        </div>
      )}
      <button onClick={logout} className="text-[13px] text-muted underline text-center cursor-pointer mt-1">
        התנתקות
      </button>
    </div>
  );
}
