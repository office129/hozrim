import { redirect } from "next/navigation";
import { getAdminId } from "@/lib/auth";

export default async function AdminRootPage() {
  const adminId = await getAdminId();
  redirect(adminId ? "/admin/clients" : "/admin/login");
}
