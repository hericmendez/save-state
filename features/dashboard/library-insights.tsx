import type { PersonalStatistics } from "@/server/stats/service";
import { buildLibraryInsights } from "./statistics-insights";

/**
 * "Descobertas da biblioteca" — server-rendered observations derived from the
 * already-aggregated personal statistics. No client state, no extra query.
 */
export function LibraryInsights({ stats }: { stats: PersonalStatistics }) {
  const insights = buildLibraryInsights(stats);
  return (
    <section className="rpgui-container framed-grey min-w-0 p-4" aria-labelledby="stats-insights">
      <h2 id="stats-insights" className="font-display mb-1 text-[1rem]">
        Descobertas da biblioteca
      </h2>
      <p className="mb-3 text-sm">Observações calculadas a partir dos dados que você registrou.</p>
      {insights.length === 0 ? (
        <p className="text-sm">
          Ainda não há descobertas suficientes. Registre mais jogos, avaliações ou horas para
          que padrões possam ser observados.
        </p>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight) => (
            <li key={insight.id} className="min-w-0 border-l-2 border-amber-400/70 pl-3">
              <h3 className="font-display mb-1 text-[0.85rem] font-semibold leading-snug text-balance break-words">
                {insight.title}
              </h3>
              <p className="text-sm leading-relaxed break-words">{insight.description}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
