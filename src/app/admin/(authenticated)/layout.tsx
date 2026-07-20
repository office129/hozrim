import { redirect } from "next/navigation";
import { getAdminId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function AdminAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) redirect("/admin/login");

  return <AdminShell adminEmail={admin.email}>{children}</AdminShell>;
}
