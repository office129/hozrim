import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JournalView } from "@/components/client/JournalView";

export default async function JournalPage() {
  const clientId = (await getClientId())!;
  const entries = await prisma.journalEntry.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 md:p-0 pb-8 animate-fade-up md:max-w-2xl">
      <div className="font-heading font-bold text-[19px] md:text-2xl text-ink mb-1">היומן האישי שלי למסע</div>
      <div className="text-[13px] text-muted mb-4 md:mb-6">מרחב פרטי לגמרי — רק את/ה רואה מה שכתוב כאן</div>
      <JournalView
        entries={entries.map((e) => ({
          id: e.id,
          text: e.text,
          date: e.createdAt.toLocaleDateString("he-IL"),
        }))}
      />
    </div>
  );
}
