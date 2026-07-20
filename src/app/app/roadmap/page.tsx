import { prisma } from "@/lib/prisma";
import { RoadmapList } from "@/components/client/RoadmapList";

export default async function RoadmapPage() {
  const items = await prisma.libraryItem.findMany({ orderBy: { number: "asc" } });

  return (
    <div className="p-6 md:p-0 animate-fade-up">
      <div className="font-heading font-bold text-[19px] md:text-2xl text-ink mb-1">תחילת התהליך</div>
      <div className="text-[13px] text-muted mb-4 md:mb-6">
        חומרי פתיחה שמחכים לך כבר עכשיו, לפני הפגישה הראשונה
      </div>
      <RoadmapList
        items={items.map((it) => ({
          id: it.id,
          title: it.title,
          hasVideo: !!it.videoFileUrl,
          hasAudio: !!it.audioFileUrl,
          hasFile: !!it.fileUrl,
          videoUrl: it.videoFileUrl,
          audioUrl: it.audioFileUrl,
          fileUrl: it.fileUrl,
          fileName: it.fileName,
        }))}
      />
    </div>
  );
}
