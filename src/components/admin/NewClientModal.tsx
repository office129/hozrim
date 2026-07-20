"use client";

import { useState } from "react";
import { apiSend, ApiError } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function NewClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (info: { tempPassword?: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sessionCount, setSessionCount] = useState(6);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim() || !email.trim()) return;
    setError("");
    setLoading(true);
    try {
      const data = await apiSend("/api/admin/clients", "POST", { name, email, sessionCount });
      onCreated({ tempPassword: data.tempPassword, name });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[380px] bg-card rounded-[18px] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-heading font-bold text-lg text-ink mb-4">לקוח/ה חדש/ה</div>
        <div className="flex flex-col gap-3">
          <div>
            <Label>שם מלא</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא" />
          </div>
          <div>
            <Label>אימייל להתחברות</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="אימייל להתחברות"
            />
          </div>
          <div>
            <Label>כמה פגישות בתהליך שלו/ה</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={sessionCount}
              onChange={(e) => setSessionCount(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          {error && <div className="text-danger text-[13px]">{error}</div>}
        </div>
        <div className="flex gap-2.5 mt-5">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            ביטול
          </Button>
          <Button className="flex-1" onClick={submit} disabled={loading}>
            {loading ? "יוצר/ת…" : "יצירת חשבון"}
          </Button>
        </div>
        <div className="text-[11.5px] text-muted-2 mt-3 text-center">
          סיסמה זמנית תישלח אוטומטית לאימייל שהוזן
        </div>
      </div>
    </div>
  );
}
