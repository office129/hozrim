import { redirect } from "next/navigation";
import { getClientId } from "@/lib/auth";

export default async function RootPage() {
  const clientId = await getClientId();
  redirect(clientId ? "/app/home" : "/login");
}
