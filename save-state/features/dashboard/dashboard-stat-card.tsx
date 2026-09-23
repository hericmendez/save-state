import type { DashboardCardDef } from "./dashboard-metrics";
import type { GameStats } from "@/server/stats/service";

export function DashboardStatCard({
  def,
  stats,
}: {
  def: DashboardCardDef;
  stats: GameStats;
}) {
  return (
    <div>
      <p>{def.label}</p>
      <p className="font-display text-2xl">{def.format(stats)}</p>
    </div>
  );
}
