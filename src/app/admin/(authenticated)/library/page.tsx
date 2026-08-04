import { prisma } from "@/lib/prisma";
import { LibraryView } from "@/components/admin/LibraryView";
import { syncLibraryFolders } from "@/lib/drive-sync-job";

export default async function LibraryPage() {
  // Best-effort: catches up on anything created/removed by hand in the
  // library's Drive folders since the last daily sync. A failure (Drive
  // down, not connected) shouldn't block the page from loading.
  await syncLibraryFolders().catch((e) => console.error("Failed to sync library Drive folders", e));

  const [items, folders] = await Promise.all([
    prisma.libraryItem.findMany({ where: { folderId: null }, orderBy: { number: "asc" } }),
    prisma.libraryFolder.findMany({
      orderBy: { order: "asc" },
      include: { items: { orderBy: { number: "asc" } } },
    }),
  ]);
  return <LibraryView items={items} folders={folders} />;
}
