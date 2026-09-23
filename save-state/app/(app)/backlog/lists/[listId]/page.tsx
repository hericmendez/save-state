import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import { getCurrentSession } from "@/server/auth/session";
import { getGameList, listGamesInList } from "@/server/lists/service";
import { BacklogView } from "@/features/games/backlog-view";
import { listGameLists } from "@/server/lists/service";
import { toPlainGame, toPlainGameList } from "@/features/games/mappers";
import {
  parseLibrarySearchParams,
  toLibraryServiceFilters,
} from "@/features/games/user-game-query";

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let session;
  try {
    session = await getCurrentSession();
  } catch {
    redirect("/login");
  }
  const { listId } = await params;

  let list;
  try {
    list = await getGameList(session.id, listId);
  } catch (error) {
    if (error instanceof ApiError && error.code === "LIST_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const initialQuery = parseLibrarySearchParams(await searchParams);
  const [games, lists] = await Promise.all([
    listGamesInList(
      session.id,
      listId,
      toLibraryServiceFilters(initialQuery),
    ),
    listGameLists(session.id, { page: 1, limit: 100, withCount: false }),
  ]);

  return (
    <BacklogView
      initialGames={games.data.map(toPlainGame)}
      initialPagination={games.pagination}
      initialQuery={initialQuery}
      lists={lists.data.map(toPlainGameList)}
      listId={listId}
      listName={list.name}
      emptyMessage="Esta lista ainda não possui jogos."
    />
  );
}
