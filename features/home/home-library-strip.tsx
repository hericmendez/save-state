import type { GameStats } from "@/server/stats/service";

function formatInteger(value: number): string {
  return value.toLocaleString("pt-BR");
}

/**
 * Nível 1 — Sua biblioteca. Single shared container (not four cards),
 * no progress bars, no decoration. Extra stats reuse the same
 * getGameStats payload via a native <details> — no new queries.
 */
export function HomeLibraryStrip({ stats }: { stats: GameStats }) {
  const playing = stats.byStatus.playing ?? 0;
  const indicators = [
    { label: "Total de jogos", value: formatInteger(stats.totalGames) },
    { label: "Jogando atualmente", value: formatInteger(playing) },
    { label: "Horas jogadas", value: formatInteger(stats.totalHoursPlayed) },
    { label: "Jogos zerados", value: formatInteger(stats.totalFinished) },
  ];
  return (
    <section
      aria-label="Sua biblioteca"
      className="rpgui-container framed-grey p-4"
    >
      <h2 className="font-display text-lg">Sua biblioteca</h2>
      <div className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4">
        {indicators.map((item) => (
          <div key={item.label}>
            <p className="font-display text-2xl">{item.value}</p>
            <p className="mt-1 text-sm">{item.label}</p>
          </div>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer underline">
          Ver estatísticas adicionais
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="font-display text-xl">
              {formatInteger(stats.totalFavorites)}
            </p>
            <p className="mt-1 text-sm">Favoritos</p>
          </div>
          <div>
            <p className="font-display text-xl">
              {stats.averageRating === null
                ? "—"
                : stats.averageRating.toFixed(1)}
            </p>
            <p className="mt-1 text-sm">Nota média</p>
          </div>
          <div>
            <p className="font-display text-xl">
              {formatInteger(stats.totalTimesFinished)}
            </p>
            <p className="mt-1 text-sm">Vezes finalizado</p>
          </div>
          <div>
            <p className="font-display text-xl">
              {formatInteger(stats.totalFullyCompleted)}
            </p>
            <p className="mt-1 text-sm">100% completados</p>
          </div>
        </div>
      </details>
    </section>
  );
}
