import { prisma } from "@/lib/prisma";
import { LibraryView } from "@/components/admin/LibraryView";

export default async function LibraryPage() {
  const items = await prisma.libraryItem.findMany({ orderBy: { number: "asc" } });
  return <LibraryView items={items} />;
}
