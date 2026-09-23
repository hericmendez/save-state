import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { getGameStats } from "@/server/stats/service";
import { Dashboard } from "@/features/dashboard/dashboard";

/**
 * Dashboard data host. Loads everything through getGameStats directly —
 * never via an internal HTTP call.
 */
export default async function DashboardPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/dashboard");
  }
  const stats = await getGameStats(session.id, {});

  return <Dashboard stats={stats} />;
}
