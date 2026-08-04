import { getClientId, isPreviewClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JournalView } from "@/components/client/JournalView";

export default async function JournalPage() {
  const clientId = (await getClientId())!;

  // Fully private, even from a coach preview link - shown to no one but
  // the client themselves.
  if (await isPreviewClientSession()) {
    return (
      <div className="p-6 md:p-0 pb-8 animate-fade-up md:max-w-2xl">
        <div className="font-heading font-bold text-[19px] md:text-2xl text-ink mb-1">היומן האישי שלי למסע</div>
        <div className="text-[13px] text-muted">היומן האישי פרטי ואינו זמין בתצוגה מקדימה</div>
      </div>
    );
  }

  const [entries, groups] = await Promise.all([
    prisma.journalEntry.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    prisma.personalUploadGroup.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: { files: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

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
        groups={groups.map((g) => ({
          id: g.id,
          title: g.title,
          files: g.files.map((f) => ({ id: f.id, url: f.url, fileName: f.fileName, mediaType: f.mediaType })),
        }))}
      />
    </div>
  );
}
