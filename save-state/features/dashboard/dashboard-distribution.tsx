import RPGUIPRogressBar from "@/components/RPGUI/ProgressBar";
import {
  maxEntryValue,
  topEntries,
  type DashboardDistributionDef,
} from "./dashboard-metrics";
import type { GameStats } from "@/server/stats/service";
import { getStatusLabel } from "@/features/games/status-labels";

type ProgressBarColor = "blue" | "red" | "green" | "purple";

/** Fixed rotation (deterministic across renders, unlike random shuffle). */
const BAR_COLORS: ProgressBarColor[] = ["blue", "red", "green", "purple"];

export function DashboardDistribution({
  def,
  stats,
}: {
  def: DashboardDistributionDef;
  stats: GameStats;
}) {
  const rawEntries = topEntries(def.select(stats), def.limit);
  const entries: [string, number][] =
    def.id === "status"
      ? rawEntries.map(([label, value]) => [getStatusLabel(label), value] as [string, number])
      : rawEntries;
  const max = maxEntryValue(entries);
  return (
    <section className="rpgui-container framed-golden p-4">
      <h2 className="font-display mb-3 text-lg">{def.title}</h2>
      {entries.length === 0 ? (
        <p>Sem dados ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(([label, value], index) => (
            <RPGUIPRogressBar
              key={label}
              label={label}
              value={value}
              max={max}
              color={BAR_COLORS[index % BAR_COLORS.length]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
