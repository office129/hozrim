"use client";

import { useState } from "react";
import { apiSend, ApiError } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function ProfileView({ email, name }: { email: string; name: string }) {
  const [displayName, setDisplayName] = useState(name);
  const [newPassword, setNewPassword] = useState("");
  const [indicator, setIndicator] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="bg-card border border-border rounded-[20px] p-[22px] flex flex-col gap-4">
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
        <Input
          type="password"
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
