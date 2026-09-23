import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listGames } from "@/server/games/service";
import { listGameLists } from "@/server/lists/service";
import { BacklogView } from "@/features/games/backlog-view";
import { toPlainGame, toPlainGameList } from "@/features/games/mappers";
import {
  parseLibrarySearchParams,
  toLibraryServiceFilters,
} from "@/features/games/user-game-query";

export default async function FavoritosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/backlog/favoritos");
  }
  const initialQuery = parseLibrarySearchParams(await searchParams);
  const [games, lists] = await Promise.all([
    listGames(session.id, {
      ...toLibraryServiceFilters(initialQuery),
      favorite: true,
    }),
    listGameLists(session.id, { page: 1, limit: 100, withCount: false }),
  ]);
  return (
    <BacklogView
      initialGames={games.data.map(toPlainGame)}
      initialPagination={games.pagination}
      initialQuery={initialQuery}
      lists={lists.data.map(toPlainGameList)}
      favorite
      listName="Favoritos"
      emptyMessage="Nenhum jogo favoritado ainda."
    />
  );
}
