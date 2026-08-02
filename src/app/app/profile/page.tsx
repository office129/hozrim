import { redirect } from "next/navigation";
import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileView } from "@/components/client/ProfileView";

export default async function ProfilePage() {
  const clientId = (await getClientId())!;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) redirect("/login");

  return (
    <div className="p-6 md:p-0 animate-fade-up md:max-w-md">
      <div className="hidden md:block font-heading font-bold text-2xl text-ink mb-6">האיזור האישי שלי</div>
      <ProfileView email={client.email} name={client.name} avatarUrl={client.avatarUrl} />
    </div>
  );
}
