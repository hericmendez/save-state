import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { SettingsView } from "@/features/settings/settings-view";

export default async function SettingsPage() {
  try {
    await getCurrentSession();
  } catch {
    redirect("/login?from=/settings");
  }
  return <SettingsView />;
}
