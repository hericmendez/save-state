import { GAME_STATUSES } from "@/schemas/games";
import type { PersonalStatistics } from "@/server/stats/service";
import { getStatusLabel } from "@/features/games/status-labels";
import { LibraryInsights } from "./library-insights";
import {
  formatAverageRating,
  formatHours,
  formatInteger,
  formatPercent,
  formatRating,
  gamesLabel,
  plural,
} from "./statistics-format";

function Empty({ children }: { children: string }) {
  return <p className="text-sm">{children}</p>;
}

function Bar({ ratio, tone, label }: { ratio: number; tone: string; label: string }) {
  const width = Math.max(0, Math.min(100, Number.isFinite(ratio) ? ratio * 100 : 0));
  return (
    <div className="h-2 bg-black/50" role="img" aria-label={label}>
      <div className={`h-full ${tone}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function StatusModule({ stats }: { stats: PersonalStatistics }) {
  const rows = GAME_STATUSES.map((status) => ({
    status,
    count: stats.byStatus[status] ?? 0,
  }));
  const positive = rows
    .filter((row) => row.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        GAME_STATUSES.indexOf(a.status) - GAME_STATUSES.indexOf(b.status),
    );
  const empty = rows.filter((row) => row.count === 0);
  const backlog = stats.byStatus.backlog ?? 0;

  return (
    <section className="rpgui-container framed-grey min-w-0 p-4" aria-labelledby="stats-status">
      <h2 id="stats-status" className="font-display mb-3 text-[1rem]">
        Status da biblioteca
      </h2>
      {stats.totalGames === 0 ? (
        <Empty>Sua biblioteca ainda está vazia.</Empty>
      ) : (
        <>
          <p className="mb-3 text-sm">
            {backlog > 0
              ? `${formatInteger(backlog)} de ${gamesLabel(stats.totalGames)} ${plural(backlog, "está", "estão")} no Backlog.`
              : "A distribuição atual da sua biblioteca:"}
          </p>
          <ul className="space-y-2">
            {positive.map(({ status, count }) => {
              const label = getStatusLabel(status);
              // All status bars share the library total as denominator, so a
              // 30/34 backlog is visibly ~88% instead of a full-width bar.
              const ratio = stats.totalGames > 0 ? count / stats.totalGames : 0;
              const pct = formatPercent(ratio);
              return (
                <li key={status}>
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="min-w-0 break-words">{label}</span>
                    <strong className="shrink-0 tabular-nums">
                      {formatInteger(count)} · {pct}
                    </strong>
                  </div>
                  <Bar
                    ratio={ratio}
                    tone="bg-amber-400"
                    label={`${label}: ${formatInteger(count)} de ${gamesLabel(stats.totalGames)}, ${pct}`}
                  />
                </li>
              );
            })}
          </ul>
          {empty.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer">
                Mostrar outros {empty.length} status
              </summary>
              <ul className="mt-2 space-y-1">
                {empty.map(({ status }) => (
                  <li key={status} className="flex justify-between gap-2">
                    <span className="min-w-0 break-words">{getStatusLabel(status)}</span>
                    <span className="shrink-0 tabular-nums">0 · 0,0%</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="mt-3 text-sm">Total: {gamesLabel(stats.totalGames)}</p>
        </>
      )}
    </section>
  );
}

function RatingModule({ stats }: { stats: PersonalStatistics }) {
  const ratings = Object.entries(stats.byRating)
    .map(([rating, count]) => ({ rating: Number(rating), count }))
    .sort((a, b) => a.rating - b.rating);
  const maxRating = Math.max(1, ...ratings.map((row) => row.count));
  const coverage = stats.totalGames > 0 ? stats.ratedGames / stats.totalGames : 0;

  return (
    <section className="rpgui-container framed-grey min-w-0 p-4" aria-labelledby="stats-rating">
      <h2 id="stats-rating" className="font-display mb-3 text-[1rem]">
        Distribuição de notas
      </h2>
      {stats.totalGames === 0 ? (
        <Empty>Sua biblioteca ainda está vazia.</Empty>
      ) : (
        <>
          <div className="mb-3">
            <p className="text-sm">
              {formatInteger(stats.ratedGames)} de {gamesLabel(stats.totalGames)}{" "}
              {plural(stats.ratedGames, "avaliado", "avaliados")}
            </p>
            <p className="mb-1 text-sm">Cobertura: {formatPercent(coverage)}</p>
            <Bar
              ratio={coverage}
              tone="bg-emerald-400"
              label={`Cobertura de avaliações: ${formatInteger(stats.ratedGames)} de ${gamesLabel(stats.totalGames)}, ${formatPercent(coverage)}`}
            />
            <p className="mt-1 text-sm">
              {formatInteger(stats.unratedGames)}{" "}
              {plural(stats.unratedGames, "jogo sem nota", "jogos sem nota")}
            </p>
            {stats.ratedGames > 0 && stats.averageRating !== null && (
              <p className="mt-2 text-sm">
                Média: {formatAverageRating(stats.averageRating)}/10 entre{" "}
                {gamesLabel(stats.ratedGames)}{" "}
                {plural(stats.ratedGames, "avaliado", "avaliados")}.
              </p>
            )}
          </div>
          {ratings.length === 0 ? (
            <Empty>Nenhum jogo avaliado ainda.</Empty>
          ) : (
            <>
              <p className="mb-2 text-sm">
                Distribuição das notas registradas ({formatInteger(stats.ratedGames)}{" "}
                {plural(stats.ratedGames, "jogo avaliado", "jogos avaliados")}):
              </p>
              <ul className="space-y-2">
                {ratings.map(({ rating, count }) => {
                  const pct = formatPercent(
                    stats.ratedGames > 0 ? count / stats.ratedGames : 0,
                  );
                  return (
                    <li key={rating}>
                      <div className="mb-1 flex justify-between gap-2">
                        <span>Nota {formatRating(rating)}/10</span>
                        <strong className="shrink-0 tabular-nums">
                          {formatInteger(count)} · {pct}
                        </strong>
                      </div>
                      <Bar
                        ratio={count / maxRating}
                        tone="bg-emerald-400"
                        label={`Nota ${formatRating(rating)}: ${formatInteger(count)} de ${gamesLabel(stats.ratedGames)} avaliados, ${pct}`}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function HoursModule({ stats }: { stats: PersonalStatistics }) {
  return (
    <section className="rpgui-container framed-grey min-w-0 p-4" aria-labelledby="stats-hours">
      <h2 id="stats-hours" className="font-display mb-3 text-[1rem]">
        Mais horas registradas
      </h2>
      {stats.gamesWithHours === 0 || stats.topHours.length === 0 ? (
        <Empty>Nenhum registro disponível ainda.</Empty>
      ) : (
        <>
          <p className="mb-3 text-sm">
            {formatHours(stats.totalHours)}{" "}
            {plural(stats.totalHours, "hora", "horas")} em {gamesLabel(stats.gamesWithHours)}
          </p>
          <ol className="space-y-2">
            {stats.topHours.map((row, index) => {
              const pct = formatPercent(
                stats.totalHours > 0 ? row.value / stats.totalHours : 0,
              );
              return (
                <li key={`${row.name}-${index}`}>
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="min-w-0 break-words">
                      {index + 1}. {row.name}
                    </span>
                    <strong className="shrink-0 tabular-nums">
                      {formatHours(row.value)} h · {pct}
                    </strong>
                  </div>
                  <Bar
                    ratio={stats.totalHours > 0 ? row.value / stats.totalHours : 0}
                    tone="bg-amber-400"
                    label={`${row.name}: ${formatHours(row.value)} horas, ${pct} do total registrado`}
                  />
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-sm">
            Barras proporcionais ao total de horas registradas.
          </p>
          {stats.gamesWithHours > stats.topHours.length && (
            <p className="mt-1 text-sm">
              Top {stats.topHours.length}: as participações exibidas não somam 100% do total
              registrado.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function FinishedModule({ stats }: { stats: PersonalStatistics }) {
  return (
    <section className="rpgui-container framed-grey min-w-0 p-4" aria-labelledby="stats-finished">
      <h2 id="stats-finished" className="font-display mb-3 text-[1rem]">
        Mais conclusões registradas
      </h2>
      {stats.gamesWithTimesFinished === 0 || stats.topFinished.length === 0 ? (
        <Empty>Nenhum registro disponível ainda.</Empty>
      ) : (
        <>
          <p className="mb-3 text-sm">
            {formatInteger(stats.totalTimesFinished)}{" "}
            {plural(stats.totalTimesFinished, "conclusão", "conclusões")} em{" "}
            {gamesLabel(stats.gamesWithTimesFinished)}
          </p>
          <ol className="space-y-2">
            {stats.topFinished.map((row, index) => (
              <li
                key={`${row.name}-${index}`}
                className="flex justify-between gap-3 border-b border-white/20 pb-2"
              >
                <span className="min-w-0 break-words">
                  {index + 1}. {row.name}
                </span>
                <strong className="shrink-0 tabular-nums">
                  {formatInteger(row.value)}×
                </strong>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-3 text-sm">
        {stats.finishedGames === 0
          ? "Nenhum jogo está atualmente no status Finalizado."
          : `No status Finalizado: ${gamesLabel(stats.finishedGames)}; ${formatInteger(stats.finishedWithoutCompletion)} sem conclusão registrada no contador.`}
      </p>
      <p className="mt-1 text-sm">
        {stats.finishedWithoutCompletion > 0
          ? "O contador de conclusões é independente do status e permanece editável."
          : "Status e contador são informações independentes."}
      </p>
    </section>
  );
}

export function Dashboard({ stats }: { stats: PersonalStatistics }) {
  return (
    <main className="flex flex-col gap-4">
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-[1.3rem]">Estatísticas</h1>
        <p className="mt-1">Explore os padrões da sua biblioteca pessoal.</p>
      </header>
      <LibraryInsights stats={stats} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <StatusModule stats={stats} />
        <RatingModule stats={stats} />
        <HoursModule stats={stats} />
        <FinishedModule stats={stats} />
      </div>
    </main>
  );
}
