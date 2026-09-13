import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { getUserById, toSafeUser } from "@/server/auth/service";
import { SettingsView } from "@/features/settings/settings-view";

export default async function SettingsPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/settings");
  }
  const user = await getUserById(session.id);
  if (!user) redirect("/login");
  return <SettingsView initialUsername={toSafeUser(user).name} />;
}
