"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiSend, apiUpload, ApiError } from "@/lib/api-client";
import { Input, Label, PasswordInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

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
      const form = new FormData();
      form.append("file", file);
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
    </div>
  );
}
