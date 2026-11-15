import { topEntries, type DashboardDistributionDef } from "./dashboard-metrics";
import type { GameStats } from "@/server/stats/service";
import { getStatusLabel } from "@/features/games/status-labels";

/**
 * Frequency lists as compact tables: category left, count right.
 * framed-grey separation only, no progress bars, no fill indicators,
 * no decoration. Preserves existing aggregation + ordering rules
 * (count desc).
 */
export function DashboardDistribution({
  def,
  stats,
}: {
  def: DashboardDistributionDef;
  stats: GameStats;
}) {
  const raw = topEntries(def.select(stats));
  const entries: [string, number][] =
    def.id === "status"
      ? raw.map(
          ([label, value]) =>
            [getStatusLabel(label), value] as [string, number],
        )
      : raw;
  return (
    <section className="rpgui-container framed-grey p-4">
      <h2 className="font-display mb-3 text-lg">{def.title}</h2>
      {entries.length === 0 ? (
        <p>Sem dados ainda.</p>
      ) : (
        <dl className="flex flex-col">
          {entries.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b border-white/10 py-1.5 last:border-b-0"
            >
              <dt className="min-w-0 truncate">{label}</dt>
              <dd className="font-display shrink-0 tabular-nums">
                {value.toLocaleString("pt-BR")}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
