import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { getGameStats, type Distribution } from "@/server/stats/service";

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 truncate">{label}</span>
      {/*
        data-rpguitype="progress" documents the theme hook, but no RPGUI
        create() call is made here: React renders the fill width directly,
        and running the runtime transform would duplicate the injected
        track/edge/fill nodes inside React-owned DOM (see Phase 7).
      */}
      <div className="rpgui-progress flex-1" data-rpguitype="progress">
        <div className="rpgui-progress-fill" style={{ width: `${width}%` }} />
      </div>
      <span>{value.toLocaleString("pt-BR")}</span>
    </div>
  );
}

function DistributionCard({
  title,
  entries,
  limit = 8,
}: {
  title: string;
  entries: Distribution;
  limit?: number;
}) {
  const sorted = Object.entries(entries)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
  const max = sorted.length > 0 ? sorted[0][1] : 0;
  return (
    <section className="rpgui-container framed-golden p-4">
      <h2 className="font-display mb-3 text-lg">{title}</h2>
      {sorted.length === 0 ? (
        <p>Sem dados ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map(([label, value]) => (
            <Bar key={label} label={label} value={value} max={max} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Dashboard data host. Loads everything through getGameStats directly —
 * never via an internal HTTP call. Visual behavior mirrors the legacy
 * dashboard information using the server-computed view model.
 */
export default async function DashboardPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login");
  }
  const stats = await getGameStats(session.id, {});

  return (
    <main className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Dashboard</h1>
      </header>
      <section className="rpgui-container framed-golden grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        <div>
          <p>Total de jogos</p>
          <p className="font-display text-2xl">{stats.totalGames}</p>
        </div>
        <div>
          <p>Horas jogadas</p>
          <p className="font-display text-2xl">
            {stats.totalHoursPlayed.toLocaleString("pt-BR")}
          </p>
        </div>
        <div>
          <p>Vezes zerado</p>
          <p className="font-display text-2xl">{stats.totalTimesFinished}</p>
        </div>
        <div>
          <p>Nota média</p>
          <p className="font-display text-2xl">
            {stats.averageRating === null
              ? "—"
              : stats.averageRating.toFixed(1)}
          </p>
        </div>
      </section>
      <section className="rpgui-container framed-grey grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        <div>
          <p>Jogos zerados</p>
          <p className="font-display text-2xl">{stats.totalFinished}</p>
        </div>
        <div>
          <p>Favoritos</p>
          <p className="font-display text-2xl">{stats.totalFavorites}</p>
        </div>
        <div>
          <p>100% completados</p>
          <p className="font-display text-2xl">{stats.totalFullyCompleted}</p>
        </div>
        <div>
          <p>Platinas (100%)</p>
          <p className="font-display text-2xl">{stats.totalAchievementsCompleted}</p>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DistributionCard title="Por status" entries={stats.byStatus} limit={10} />
        <DistributionCard title="Gêneros favoritos" entries={stats.byGenre} />
        <DistributionCard title="Plataformas favoritas" entries={stats.byPlatform} />
        <DistributionCard title="Por ano de lançamento" entries={stats.byReleaseYear} limit={10} />
      </div>
    </main>
  );
}
