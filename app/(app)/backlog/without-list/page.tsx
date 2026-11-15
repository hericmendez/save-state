import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listGames } from "@/server/games/service";
import { listGameCollections } from "@/server/collections/service";
import { BacklogView } from "@/features/games/backlog-view";
import { toPlainGame, toPlainGameCollection } from "@/features/games/mappers";
import {
  parseLibrarySearchParams,
  toLibraryServiceFilters,
} from "@/features/games/user-game-query";

/**
 * Derived "Sem coleção" view (collectionIds.length === 0 via
 * withoutCollection=true). No persisted GameCollection; same UserGame
 * infrastructure as Jogos and Favoritos.
 */
export default async function SemListaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/backlog/without-list");
  }
  const initialQuery = parseLibrarySearchParams(await searchParams);
  const [games, collections] = await Promise.all([
    listGames(session.id, {
      ...toLibraryServiceFilters(initialQuery),
      withoutCollection: true,
    }),
    listGameCollections(session.id, { page: 1, limit: 100, withCount: false }),
  ]);
  return (
    <BacklogView
      initialGames={games.data.map(toPlainGame)}
      initialPagination={games.pagination}
      initialQuery={initialQuery}
      collections={collections.data.map(toPlainGameCollection)}
      withoutCollection
      listName="Sem coleção"
      emptyMessage="Nenhum jogo sem coleção. Todos os seus jogos estão em alguma coleção."
    />
  );
}
