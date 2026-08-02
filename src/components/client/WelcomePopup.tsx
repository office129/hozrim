"use client";

import { Button } from "@/components/ui/Button";

// Shown once, the very first time a brand-new client opens the app (see
// hasSeenWelcomePopup on Client) - existing clients from before this
// feature shipped were backfilled to "already seen" in the migration, so
// this never surprises someone who's already using the app.
export function WelcomePopup({ clientName, onConfirm }: { clientName: string; onConfirm: () => void }) {
  const firstName = clientName.trim().split(" ")[0] || clientName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-5" dir="rtl">
      <div className="bg-card rounded-[22px] w-full max-w-[340px] p-6 text-center shadow-2xl animate-fade-up">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/logo.png"
          alt=""
          className="w-14 h-14 rounded-full mx-auto mb-3.5 border-4 border-cream object-cover"
        />
        <div className="text-[16.5px] font-heading font-bold text-brand mb-3.5 text-balance">
          ברוכים הבאים למרחב הליווי האישי שלך
        </div>
        <div className="text-[13px] text-ink leading-relaxed text-right flex flex-col gap-2.5">
          <div>
            שלום <b className="text-brand-dark">{firstName}</b>,
          </div>
          <div>כאן יעלו כל המפגשים וההקלטות, וכל התרגולים שיהיו חלק מתהליך הליווי שלך.</div>
          <div>
            בלשונית <b className="text-brand-dark">&quot;יומן אישי&quot;</b> אפשר לכתוב לעצמך מחשבות ורגעים אישיים,
            וגם להעלות קבצים לשימוש אישי בלבד — מרחב פרטי לגמרי, שרק את/ה רואה.
          </div>
          <div>בפינה למעלה יש סמל של האזור האישי, ולידו פעמון התראות שיעדכן אותך בכל פעם שמשהו חדש עולה.</div>
        </div>
        <Button className="mt-5 w-full" onClick={onConfirm}>
          אישור
        </Button>
      </div>
    </div>
  );
}
