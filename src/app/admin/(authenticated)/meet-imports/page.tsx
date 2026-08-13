import { prisma } from "@/lib/prisma";
import { MeetImportsView } from "@/components/admin/MeetImportsView";
import { getConnection } from "@/lib/google-drive-oauth";

export default async function MeetImportsPage() {
  const [imports, clients, connection] = await Promise.all([
    prisma.meetRecordingImport.findMany({
      where: { status: { in: ["ambiguous", "unmatched", "no_folder"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getConnection(),
  ]);

  return (
    <MeetImportsView
      imports={imports}
      clients={clients}
      ignoreKeywords={connection?.meetIgnoreKeywords ?? ""}
      driveConnected={!!connection}
    />
  );
}
