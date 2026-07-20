import { redirect } from "next/navigation";
import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClientShell } from "@/components/client/ClientShell";

export default async function ClientAppLayout({ children }: { children: React.ReactNode }) {
  const clientId = await getClientId();
  if (!clientId) redirect("/login");

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) redirect("/login");

  return <ClientShell clientName={client.name}>{children}</ClientShell>;
}
