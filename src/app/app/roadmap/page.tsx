import { prisma } from "@/lib/prisma";
import { RoadmapList } from "@/components/client/RoadmapList";

function toItem(it: {
  id: string;
  title: string;
  videoFileUrl: string | null;
  audioFileUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
}) {
  return {
    id: it.id,
    title: it.title,
    hasVideo: !!it.videoFileUrl,
    hasAudio: !!it.audioFileUrl,
    hasFile: !!it.fileUrl,
    videoUrl: it.videoFileUrl,
    audioUrl: it.audioFileUrl,
    fileUrl: it.fileUrl,
    fileName: it.fileName,
  };
}

export default async function RoadmapPage() {
  const [items, folders] = await Promise.all([
    prisma.libraryItem.findMany({ where: { folderId: null }, orderBy: { number: "asc" } }),
    prisma.libraryFolder.findMany({
      orderBy: { order: "asc" },
      include: { items: { orderBy: { number: "asc" } } },
    }),
  ]);

  return (
    <div className="p-6 md:p-0 animate-fade-up">
      <div className="font-heading font-bold text-[19px] md:text-2xl text-ink mb-1">תחילת התהליך</div>
      <div className="text-[13px] text-muted mb-4 md:mb-6">
        חומרי פתיחה שמחכים לך כבר עכשיו, לפני הפגישה הראשונה
      </div>
      <RoadmapList
        items={items.map(toItem)}
        folders={folders.map((f) => ({ id: f.id, title: f.title, items: f.items.map(toItem) }))}
      />
    </div>
  );
}
