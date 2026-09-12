import { ApiError } from "@/lib/api-error";
import { getCurrentSession } from "@/server/auth/session";
import { getGameStats } from "@/server/stats/service";

/**
 * Minimal dashboard data host (Phase 4).
 *
 * This Server Component loads its data directly from the stats service —
 * never via an internal HTTP call to its own Route Handlers. Visual
 * migration of the dashboard belongs to Phase 6; this page only proves
 * the server-side data flow.
 */
export default async function DashboardPage() {
  let stats;
  try {
    const session = await getCurrentSession();
    stats = await getGameStats(session.id, {});
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") {
      return (
        <main>
          <h1>Dashboard</h1>
          <p>Authentication required.</p>
        </main>
      );
    }
    throw error;
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <dl>
        <div>
          <dt>Total games</dt>
          <dd>{stats.totalGames}</dd>
        </div>
        <div>
          <dt>Total hours played</dt>
          <dd>{stats.totalHoursPlayed}</dd>
        </div>
        <div>
          <dt>Average rating</dt>
          <dd>{stats.averageRating ?? "—"}</dd>
        </div>
      </dl>
    </main>
  );
}
