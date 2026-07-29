import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isResponse } from "@/lib/guard";
import { shareWithServiceAccount } from "@/lib/google-drive-oauth";

// Re-shares an already-linked client folder with the display proxy's
// service account. Needed for folders linked before that sharing step
// existed — new folders (created or linked from now on) are shared
// automatically and never need this.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id }, select: { driveFolderId: true } });
  if (!client) return NextResponse.json({ error: "לא נמצא/ה" }, { status: 404 });
  if (!client.driveFolderId) return NextResponse.json({ error: "אין תיקיית דרייב מקושרת" }, { status: 400 });

  const result = await shareWithServiceAccount(client.driveFolderId);
  if (!result.ok) {
    if (result.reason === "not_configured") {
      return NextResponse.json(
        {
          error:
            "מנגנון התצוגה מהדרייב לא מוגדר בסביבת הייצור (חסר GOOGLE_SERVICE_ACCOUNT_KEY) — יש לבדוק בהגדרות ה-Environment Variables בוורסל, תחת Production.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: `השיתוף נכשל: ${result.detail || "שגיאה לא ידועה"}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
