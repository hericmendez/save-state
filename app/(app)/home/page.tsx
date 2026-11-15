import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { getUserById } from "@/server/auth/service";
import { getGameStats } from "@/server/stats/service";
import { listGames } from "@/server/games/service";
import { getTop10 } from "@/server/top10/service";
import { getHighlightData } from "@/server/home/service";
import { HomeFeed } from "@/features/activity/home-feed";
import { toPlainGame } from "@/features/games/mappers";
import { HomeSearchForm } from "@/features/home/home-search-form";
import { HomeLibraryStrip } from "@/features/home/home-library-strip";
import {
  buildHighlight,
  drawOne,
  formatShortDate,
  HIGHLIGHT_KINDS,
  pickHighlightKinds,
  takeTopThree,
  type Highlight,
  type HighlightSource,
} from "@/features/home/home-metrics";
import {
  ContinuePlayingSection,
  HighlightsSection,
  TopThreeSection,
} from "@/features/home/home-game-sections";

const SHORTCUTS: Array<{ title: string; description: string; href: string }> = [
  {
    title: "Meus Jogos",
    description: "Ver backlog, favoritos e detalhes dos jogos.",
    href: "/backlog",
  },
  {
    title: "Buscar Jogos",
    description: "Procurar no catálogo e importar para a biblioteca.",
    href: "/catalog",
  },
  {
    title: "Minhas Listas",
    description: "Organizar os jogos em listas personalizadas.",
    href: "/backlog/lists",
  },
  {
    title: "Dashboard",
    description: "Estatísticas e métricas da biblioteca.",
    href: "/dashboard",
  },
];

/**
 * Home — personal hub (Nível 1 → Nível 2 → Nível 3).
 * Server Component reads directly via services — never via internal HTTP.
 *
 * Highlight draw: two distinct kinds picked server-side per page load
 * from the valid ones (no hydration mismatch, no client re-roll).
 */
export default async function HomePage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/home");
  }

  const [user, stats, playingPage, top10, highlightData] = await Promise.all([
    getUserById(session.id),
    getGameStats(session.id, {}),
    listGames(session.id, { page: 1, limit: 3, status: "playing" }),
    getTop10(session.id),
    getHighlightData(session.id),
  ]);

  const username = user?.name ?? "jogador";
  const topThree = takeTopThree(top10).map((game) => toPlainGame(game));

  const highlightSource: HighlightSource = {
    mostHours: highlightData.mostHours
      ? toPlainGame(highlightData.mostHours)
      : null,
    topRated: highlightData.topRated
      ? toPlainGame(highlightData.topRated)
      : null,
    mostFinished: highlightData.mostFinished
      ? toPlainGame(highlightData.mostFinished)
      : null,
    randomFavorite: highlightData.randomFavorite
      ? toPlainGame(highlightData.randomFavorite)
      : null,
    topPlatform: highlightData.topPlatform,
    topGenre: highlightData.topGenre,
    recentFinish: highlightData.recentFinish
      ? {
          game: toPlainGame(highlightData.recentFinish.userGame),
          date: formatShortDate(highlightData.recentFinish.finishedAt),
        }
      : null,
    recentlyAdded: highlightData.recentlyAdded
      ? {
          game: toPlainGame(highlightData.recentlyAdded),
          date: formatShortDate(highlightData.recentlyAdded.createdAt),
        }
      : null,
    wishlist: highlightData.wishlistSpot
      ? toPlainGame(highlightData.wishlistSpot)
      : null,
    bucha:
      drawOne(highlightData.buchaPool.map((game) => toPlainGame(game))) ??
      null,
  };
  const built = new Map(
    HIGHLIGHT_KINDS.map((kind) => [kind, buildHighlight(kind, highlightSource)]),
  );
  const highlights: Highlight[] = pickHighlightKinds(
    HIGHLIGHT_KINDS.filter((kind) => built.get(kind) !== null),
  ).map((kind) => built.get(kind)!);

  return (
    <main className="flex flex-col gap-4">
      {/* Nível 1 — conteúdo principal */}
      <header className="rpgui-container framed-grey p-4">
        <h1 className="font-display text-2xl">Bem-vindo, {username}.</h1>
        <p className="mt-1 text-lg">O que vamos jogar hoje?</p>
        <HomeSearchForm />
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SHORTCUTS.map((shortcut) => (
          <Link
            key={shortcut.href}
            href={shortcut.href}
            className="rpgui-container framed-golden block p-4"
          >
            <h2 className="font-display text-lg">{shortcut.title}</h2>
            <p className="mt-1 text-sm">{shortcut.description}</p>
          </Link>
        ))}
      </div>

      <HomeLibraryStrip stats={stats} />

      {/* Nível 2 — conteúdo pessoal */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ContinuePlayingSection
          games={playingPage.data.map((game) => toPlainGame(game))}
        />
        <TopThreeSection topThree={topThree} />
        <HighlightsSection highlights={highlights} />
      </div>

      {/* Nível 3 — histórico (implementação atual preservada) */}
      <section className="m-5" aria-label="Atividade recente">
        <HomeFeed />
      </section>
    </main>
  );
}
