import { redirect } from "next/navigation";
import { after } from "next/server";
import { getAdminId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/AdminShell";
import { syncMeetImportInBackground } from "@/lib/drive-sync-job";

export default async function AdminAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  // Cookies can't be cleared from a Server Component (only a Route
  // Handler/Server Action) — requireAdmin() clears the stale cookie the
  // moment any API call is made with it.
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) redirect("/admin/login");

  // Runs after this page has already been sent to the browser, so
  // checking for new Meet recordings on every admin navigation doesn't
  // add latency to any of them - results show up on whichever page is
  // opened next.
  after(syncMeetImportInBackground);

  return <AdminShell adminEmail={admin.email}>{children}</AdminShell>;
}
