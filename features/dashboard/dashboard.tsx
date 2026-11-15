import type { GameStats } from "@/server/stats/service";
import {
  DISTRIBUTIONS,
  PRIMARY_CARDS,
  SECONDARY_CARDS,
  isEmptyDashboard,
} from "./dashboard-metrics";
import { DashboardStatCard } from "./dashboard-stat-card";
import { DashboardDistribution } from "./dashboard-distribution";

/**
 * Dashboard composition (Server Component): summary of the personal
 * library, fed by getGameStats directly — never via internal HTTP.
 */
export function Dashboard({ stats }: { stats: GameStats }) {
  return (
    <main className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Dashboard</h1>
      </header>
      {isEmptyDashboard(stats) && (
        <p className="rpgui-container framed-grey p-4">
          Sua biblioteca ainda está vazia. Adicione seu primeiro jogo em Minha
          Biblioteca → Novo Jogo.
        </p>
      )}
      <section className="rpgui-container framed-grey grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        {PRIMARY_CARDS.map((def) => (
          <DashboardStatCard key={def.id} def={def} stats={stats} />
        ))}
      </section>
      <section className="rpgui-container framed-grey grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        {SECONDARY_CARDS.map((def) => (
          <DashboardStatCard key={def.id} def={def} stats={stats} />
        ))}
      </section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {DISTRIBUTIONS.map((def) => (
          <DashboardDistribution key={def.id} def={def} stats={stats} />
        ))}
      </div>
    </main>
  );
}
