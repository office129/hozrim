import { getClientsOverview } from "@/lib/admin-data";
import { ClientsListView } from "@/components/admin/ClientsListView";

export default async function ClientsPage() {
  const clients = await getClientsOverview();
  return <ClientsListView initialClients={clients} />;
}
