import { redirect } from "next/navigation";
import { getClientId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClientShell } from "@/components/client/ClientShell";

export default async function ClientAppLayout({ children }: { children: React.ReactNode }) {
  const clientId = await getClientId();
  if (!clientId) redirect("/login");

  // The account this session belonged to may no longer exist (deleted in
  // admin) — redirect rather than crash. Cookies can only be cleared from a
  // Route Handler/Server Action, not a Server Component like this layout,
  // so the stale cookie itself is left to expire naturally; requireClient()
  // clears it the moment any API call is made with it.
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) redirect("/login");

  return (
    <ClientShell clientName={client.name} avatarUrl={client.avatarUrl} showProfileTip={!client.hasSeenProfileTip}>
      {children}
    </ClientShell>
  );
}
