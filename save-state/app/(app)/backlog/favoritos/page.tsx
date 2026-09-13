import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listGames } from "@/server/games/service";
import { listGameLists } from "@/server/lists/service";
import { BacklogView } from "@/features/games/backlog-view";
import { toPlainGame, toPlainGameList } from "@/features/games/mappers";

export default async function FavoritosPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/backlog/favoritos");
  }
  const [games, lists] = await Promise.all([
    listGames(session.id, { page: 1, limit: 20, favorite: true } as unknown as Parameters<typeof listGames>[1]),
    listGameLists(session.id, { page: 1, limit: 100, withCount: false }),
  ]);
  return (
    <BacklogView
      initialGames={games.data.map(toPlainGame)}
      initialPagination={games.pagination}
      lists={lists.data.map(toPlainGameList)}
      favorite
      listName="Favoritos"
    />
  );
}
