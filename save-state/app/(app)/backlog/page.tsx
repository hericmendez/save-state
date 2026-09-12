import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { listGames } from "@/server/games/service";
import { listGameLists } from "@/server/lists/service";
import { BacklogView } from "@/features/games/backlog-view";
import { toPlainGame, toPlainGameList } from "@/features/games/mappers";

export default async function BacklogPage() {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login?from=/backlog");
  }

  const [games, lists] = await Promise.all([
    listGames(session.id, { page: 1, limit: 20 }),
    listGameLists(session.id, { page: 1, limit: 100, withCount: false }),
  ]);

  return (
    <BacklogView
      initialGames={games.data.map(toPlainGame)}
      initialPagination={games.pagination}
      lists={lists.data.map(toPlainGameList)}
    />
  );
}
