import { redirect } from "next/navigation";
import { getClientId } from "@/lib/auth";
import { LoginForm } from "@/components/client/LoginForm";

// An email/notification link always points here — a client who's still
// logged in on this device (e.g. opening the link on the same phone the
// app is already installed on) should land straight in the app instead
// of being asked to log in again.
export default async function LoginPage() {
  const clientId = await getClientId();
  if (clientId) redirect("/app/home");

  return <LoginForm />;
}
