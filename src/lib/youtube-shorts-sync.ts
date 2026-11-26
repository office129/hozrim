import { prisma } from "@/lib/prisma";
import { fetchChannelShorts } from "@/lib/youtube";
import { youTubeVideoId } from "@/lib/external-links";
import { notifyAllClients } from "@/lib/notifications";

const SHORTS_FOLDER_TITLE = "סרטונים קצרים";

export type ShortsSyncResult = { added: number; total: number } | { error: string };

// Pulls the channel's short-form videos into a "סרטונים קצרים" library
// folder, newest first, skipping any already there. mode "all" scans the
// whole channel once; mode "new" only checks the most recent uploads.
// Used by the admin button and by the hourly cron (/api/cron/youtube-shorts).
export async function syncYouTubeShorts(mode: "all" | "new"): Promise<ShortsSyncResult> {
  const channel = process.env.YOUTUBE_CHANNEL || "@hozrimlebereshit";
  const maxSeconds = Number(process.env.YOUTUBE_SHORTS_MAX_SECONDS ?? 180);

  let shorts;
  try {
    shorts = await fetchChannelShorts({ channel, maxSeconds, maxPages: mode === "all" ? 20 : 2 });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "משיכה מיוטיוב נכשלה" };
  }

  // The shorts folder is virtual — no Drive folder — so the Drive sync job
  // never tries to reconcile or delete these YouTube-link items.
  let folder = await prisma.libraryFolder.findFirst({ where: { title: SHORTS_FOLDER_TITLE } });
  if (!folder) {
    const maxOrder = await prisma.libraryFolder.aggregate({ _max: { order: true } });
    folder = await prisma.libraryFolder.create({
      data: { title: SHORTS_FOLDER_TITLE, order: (maxOrder._max.order ?? -1) + 1 },
    });
  }

  const existing = await prisma.libraryItem.findMany({ where: { folderId: folder.id } });
  const existingIds = new Set(
    existing
      .map((it) => (it.videoFileUrl ? youTubeVideoId(it.videoFileUrl) : null))
      .filter((x): x is string => !!x)
  );

  const toAdd = shorts.filter((v) => !existingIds.has(v.id));
  if (toAdd.length === 0) {
    return { added: 0, total: existing.length };
  }

  // Newest-first overall: the new videos take the lowest numbers and the
  // existing items slide down below them.
  await prisma.$transaction([
    ...existing
      .sort((a, b) => a.number - b.number)
      .map((it, i) => prisma.libraryItem.update({ where: { id: it.id }, data: { number: toAdd.length + i + 1 } })),
    ...toAdd.map((v, i) =>
      prisma.libraryItem.create({
        data: {
          number: i + 1,
          title: v.title || "סרטון קצר",
          folderId: folder!.id,
          videoFileUrl: `https://www.youtube.com/shorts/${v.id}`,
          videoFileName: v.title || null,
        },
      })
    ),
  ]);

  // Let clients know new short videos arrived — one summary notification
  // (in-app + push, no email), not one per video. Best-effort.
  try {
    await notifyAllClients({
      title:
        toAdd.length === 1
          ? "סרטון קצר חדש עלה לאפליקציה 🎬"
          : `${toAdd.length} סרטונים קצרים חדשים עלו לאפליקציה 🎬`,
      link: "/app/roadmap",
    });
  } catch (e) {
    console.error("Failed to notify clients about new shorts", e);
  }

  return { added: toAdd.length, total: existing.length + toAdd.length };
}
