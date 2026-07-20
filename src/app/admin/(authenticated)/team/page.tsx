import { prisma } from "@/lib/prisma";
import { getAdminId } from "@/lib/auth";
import { TeamView } from "@/components/admin/TeamView";

export default async function TeamPage() {
  const currentAdminId = (await getAdminId())!;
  const admins = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <TeamView
      currentAdminId={currentAdminId}
      admins={admins.map((a) => ({ id: a.id, email: a.email, name: a.name }))}
    />
  );
}
