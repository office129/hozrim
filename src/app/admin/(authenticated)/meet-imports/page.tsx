import { prisma } from "@/lib/prisma";
import { MeetImportsView } from "@/components/admin/MeetImportsView";

export default async function MeetImportsPage() {
  const [imports, clients] = await Promise.all([
    prisma.meetRecordingImport.findMany({
      where: { status: { in: ["ambiguous", "unmatched", "no_folder"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return <MeetImportsView imports={imports} clients={clients} />;
}
